const Duplex = require('stream').Duplex;
const util = require('util');

var Stream = module.exports = function(opts, peer) {
  var self = this;
  this.peer = peer;
  this._packets = [];
  self._closed = false;
  self._reading = false;
  self._prefix = new Buffer([0xff])
  Duplex.call(this, opts);
  this.peer.on('disconnect', function(){
    self._closed = true;  
  });
}

util.inherits(Stream, Duplex);

Stream.prototype._read = function readBytes() {
  var self = this;
  //change to check type
  while (this._packets.length) {
    var chunk = this._packets.shift();
    if(this._prefix){
      chunk = chunk.slice(1);
    }

    if (!self.push(chunk)) {
      break; // false from push, stop reading
    }
  }
  if (!self._closed && !self._reading) {
    self._reading = true;
    this.peer.on('data', function(data){
      self._packets.push(data);
      self._read();
    })
  } else { // we are done, push null to end stream
    self.push(null);
  }
};

Stream.prototype._write = function(chunk, enc, cb) {
  if(this._prefix){
    chunk = Buffer.concat([this._prefix, chunk]);
  }
  this.peer.sendMessage(chunk, cb)
};
