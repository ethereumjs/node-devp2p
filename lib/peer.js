const util = require('util');
const ethUtil = require('ethereumjs-util');
const EventEmitter = require('events').EventEmitter;
const logic = require('./logic.js');
const ECIES = require('./ecies.js');
const rlp = require('rlp');
const Stream = require('./stream.js');

const prefix = {
  HELLO: 0x80,
  DISCONNECT: 1,
  PING: 2,
  PONG: 3
}

const size = {
  HEADER: 32,
  AUTH: 307,
  ACK: 210
}

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
    this.network.secretKey, //secert key
    Buffer.concat([new Buffer([4]), this.network.dht.id]) //public key
  );

  if(id){
     this.eciesSession.remotePubKey = Buffer.concat([new Buffer([4]), this.id]); //remote public key
  }

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
  this.hello = false; //the info given by the hello packet

  this._nextPacketSize = 307;

  var self = this;
  socket.on('error', function(e) {
    self.emit('error', e);
  });

  var data = new Buffer([]);

  //defines the packet parsing behavoir
  socket.on('data', function(newData) {

    var more = true;

    data = Buffer.concat([data, newData]);
    while (more) {
      if (data.length >= self._nextPacketSize) {
        var remainder = data.slice(self._nextPacketSize);
        self.parseData(data.slice(0, self._nextPacketSize));
        data = remainder;
      } else {
        more = false;
      }
    }
  });

  //bind the peer logic
  logic.logic(this);
};

util.inherits(Peer, EventEmitter);

Peer.disconnectReasons = {
  DISCONNECT_REQUESTED: 0x00,
  SUBSYSTEM_ERROR: 0x01,
  BREACH_OF_PROTOCOL: 0x02,
  USELESS_PEER: 0x03,
  TOO_MANY_PEERS: 0x04,
  ALREADY_CONNECTED: 0x05,
  INCOMPATIBLE_p2p_PROTOCOL_VERSION: 0x06,
  NULL_NODE_IDENTITY: 0x07,
  CLIENT_QUITTING: 0x08,
  UNEXPECTED_IDENTITY: 0x09,
  SAME_IDENTITY: 0x0a,
  TIMEOUT: 0x0b,
  SUBPROTOCOL_REASON: 0x0c
}

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
  var self = this;
  var msg = this.eciesSession.createAck(this.ourEphemeralPubKey, this.id, this.nonce);
  this.socket.write(msg, function() {
    self.state = 'Header';
    self._nextPacketSize = 32;
    self.sendHello();
  });
};

Peer.prototype.parseData = function(data) {

  switch (this.state) {
    case 'Auth':
      this.eciesSession.parseAuth(data);
      this.sendAck();
      this.state = 'Header';
      this._nextPacketSize = 32;
      break;

    case 'Ack':
      this.eciesSession.parseAck(data);
      this.state = 'Header';
      this._nextPacketSize = 32;
      this.sendHello();
      console.log('got ack');
     break;

    case 'Header':
      var size = this.eciesSession.parseHeader(data);
      this.state = 'Body';

      this._bodySize = size;
      this._nextPacketSize = (32 - (size % 16)) + size;
      break;

    case 'Body':
      var body = this.eciesSession.parseBody(data);
      //process the body
      //pipe out ect
      this.state = 'Header';
      this._nextPacketSize = 32;

      var type = body.slice(0, 1);
      if (type[0] < 0x10 || type[0] === 0x80) {
        this.parseBasePacket(type, body.slice(1));
      }else{
        console.log('data!!!');
        this.emit('data', body);
      }

    break;
      //error
  }
};

Peer.prototype.parseBasePacket = function(type, data) {
    var decoded = rlp.decode(data);
    switch (type[0]) {
      //hello
      case 0x80:
        this.hello = this.parseHello(decoded);
        var ourCaps = this.network.capabilities;
        var sharedProto = [];

        //disconnect if using differnt protocols versions
        for (var cap in this.hello.capabilities) {
          if (ourCaps[cap] && ourCaps[cap] !== this.hello.capabilities[cap]) {
            this.disconnect(0x07);
          }else{
            sharedProto.push(cap);
          }
        }
        this.network.emit('connection', this);
        break;

        //on disconnect
      case 1:
        console.log('clse');
        this.emit('close');
        this.socket.end();
        break;

        //on ping
      case 2:
        this.sendPong();
        break;

      case 3:
        this.emit('pong');
        break;
  }
};

Peer.prototype.toString = function() {
  return this.socket.remoteAddress + ':' + this.socket.remotePort;
};

Peer.prototype.parseHello = function(payload) {
  //build hello message
  var caps = {};
  payload[2].forEach(function(p) {
    caps[p[0].toString()] = ethUtil.bufferToInt(p[1]);
  });

  var hello = {
    protocolVersion: payload[0][0],
    clientId: payload[1].toString(),
    capabilities: caps,
    port: ethUtil.bufferToInt(payload[3]),
    id: payload[4].toString('hex')
  };

  return hello;
};

Peer.prototype.createHello = function() {

  var caps = [];
  console.log(this.network.capabilities);
  for (var cap in this.network.capabilities) {
    caps.push([cap, new Buffer([Number(this.network.capabilities[cap])])]);
  }
  var message = [
    this.network.protocolVersion,
    this.network.clientId,
    caps,
    this.network.port,
    this.network.dht.id
  ];

  var msg = this.parseHello(rlp.decode( rlp.encode(message) ) );
  console.log(msg);

  return Buffer.concat([new Buffer([0x80]), rlp.encode(message)]);
};

Peer.prototype.sendHello = function(cb){
  var msg = this.createHello();
  this.sendMessage(msg, cb);
};

Peer.prototype.sendPing = function(cb){
  var msg = new Buffer([prefix.PING, 0xc0]);
  this.sendMessage(msg, cb);
}


Peer.prototype.sendPong = function(cb){
  var msg = new Buffer([prefix.PONG, 0xc0]);
  this.sendMessage(msg, cb);
}

Peer.prototype.sendDisconnect = function(reason){
  if(reason === undefined)
    reason = Peer.disconnectReasons.DISCONNECT_REQUESTED;

  var msg = new Buffer([prefix.DISCONNECT, rlp.encode[reason]]);
  var header = this.eciesSession.createHeader(msg.length);
  var body = this.eciesSession.createBody(msg);
  this.socket.write(header);
  this.socket.end(body);
}

Peer.prototype.sendMessage = function(msg, cb){
  var header = this.eciesSession.createHeader(msg.length);
  var body = this.eciesSession.createBody(msg);
  this.socket.write(header);
  this.socket.write(body, cb);
}

Peer.prototype.end = function(reason) {
  var self = this;
  // stream.Duplex.prototype.end.call(this);
  this.sendDisconnect(reason)
};

Peer.prototype.createStream = function(opts){
  return new Stream(opts, this);
}
