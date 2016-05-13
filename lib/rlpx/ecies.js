const crypto = require('crypto')
const secp256k1 = require('secp256k1')
const xor = require('buffer-xor')
const rlp = require('rlp')
const util = require('../util')
const MAC = require('./mac')

function assertEq (buffer1, buffer2, msg) {
  if (!buffer1.equals(buffer2)) throw new Error(msg)
}

function genPrivateKey () {
  while (true) {
    let privateKey = crypto.randomBytes(32)
    if (secp256k1.privateKeyVerify(privateKey)) return privateKey
  }
}

function ecdh (publicKey, privateKey) {
  // return (publicKey * privateKey).x
  return secp256k1.ecdhUnsafe(publicKey, privateKey, true).slice(1)
}

// a straigth rip from python interop w/go ecies implementation
// for sha3, blocksize is 136 bytes
// for sha256, blocksize is 64 bytes
// NIST SP 800-56a Concatenation Key Derivation Function (see section 5.8.1).
// https://github.com/ethereum/pydevp2p/blob/master/devp2p/crypto.py#L295
// https://github.com/ethereum/go-ethereum/blob/fe532a98f9f32bb81ef0d8d013cf44327830d11e/crypto/ecies/ecies.go#L165
// https://github.com/ethereum/cpp-ethereum/blob/develop/libdevcrypto/CryptoPP.cpp#L36
function concatKDF (keyMaterial, keyLength) {
  let SHA256BlockSize = 64
  let reps = ((keyLength + 7) * 8) / (SHA256BlockSize * 8)

  let buffers = []
  for (let counter = 0, tmp = new Buffer(4); counter <= reps;) {
    counter += 1
    tmp.writeUInt32BE(counter)
    buffers.push(crypto.createHash('sha256').update(tmp).update(keyMaterial).digest())
  }

  return Buffer.concat(buffers).slice(0, keyLength)
}

function ECIES (privateKey, id, remoteId) {
  this._privateKey = privateKey
  this._publicKey = util.id2pk(id)
  this._remotePublicKey = remoteId ? util.id2pk(remoteId) : null

  this._nonce = crypto.randomBytes(32)
  this._remoteNonce = null

  this._initMsg = null
  this._remoteInitMsg = null

  this._ingressAes = null
  this._egressAes = null

  this._ingressMac = null
  this._egressMac = null

  this._ephemeralPrivateKey = genPrivateKey()
  this._ephemeralPublicKey = secp256k1.publicKeyCreate(this._ephemeralPrivateKey, false)
  this._remoteEphemeralPublicKey = null // we don't need store this key, but why don't?
  this._ephemeralSharedSecret = null

  this._bodySize = null
}

ECIES.prototype._encryptMessage = function (data) {
  let privateKey = genPrivateKey()
  let x = ecdh(this._remotePublicKey, privateKey)
  let key = concatKDF(x, 32)
  let ekey = key.slice(0, 16) // encryption key
  let mkey = crypto.createHash('sha256').update(key.slice(16, 32)).digest() // MAC key

  // encrypt
  let IV = new Buffer(16).fill(0x00)
  let cipher = crypto.createCipheriv('aes-128-ctr', ekey, IV)
  let encryptedData = cipher.update(data)
  let dataIV = Buffer.concat([ IV, encryptedData ])

  // create tag
  let tag = crypto.createHmac('sha256', mkey).update(dataIV).digest()

  let publicKey = secp256k1.publicKeyCreate(privateKey, false)
  return Buffer.concat([ publicKey, dataIV, tag ])
}

ECIES.prototype._decryptMessage = function (data) {
  let publicKey = data.slice(0, 65)
  let dataIV = data.slice(65, -32)
  let tag = data.slice(-32)

  // derive keys
  let x = ecdh(publicKey, this._privateKey)
  let key = concatKDF(x, 32)
  let ekey = key.slice(0, 16) // encryption key
  let mkey = crypto.createHash('sha256').update(key.slice(16, 32)).digest() // MAC key

  // check the tag
  let _tag = crypto.createHmac('sha256', mkey).update(dataIV).digest()
  assertEq(_tag, tag, 'should have valid tag')

  // decrypt data
  let IV = dataIV.slice(0, 16)
  let encryptedData = dataIV.slice(16)
  let decipher = crypto.createDecipheriv('aes-128-ctr', ekey, IV)
  return decipher.update(encryptedData)
}

