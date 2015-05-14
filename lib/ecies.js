var crypto = require('crypto');
var assert = require('assert');
var ecurve = require('ecurve');
var BigInt = require('bigi');
var ecdsa = require('secp256k1');
var ethUtil = require('ethereumjs-util');
var xor = require('bitwise-xor');
var rlp = require('rlp');

exports.ecdh = function(secKey, pubKey) {
  var curve = ecurve.getCurveByName('secp256k1');
  var d = BigInt.fromBuffer(secKey);
  var Q = ecurve.Point.decodeFrom(curve, pubKey);
  var r = Q.multiply(d).getEncoded(true);
  return r.slice(1);
};

/**
 * a straigth rip from python interop w/go ecies implementation
 * for sha3, blocksize is 136 bytes
 * for sha256, blocksize is 64 bytes
 * NIST SP 800-56a Concatenation Key Derivation Function (see section 5.8.1).
 * https://github.com/ethereum/pydevp2p/blob/master/devp2p/crypto.py#L295
 * https://github.com/ethereum/go-ethereum/blob/develop/crypto/ecies/ecies.go#L134
 * https://github.com/ethereum/cpp-ethereum/blob/develop/libdevcrypto/CryptoPP.cpp#L36
 */

exports.concatKDF = function(keyMaterial, keyLen) {
  var s1 = '';
  var key = '';
  var hashBlocksize = 64;
  var reps = ((keyLen + 7) * 8) / (hashBlocksize * 8);
  var counter = 0;

  while (counter <= reps) {
    counter += 1;
    var sha256 = crypto.createHash('sha256');
    var cnt = new Buffer(4);
    cnt.fill(0);
    cnt.writeUInt32BE(counter);
    sha256.update(cnt);
    sha256.update(keyMaterial);
    sha256.update(s1);
    key += sha256.digest('hex');
  }
  return new Buffer(key, 'hex');
};

exports.encryptMessage = function(secKey, pubKey, data) {
  var r = exports.ecdh(secKey, pubKey);
  var key = exports.concatKDF(r, 32);
  var ekey = key.slice(0, 16); //encryption key
  var mkeyMaterial = key.slice(16, 32);
  var ourPubKey = ecdsa.createPublicKey(secKey);
  var IV = new Buffer(16);
  IV.fill(0);

  //encrypt
  var aes = crypto.createCipheriv('aes-128-ctr', ekey, IV);
  var encrypted = aes.update(data);
  encrypted = Buffer.concat([IV, encrypted]);

  //create key tag
  var sha256 = crypto.createHash('sha256');
  sha256.update(mkeyMaterial);
  var mkey = sha256.digest(); //MAC key

  //create tag
  var hmac = crypto.createHmac('sha256', mkey);
  hmac.update(encrypted);
  var tag = hmac.digest();

  return Buffer.concat([ourPubKey, encrypted, tag]);
};

exports.decryptMessage = function(secKey, data) {

  var pubKey = data.slice(0, 65);
  var dataIV = data.slice(65, -32);
  var tag = data.slice(-32);

  var r = exports.ecdh(secKey, pubKey);
  var key = exports.concatKDF(r, 32);
  var ekey = key.slice(0, 16); //encryption key
  var mkeyMaterial = key.slice(16, 32);

  var sha256 = crypto.createHash('sha256');
  sha256.update(mkeyMaterial);
  var mkey = sha256.digest(); //MAC key

  var hmac = crypto.createHmac('sha256', mkey);
  hmac.update(dataIV);
  //check the tag
  assert(hmac.digest('hex') === tag.toString('hex'), 'should have valid tag');

  //decrypt data
  var IV = dataIV.slice(0, 16);
  var encryptedData = dataIV.slice(16);
  var aes = crypto.createDecipheriv('aes-128-ctr', ekey, IV);
  return aes.update(encryptedData);
};

exports.parseAuth = function(sec, data) {

  var decypted = exports.decryptMessage(sec, data);
  assert(decypted.slice(-1)[0] === 0, 'invalid postfix');

  //parse packet
  var signature = decypted.slice(0, 64);
  var recId = decypted.slice(64, 65);
  var hepubk = decypted.slice(65, 65 + 32);
  var pubKey = decypted.slice(65 + 32, 65 + 32 + 64);
  var nonce = decypted.slice(-33, -1);
  // console.log("sig: " + signature.toString('hex'));
  pubKey = Buffer.concat([new Buffer([4]), pubKey]);
  var r = exports.ecdh(sec, pubKey);

  var ephemeral = ecdsa.recoverCompact(xor(r, nonce), signature, recId[0]).slice(1);
  var he = ethUtil.sha3(ephemeral).toString('hex');
  assert(he.toString('hex') === hepubk.toString('hex'), 'the hash of the ephemeral key should match');

  return {
    ephemeralPubKey: ephemeral,
    publicKey: pubKey,
    nonce: nonce
  };
};

exports.parseAck = function(sec, data) {
  var decypted = exports.decryptMessage(sec, data);
  assert(decypted.slice(-1)[0] === 0, 'invalid postfix');

  return {
    ephemeralPubKey: decypted.slice(0, 64),
    nonce: decypted.slice(64, 96)
  };
};

exports.createAuth = function(ephemeralSecKey, secKey, pubKey, remotePubKey, nonce) {
  var ephemeralPubKey = ecdsa.createPublicKey(ephemeralSecKey).slice(1);
  console.log('create Auth');
  var r = exports.ecdh(secKey, remotePubKey);
  var sigr = ecdsa.signCompact(ephemeralSecKey, xor(r, nonce));

  var he = ethUtil.sha3(ephemeralPubKey);
  var data = Buffer.concat([sigr.signature, new Buffer([sigr.recoveryId]), he, pubKey.slice(1), nonce, new Buffer([0])]);
  var encryptionKey = crypto.randomBytes(32);
  return exports.encryptMessage(encryptionKey, remotePubKey, data);
};

exports.createAck = function(ephemeralPubKey, remotePubKey, nonce) {
  var data = Buffer.concat([ephemeralPubKey, nonce, new Buffer([0])]);
  var encryptionKey = crypto.randomBytes(32);
  return exports.encryptMessage(encryptionKey, remotePubKey, data);
};

exports.parseHeader = function(secKey, ingressMac, data){

  //parse header
  var header = data.slice(0, 16);
  var headerMac = data.slice(16, 32);

  ingressMac.updateHeader(header);
  //check the header's mac
  assert(headerMac.toString('hex') === ingressMac.digest().toString('hex'));

  var IV = new Buffer(16);
  IV.fill(0);
  var aes = crypto.createDecipheriv('aes-256-ctr', secKey, IV);
  header = aes.update(header);
  var size = ethUtil.bufferToInt(header.slice(0, 3));
  header = rlp.decode(header.slice(3));
  return size;
};

exports.parseBody = function(secKey, ingressMac, data, size){

  var body = data.slice(0, -16);
  var mac = data.slice(-16);
  ingressMac.updateBody(body);
  assert(ingressMac.digest().toString('hex') === mac.toString('hex'));

  var IV = new Buffer(16);
  IV.fill(0);
  var aes = crypto.createDecipheriv('aes-256-ctr', secKey, IV);
  body = aes.update(body).slice(0, size);

  return body;
};
