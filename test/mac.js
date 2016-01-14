var MAC = require('../lib/mac.js')
var tape = require('tape')

const secret = new Buffer('4caf4671e713d083128973de159d02688dc86f51535a80178264631e193ed2ea', 'hex')

tape('[MAC]', function (it) {
  it.test('should create a new MAC instance', function (t) {
    var mac = new MAC(secret)
    t.assert(mac !== null)
    t.end()
  })

  it.test('digest should work on empty data', function (t) {
    var mac = new MAC(secret)
    t.equals(mac.digest().toString('hex'), 'c5d2460186f7233c927e7db2dcc703c0')
    t.end()
  })

  it.test('rawUpdate should work', function (t) {
    var mac = new MAC(secret)
    mac.rawUpdate('test')
    t.equals(mac.digest().toString('hex'), '9c22ff5f21f0b81b113e63f7db6da94f')
    t.end()
  })

  it.test('updateHeader should work', function (t) {
    var mac = new MAC(secret)
    mac.updateHeader('this is a header data struct')
    t.equals(mac.digest().toString('hex'), '52235ed491a4c9224d94788762ead6a6')
    t.end()
  })

  it.test('updateBody should work', function (t) {
    var mac = new MAC(secret)
    mac.updateBody('this is a body data struct')
    t.equals(mac.digest().toString('hex'), '134a755450b1ed9d3ff90ef5dcecdd7d')
    t.end()
  })

  it.test('multiple updates should work', function (t) {
    var mac = new MAC(secret)
    mac.updateHeader('this is a header data struct')
    mac.updateBody('this is a body data struct')
    t.equals(mac.digest().toString('hex'), '5d98967578ec8edbb45e1d75992f394c')
    t.end()
  })
})
