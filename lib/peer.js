var util = require('util');
var EventEmitter = require('events').EventEmitter;
var logic = require('./logic.js');
var ECIES = require('./ecies.js');

/**
 * @contructor
 * @param {Object} socket an Intialized Sockets. MUST alread be connected
 * @param {Object} network the network that initailized the connection
 */
var Peer = exports = module.exports = function(socket, network, id) {
  // Register as event emitter
  EventEmitter.call(this);

  this.id = id;
  this.socket = socket;
  this.network = network;
  this.initiator = true; //did this peer start the connection

  this.eciesSession = new ECIES(
    this.network.secretKey,
    Buffer.concat([new Buffer([4]), this.network.dht.id]),
    Buffer.concat([new Buffer([4]), this.id])
  );

  //the ephemral shared secret
  Object.defineProperty(this, 'ephemeralSecret', {
    get: function() {
      if (!this._ephShared) {
        this._ephShared = ECIES.ecdh(this.ephemeralSecKey, Buffer.concat([new Buffer([4]), this.remoteEphemeralPubKey]));
      }
      return this._ephShared;
    }
  });

  Object.defineProperty(this, 'staticSecret', {
    get: function() {
      if (!this._staticShared) {
        this._staticShared = ECIES.ecdh(this.network.secretKey, Buffer.concat([new Buffer([4]), this.id]));
      }
      return this._staticShared;
    }
  });

  this.state = 'Auth';
  //Auth, Ack, HelloHeader, HelloFrame, Header, Frame

  this._nextPacketSize = 307;

  var self = this;
  socket.on('error', function(e) {
    self.emit('socet.error', e);
  });

  var data = new Buffer([]);

  //defines the packet parsing behavoir
  socket.on('data', function(newData) {

    var more = true;

    data = Buffer.concat([data, newData]);
    while (more) {
      console.log('-----data------');
      console.log('dataSize: ' + data.length);
      console.log('nextPacket: ' + self._nextPacketSize);
      console.log('state: ' + self.state);
      if(data.length >= self._nextPacketSize){
        var remainder = data.slice(self._nextPacketSize);
        self.parseData(data.slice(0, self._nextPacketSize));
        data = remainder;
      }else{
        more = false;
      }
    }

  });

  //bind the peer logic
  logic.logic(this);
};

util.inherits(Peer, EventEmitter);

Peer.prototype.sendAuth = function() {
  //public keys need 0x4 appended to them
  var self = this;
  var msg = this.eciesSession.createAuth();
  this.socket.write(msg, function() {
    self.state = 'Ack';
    self._nextPacketSize = 210;
    console.log('data sent!');
  });
};

Peer.prototype.sendAck = function() {
  var msg = this.ephemeralPubKey.createAck(this.ourEphemeralPubKey, this.id, this.nonce);
  this.socket.write(msg, function() {
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
  });
};

Peer.prototype.parseData = function(data) {

  if (this.state === 'Auth') {
    this.eciesSession.parseAuth(data);
    this.sendAck();
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
  } else if (this.state === 'Ack') {
    this.eciesSession.parseAck(data);
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
    console.log('got ack');
  } else if(this.state === 'HelloHeader') {
     var size = this.eciesSession.parseHeader(data);
     this.state = 'HelloBody';
     this._bodySize = size;
     this._nextPacketSize = (32 - (size % 16)) + size;
    console.log('hello header');
  }else if(this.state === 'HelloBody'){
    var body = this.eciesSession.parseBody(data, this._bodySize);
    //process the body
    console.log('hello: ' + body.toString('hex'));
    this.state = 'Header';
    console.log('hello body');
    this._nextPacketSize = 32;
  }else if(this.state === 'Header') {
     var size = this.eciesSession.parseHeader(data.slice(0));
     this.state = 'Body';
     console.log('size: ' + size);
     this._nextPacketSize = (32 - (size % 16)) + size;
  }else if(this.state === 'Body'){
    var body = this.eeciesSession.parseBody(data);
    //process the body
    this.state = 'Header';
    console.log('hello body');
    this._nextPacketSize = 32;
  }else{
    //error
  }
};

Peer.prototype.toString = function() {
  return this.socket.remoteAddress + ':' + this.socket.remotePort;
};

function parseHello(payload) {
  //build hello message
  var caps = {};
  payload[3].forEach(function(p) {
    caps[p[0].toString()] = utils.bufferToInt(p[1]);
  });

  var hello = {
    protocolVersion: payload[1][0],
    clientId: payload[2].toString(),
    capabilities: caps,
    port: utils.bufferToInt(payload[4]),
    id: payload[5].toString('hex'),
    ip: this.socket.remoteAddress
  };

  return hello;
}
