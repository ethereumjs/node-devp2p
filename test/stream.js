var Network = require('../index.js')
var tape = require('tape')
var network = new Network()
var network2 = new Network()
var stream1
var stream2

var internals = {
  // test port and host
  port: 4447,
  host: '127.0.0.1'
}

var data = 'hello world!'

tape('stream test', function (it) {
  it.test('simple test', function (t) {
    network.listen(internals.port, internals.host, function () {
      network2.listen(internals.port + 1, internals.host, function () {
        network.connect({
          port: internals.port + 1,
          address: internals.host
        })
      })
    })

    network2.once('connection', function (p) {
      stream1 = p.createStream()
      stream1.on('data', function (d) {
        console.log(d.toString())
        console.log(data.toString('hex'))
        t.assert(d.toString() === data)
        t.end()
        process.exit()
      })

      if (stream1 && stream2) stream2.write(data)
    })

    network.once('connection', function (p) {
      stream2 = p.createStream()
      if (stream1 && stream2) stream2.write(data)
    })
  })
})
