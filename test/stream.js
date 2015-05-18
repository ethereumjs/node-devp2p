var Network = require('../index.js');
var assert = require('assert');
var network = new Network();
var network2 = new Network();
var peer = false;
var peer2 = false;
var stream1;
var stream2;
var internals = {
  //test port and host
  port: 4447,
  host: 'localhost'
};

var data = 'hello world!'

describe('stream test', function() {

  it('simple test', function(done) {
    network.listen(internals.port, internals.host, function() {
      network2.listen(internals.port + 1, internals.host, function() {
        network.connect({
          port: internals.port + 1,
          address: internals.host
        });
      });
    });

    network2.once('connection', function(p) {
      stream1 = p.createStream();
      stream1.on('data', function(d) {
        console.log(d.toString());
        console.log(data.toString('hex'));
          assert(d.toString() === data);
          done();
      });

      if (stream1 && stream2) stream2.write(data);
    });

    network.once('connection', function(p) {
      stream2 = p.createStream();
      if (stream1 && stream2) stream2.write(data);
    });
  });
});
