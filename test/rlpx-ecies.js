var ECIES = require('../lib/ecies.js')
var ecdsa = require('secp256k1')
var crypto = require('crypto')
var tape = require('tape')

var a
var b

tape('[Network]: ECIES', function (it) {
  it.test('should create a new ECIES instance', function (t) {
    var privateKey = crypto.randomBytes(32)
    var privateKey2 = crypto.randomBytes(32)
    var pubKey = ecdsa.publicKeyConvert(ecdsa.publicKeyCreate(privateKey), false)
    var pubKey2 = ecdsa.publicKeyConvert(ecdsa.publicKeyCreate(privateKey2), false)
    a = new ECIES(privateKey, pubKey, pubKey2)
    b = new ECIES(privateKey2, pubKey2, pubKey)
    t.end()
  })

  it.test('should encrypt and decrypt', function (t) {
    var message = new Buffer('The Magic Words are Squeamish Ossifrage')
    var privateKey = crypto.randomBytes(32)
    var encypted = a.encryptMessage(privateKey, message)
    var decrypted = b.decryptMessage(encypted)
    t.assert(message.toString() === decrypted.toString())
    t.end()
  })

  it.test('should create an auth message and parse it', function (t) {
    var data = a.createAuth()
    b.parseAuth(data)
    t.end()
  })

  it.test('should create an ack message and parse it', function (t) {
    var data = b.createAck()
    a.parseAck(data)
    t.end()
  })

  it.test('should create a frame header and parse it', function (t) {
    var size = 600
    var data = a.createHeader(size)
    var out = b.parseHeader(data)
    t.assert(size === out)
    t.end()
  })

  it.test('should create a frame body and parse it', function (t) {
    var something = new Buffer(600)
    var data = a.createBody(something)
    var result = b.parseBody(data)
    t.assert(something.toString('hex') === result.toString('hex'))
    t.end()
  })
})
