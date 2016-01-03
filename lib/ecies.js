var crypto = require('crypto')
var assert = require('assert')
var ecurve = require('ecurve')
var BigInt = require('bigi')
var ecdsa = require('secp256k1')
var ethUtil = require('ethereumjs-util')
var xor = require('bitwise-xor')
var rlp = require('rlp')
var Mac = require('./mac.js')

var ECIES = module.exports = function (secKey, pubKey, remotePubKey) {
  this.secKey = secKey
  this.pubKey = pubKey
  this.remotePubKey = remotePubKey
  this.ephemeralSecKey = crypto.randomBytes(32)
  this.ephemeralPubKey = ecdsa.publicKeyConvert(ecdsa.publicKeyCreate(this.ephemeralSecKey), false)
  this.nonce = crypto.randomBytes(32)
  this.ingressMac = new Mac()
  this.egressMac = new Mac()
  this.initiator = true // did this peer start the connection
  this.token = ''

  Object.defineProperty(this, 'ephemeralSecret', {
    get: function () {
      if (!this._ephShared) {
        this._ephShared = ECIES.ecdh(this.ephemeralSecKey, Buffer.concat([new Buffer([4]), this.remoteEphemeralPubKey]))
      }
      return this._ephShared
    }
  })
}

ECIES.ecdh = function (secKey, pubKey) {
  var curve = ecurve.getCurveByName('secp256k1')
  var d = BigInt.fromBuffer(secKey)
  var Q = ecurve.Point.decodeFrom(curve, pubKey)
  var r = Q.multiply(d).getEncoded(true)
  return r.slice(1)
}

/**
 * a straigth rip from python interop w/go ecies implementation
 * for sha3, blocksize is 136 bytes
 * for sha256, blocksize is 64 bytes
 * NIST SP 800-56a Concatenation Key Derivation Function (see section 5.8.1).
 * https://github.com/ethereum/pydevp2p/blob/master/devp2p/crypto.py#L295
 * https://github.com/ethereum/go-ethereum/blob/develop/crypto/ecies/ecies.go#L134
 * https://github.com/ethereum/cpp-ethereum/blob/develop/libdevcrypto/CryptoPP.cpp#L36
 */

ECIES.concatKDF = function (keyMaterial, keyLen) {
  var s1 = ''
  var key = ''
  var hashBlocksize = 64
  var reps = ((keyLen + 7) * 8) / (hashBlocksize * 8)
  var counter = 0

  while (counter <= reps) {
    counter += 1
    var sha256 = crypto.createHash('sha256')
    var cnt = new Buffer(4)
    cnt.fill(0)
    cnt.writeUInt32BE(counter)
    sha256.update(cnt)
    sha256.update(keyMaterial)
    sha256.update(s1)
    key += sha256.digest('hex')
  }
  return new Buffer(key, 'hex')
}

ECIES.prototype.encryptMessage = function (secKey, data) {
  var r = ECIES.ecdh(secKey, this.remotePubKey)
  var key = ECIES.concatKDF(r, 32)
  var ekey = key.slice(0, 16) // encryption key
  var mkeyMaterial = key.slice(16, 32)
  var ourPubKey = ecdsa.publicKeyConvert(ecdsa.publicKeyCreate(secKey), false)
  var IV = new Buffer(16)
  IV.fill(0)

  // encrypt
  var aes = crypto.createCipheriv('aes-128-ctr', ekey, IV)
  var encrypted = aes.update(data)
  encrypted = Buffer.concat([IV, encrypted])

  // create key tag
  var sha256 = crypto.createHash('sha256')
  sha256.update(mkeyMaterial)
  var mkey = sha256.digest() // MAC key

  // create tag
  var hmac = crypto.createHmac('sha256', mkey)
  hmac.update(encrypted)
  var tag = hmac.digest()

  return Buffer.concat([ourPubKey, encrypted, tag])
}

ECIES.prototype.decryptMessage = function (data) {
  var pubKey = data.slice(0, 65)
  var dataIV = data.slice(65, -32)
  var tag = data.slice(-32)

  var r = ECIES.ecdh(this.secKey, pubKey)
  var key = ECIES.concatKDF(r, 32)
  var ekey = key.slice(0, 16) // encryption key
  var mkeyMaterial = key.slice(16, 32)

  var sha256 = crypto.createHash('sha256')
  sha256.update(mkeyMaterial)
  var mkey = sha256.digest() // MAC key

  var hmac = crypto.createHmac('sha256', mkey)
  hmac.update(dataIV)
  // check the tag
  assert(hmac.digest('hex') === tag.toString('hex'), 'should have valid tag')

  // decrypt data
  var IV = dataIV.slice(0, 16)
  var encryptedData = dataIV.slice(16)
  var aes = crypto.createDecipheriv('aes-128-ctr', ekey, IV)
  return aes.update(encryptedData)
}

