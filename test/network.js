var Network = require('../index.js');
var RLP = require('rlp');
var net = require('net');
var assert = require('assert');
var async = require('async');

var internals = {
  //test port and host
  port: 4447,
  host: '127.0.0.1'
};

describe('[Network]: Listening functions', function() {
  var network = new Network();
  it('should listen', function(done) {
    network.listen(internals.port, internals.host, done);
  });

  it('should stop listening', function(done) {
    network.close(done);
  });
});

describe('[Network]: Peer Messages', function() {

  var network = new Network();
  var network2 = new Network();
  var peer = false;
  var peer2 = false;

  before(function(done) {
    network.listen(internals.port, internals.host, function() {
      network2.listen(internals.port + 1, internals.host, done);
    });
  });

  it('should send a hello message on connect', function(done) {
    network2.once('connection', function(p) {
      peer = p;
      if(peer && peer2) done();
    });

    network.once('connection', function(p) {
      peer2 = p;
      if(peer && peer2) done();
    });


    network.connect({
      port: internals.port + 1,
      address: internals.host
    });
  });

  it('should send a ping', function (done) {
    peer2.once('pong', function () {
      done();
    });
    peer2.sendPing();
  });

  it('should send disconnect', function (done) {
    peer.once('close', function () {
      done();
    });
    peer2.end(0x08);
  });

  it('should stop listening', function(done) {
    network.close(function(){
      network2.close(done);
    });
  });
});
