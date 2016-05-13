const Network = require('../index.js')
const tape = require('tape')

var internals = {
  // test port and host
  port: 4447,
  host: '127.0.0.1'
}

tape('[Network]: Listening functions', function (it) {
  var network = new Network()
  it.test('should listen', function (t) {
    network.listen(internals.port, internals.host, t.end)
  })

  it.test('should stop listening', function (t) {
    network.close(t.end)
  })
})

tape('[Network]: Peer Messages', function (it) {
  var network = new Network()
  var network2 = new Network()
  var peer = false
  var peer2 = false

  it.test('should start', function (t) {
    network.listen(internals.port, internals.host, function () {
      network2.listen(internals.port + 1, internals.host, t.end)
    })
  })

  it.test('should send a hello message on connect', function (t) {
    network2.once('connection', function (p) {
      peer = p
      if (peer && peer2) t.end()
    })

    network.once('connection', function (p) {
      peer2 = p
      if (peer && peer2) t.end()
    })

    network.connect({
      port: internals.port + 1,
      address: internals.host
    })
  })

  it.test('should send a ping', function (t) {
    peer2.once('pong', function () {
      t.end()
    })
    peer2.sendPing()
  })

  it.test('should send disconnect', function (t) {
    peer.once('close', function () {
      t.end()
    })
    peer2.end(0x08)
  })

  it.test('should stop listening', function (t) {
    network.close(function () {
      network2.close(t.end)
    })
  })
})
