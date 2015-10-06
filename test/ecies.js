var ECIES = require('../lib/ecies.js')
var ecdsa = require('secp256k1')
var crypto = require('crypto')
var assert = require('assert')

var a
var b

describe('[Network]: ECIES', function () {
  it('should create a new ECIES instance', function (done) {
    var privateKey = crypto.randomBytes(32)
    var privateKey2 = crypto.randomBytes(32)
    var pubKey = ecdsa.createPublicKey(privateKey)
    var pubKey2 = ecdsa.createPublicKey(privateKey2)
    a = new ECIES(privateKey, pubKey, pubKey2)
    b = new ECIES(privateKey2, pubKey2, pubKey)
    done()
  })

  it('should encrypt and decrypt', function (done) {
    var message = new Buffer('The Magic Words are Squeamish Ossifrage')
    var privateKey = crypto.randomBytes(32)
    var encypted = a.encryptMessage(privateKey, message)
    var decrypted = b.decryptMessage(encypted)
    assert(message.toString() === decrypted.toString())
    done()
  })

  it('should create an auth message and parse it', function (done) {
    var data = a.createAuth()
    b.parseAuth(data)
    done()
  })

  it('should create an ack message and parse it', function (done) {
    var data = b.createAck()
    a.parseAck(data)
    done()
  })

  it('should create a frame header and parse it', function (done) {
    var size = 600
    var data = a.createHeader(size)
    var out = b.parseHeader(data)
    assert(size === out)
    done()
  })

  it('should create a frame body and parse it', function (done) {
    var something = new Buffer(600)
    var data = a.createBody(something)
    var result = b.parseBody(data)
    assert(something.toString('hex') === result.toString('hex'))
    done()
  })
})