ECIES.prototype._setupFrame = function (remoteData, incoming) {
  let nonceMaterial = incoming
    ? Buffer.concat([ this._nonce, this._remoteNonce ])
    : Buffer.concat([ this._remoteNonce, this._nonce ])
  let hNonce = util.keccak256(nonceMaterial)

  let IV = new Buffer(16).fill(0x00)
  let sharedSecret = util.keccak256(Buffer.concat([ this._ephemeralSharedSecret, hNonce ]))

  let aesSecret = util.keccak256(Buffer.concat([ this._ephemeralSharedSecret, sharedSecret ]))
  this._ingressAes = crypto.createDecipheriv('aes-256-ctr', aesSecret, IV)
  this._egressAes = crypto.createDecipheriv('aes-256-ctr', aesSecret, IV)

  let macSecret = util.keccak256(Buffer.concat([ this._ephemeralSharedSecret, aesSecret ]))
  this._ingressMac = new MAC(macSecret)
  this._ingressMac.update(Buffer.concat([ xor(macSecret, this._nonce), remoteData ]))
  this._egressMac = new MAC(macSecret)
  this._egressMac.update(Buffer.concat([ xor(macSecret, this._remoteNonce), this._initMsg ]))
}

ECIES.prototype.createAuth = function () {
  let x = ecdh(this._remotePublicKey, this._privateKey)
  let sig = secp256k1.sign(xor(x, this._nonce), this._ephemeralPrivateKey)
  let data = Buffer.concat([
    sig.signature,
    new Buffer([ sig.recovery ]),
    util.keccak256(util.pk2id(this._ephemeralPublicKey)),
    util.pk2id(this._publicKey),
    this._nonce,
    new Buffer([ 0x00 ])
  ])

  this._initMsg = this._encryptMessage(data)
  return this._initMsg
}

ECIES.prototype.parseAuth = function (data) {
  this._remoteInitMsg = data
  let decypted = this._decryptMessage(data)
  if (decypted.length !== 194) throw new Error('invalid packet length')

  // parse packet
  let signature = decypted.slice(0, 64)
  let recovery = decypted[64]
  let heid = decypted.slice(65, 97) // 32 bytes
  this._remotePublicKey = util.id2pk(decypted.slice(97, 161))  // 64 bytes
  this._remoteNonce = decypted.slice(161, 193) // 32 bytes
  if (decypted[193] !== 0) throw new Error('invalid postfix')

  let x = ecdh(this._remotePublicKey, this._privateKey)
  this._remoteEphemeralPublicKey = secp256k1.recover(xor(x, this._remoteNonce), signature, recovery, false)
  this._ephemeralSharedSecret = ecdh(this._remoteEphemeralPublicKey, this._ephemeralPrivateKey)

  let _heid = util.keccak256(util.pk2id(this._remoteEphemeralPublicKey))
  assertEq(_heid, heid, 'the hash of the ephemeral key should match')
}

ECIES.prototype.createAck = function () {
  let data = Buffer.concat([
    util.pk2id(this._ephemeralPublicKey),
    this._nonce,
    new Buffer([ 0x00 ])
  ])

  this._initMsg = this._encryptMessage(data)
  this._setupFrame(this._remoteInitMsg, true)
  return this._initMsg
}

ECIES.prototype.parseAck = function (data) {
  let decypted = this._decryptMessage(data)
  if (decypted.length !== 97) throw new Error('invalid packet length')

  // parse packet
  this._remoteEphemeralPublicKey = util.id2pk(decypted.slice(0, 64))
  this._remoteNonce = decypted.slice(64, 96)
  if (decypted[96] !== 0) throw new Error('invalid postfix')

  this._ephemeralSharedSecret = ecdh(this._remoteEphemeralPublicKey, this._ephemeralPrivateKey)
  this._setupFrame(data, false)
}

ECIES.prototype.createHeader = function (size) {
  size = util.zfill(util.int2buffer(size), 3)
  let header = Buffer.concat([ size, rlp.encode([ 0, 0 ]) ]) // TODO: the rlp will contain something else someday
  header = util.zfill(header, 16, false)
  header = this._egressAes.update(header)

  this._egressMac.updateHeader(header)
  let tag = this._egressMac.digest()

  return Buffer.concat([ header, tag ])
}

ECIES.prototype.parseHeader = function (data) {
  // parse header
  let header = data.slice(0, 16)
  let mac = data.slice(16, 32)

  this._ingressMac.updateHeader(header)
  let _mac = this._ingressMac.digest()
  assertEq(_mac, mac, 'Invalid MAC')

  header = this._ingressAes.update(header)
  this._bodySize = util.buffer2int(header.slice(0, 3))
  return this._bodySize
}

ECIES.prototype.createBody = function (data) {
  data = util.zfill(data, Math.ceil(data.length / 16) * 16, false)
  let encryptedData = this._egressAes.update(data)
  this._egressMac.updateBody(encryptedData)
  let tag = this._egressMac.digest()
  return Buffer.concat([ encryptedData, tag ])
}

ECIES.prototype.parseBody = function (data) {
  if (!this._bodySize) throw new Error('need to parse header first')

  let body = data.slice(0, -16)
  let mac = data.slice(-16)
  this._ingressMac.updateBody(body)
  let _mac = this._ingressMac.digest()
  assertEq(_mac, mac, 'Invalid MAC')

  let size = this._bodySize
  this._bodySize = false
  return this._ingressAes.update(body).slice(0, size)
}

module.exports = ECIES