ECIES.prototype.parseAuth = function (data) {
  this.remoteInitMsg = data
  var decypted = this.decryptMessage(data)
  assert(decypted.slice(-1)[0] === 0, 'invalid postfix')
  // parse packet
  var signature = decypted.slice(0, 64)
  const recId = decypted.slice(64, 65)
  var hepubk = decypted.slice(65, 65 + 32)
  var pubKey = this.remotePubKey = decypted.slice(65 + 32, 65 + 32 + 64)
  this.remotePubKey = Buffer.concat([new Buffer([4]), pubKey])
  var nonce = this.remoteNonce = decypted.slice(-33, -1)
  pubKey = Buffer.concat([new Buffer([4]), pubKey])
  var r = ECIES.ecdh(this.secKey, pubKey)
  var ephemeral = this.remoteEphemeralPubKey = ecdsa.publicKeyConvert(ecdsa.recoverSync(xor(r, nonce), signature, recId[0]), false).slice(1)
  var he = ethUtil.sha3(ephemeral).toString('hex')
  assert(he.toString('hex') === hepubk.toString('hex'), 'the hash of the ephemeral key should match')
}

ECIES.prototype.createAuth = function () {
  var r = ECIES.ecdh(this.secKey, this.remotePubKey)
  var sigr = ecdsa.signSync(xor(r, this.nonce), this.ephemeralSecKey)
  var ephemeralPubKey = ecdsa.publicKeyConvert(ecdsa.publicKeyCreate(this.ephemeralSecKey), false).slice(1)
  var he = ethUtil.sha3(ephemeralPubKey)
  var data = Buffer.concat([sigr.signature, new Buffer([sigr.recovery]), he, this.pubKey.slice(1), this.nonce, new Buffer([0])])
  var encryptionKey = crypto.randomBytes(32)
  this.initMsg = this.encryptMessage(encryptionKey, data)
  return this.initMsg
}

ECIES.prototype.parseAck = function (data) {
  var decypted = this.decryptMessage(data)
  assert(decypted.slice(-1)[0] === 0, 'invalid postfix')
  this.remoteEphemeralPubKey = decypted.slice(0, 64)
  this.remoteNonce = decypted.slice(64, 96)
  this.initiator = false
  this.setupFrame(data)
}

ECIES.prototype.createAck = function () {
  var data = Buffer.concat([this.ephemeralPubKey.slice(1), this.nonce, new Buffer([0])])
  var encryptionKey = crypto.randomBytes(32)
  this.initMsg = this.encryptMessage(encryptionKey, data)
  this.setupFrame(this.remoteInitMsg)
  return this.initMsg
}

ECIES.prototype.parseHeader = function (data) {
  // parse header
  var header = data.slice(0, 16)
  var headerMac = data.slice(16, 32)
  this.ingressMac.updateHeader(header)
  // check the header's mac
  assert(headerMac.toString('hex') === this.ingressMac.digest().toString('hex'), 'Invalid Mac')
  header = this.ingressAes.update(header)
  var size = this._bodySize = ethUtil.bufferToInt(header.slice(0, 3))
  // TODO: do something with the header
  return size
}

ECIES.prototype.createHeader = function (size) {
  // parse header
  size = ethUtil.pad(ethUtil.intToBuffer(size), 3)
  // TODO: the rlp will contain something else someday
  var header = Buffer.concat([size, rlp.encode([0, 0])])
  var padNum = 16 - header.length
  var padding = new Buffer(padNum)
  padding.fill(0)
  header = Buffer.concat([header, padding])
  header = this.egressAes.update(header)
  this.egressMac.updateHeader(header)
  var tag = this.egressMac.digest()
  return Buffer.concat([header, tag])
}

ECIES.prototype.parseBody = function (data) {
  if (!this._bodySize) {
    throw new Error('need to parse header first')
  }

  var body = data.slice(0, -16)
  var mac = data.slice(-16)
  this.ingressMac.updateBody(body)
  assert(this.ingressMac.digest().toString('hex') === mac.toString('hex'))
  var size = this._bodySize
  this._bodySize = false
  return this.ingressAes.update(body).slice(0, size)
}

ECIES.prototype.createBody = function (data) {
  var padNum = (16 - data.length % 16) % 16
  var padding = new Buffer(padNum)
  padding.fill(0)
  data = Buffer.concat([data, padding])
  var encrypted = this.egressAes.update(data)
  this.egressMac.updateBody(encrypted)
  var tag = this.egressMac.digest()
  return Buffer.concat([encrypted, tag])
}

ECIES.prototype.setupFrame = function (remoteData) {
  var nonceMaterial = this.initiator ? Buffer.concat([this.nonce, this.remoteNonce]) : Buffer.concat([this.remoteNonce, this.nonce])
  var hNonce = ethUtil.sha3(nonceMaterial)
  var sharedSecret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, hNonce]))
  this.token = ethUtil.sha3(sharedSecret)
  this.aesSecret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, sharedSecret]))
  this.macSecret = this.egressMac.secret = this.ingressMac.secret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, this.aesSecret]))
  var IV = new Buffer(16)
  IV.fill(0)
  this.ingressAes = crypto.createDecipheriv('aes-256-ctr', this.aesSecret, IV)
  this.egressAes = crypto.createDecipheriv('aes-256-ctr', this.aesSecret, IV)
  var ingressData = Buffer.concat([xor(this.macSecret, this.nonce), remoteData])
  var egressData = Buffer.concat([xor(this.macSecret, this.remoteNonce), this.initMsg])
  this.ingressMac.rawUpdate(ingressData)
  this.egressMac.rawUpdate(egressData)
}
