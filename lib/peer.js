var util = require('util');
var ethUtil = require('ethereumjs-util');
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var rlp = require('rlp');
var logic = require('./logic.js');
var codes = require('./codes.js');
var ecdsa = require('secp256k1');
var ecies = require('./ecies.js');
var crypto = require('crypto');
var sha3 = require('sha3');
var xor = require('bitwise-xor');
var mac = require('./mac.js');

/**
 * @contructor
 * @param {Object} socket an Intialized Sockets. MUST alread be connected
 * @param {Object} network the network that initailized the connection
 */
var Peer = exports = module.exports = function(socket, network) {
  // Register as event emitter
  EventEmitter.call(this);

  this.socket = socket;
  this.network = network;
  this.initiator = true; //did this peer start the connection

  this.ephemeralSecKey = crypto.randomBytes(32);
  this.ephemeralPubKey = ecdsa.createPublicKey(this.ephemeralSecKey);
  this.nonce = crypto.randomBytes(32);
  this.ingressMac = new mac();
  this.egressMac = new mac();

  //the ephemral shared secret
  Object.defineProperty(this, 'ephemeralSecret', {
    get: function() {
      if (!this._ephShared) {
        this._ephShared = ecies.ecdh(this.ephemeralSecKey, Buffer.concat([new Buffer([4]), this.remoteEphemeralPubKey]));
      }
      return this._ephShared;
    }
  });

  Object.defineProperty(this, 'staticSecret', {
    get: function() {
      if (!this._staticShared) {
        this._staticShared = ecies.ecdh(this.network.secretKey, Buffer.concat([new Buffer([4]), this.id]));
      }
      return this._staticShared;
    }
  });

  //the state of the peer
  this._state = {
    hello: false, //has the handshake took place?
    sentPeers: false,
    gettingPeers: false,
    wantPeers: false
  };

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
      debugger;
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

    //   var parsedData = false;
    //   var subProtocol;
    //   var command;

    //   try {
    //     var payloadLen = parseInt(data.slice(4, 8).toString('hex'), 16);

    //     if (payloadLen > data.length + 8) {
    //       more = false;
    //     } else {
    //       var d = data.slice(8, payloadLen + 8);
    //       var payload = rlp.decode(d);

    //       assert.equal(codes.syncToken, data.slice(0, 4).toString('hex'), 'Invalid Sync Token');
    //       data = data.slice(payloadLen + 8);

    //       var commandCode = payload[0][0];
    //       if(!commandCode){
    //         commandCode = 0;
    //       }

    //       command = codes.command[commandCode];

    //       var result = self._parsePayload(command, payload);
    //       parsedData = result[1];
    //       subProtocol = result[0];

    //       if (data.length === 0) {
    //         more = false;
    //       }
    //     }
    //   } catch (e) {
    //     more = false; //stop the while
    //     data = new Buffer([]);
    //     self.emit('parsing.error', e);
    //     self.disconnect(0x02);
    //   }

    //   if (parsedData) {

    //     //emit events
    //     if(subProtocol !== ''){
    //       subProtocol = subProtocol + '.';
    //     }

    //     var eventData = [subProtocol + command, parsedData, self];
    //     self.emit.apply(self, eventData);

    //     //broadcast on network
    //     self.network.emit.apply(self.network, eventData);

    //     //broadcast event to peer for type `message`
    //     eventData[0] = command;
    //     eventData.unshift('message');
    //     self.emit.apply(self, parsedData);
    //   }
    // }
  });

  //bind subProtocol methods
  for (var cap in this.network.capabilities) {
    for (var method in this[cap]) {
      this[cap][method] = this[cap][method].bind(this);
    }
  }

  //bind the peer logic
  logic.logic(this);
};

util.inherits(Peer, EventEmitter);

Peer.prototype.sendAuth = function() {
  //public keys need 0x4 appended to them
  var self = this;
  var msg = ecies.createAuth(
    this.ephemeralSecKey,
    this.network.secretKey,
    Buffer.concat([new Buffer([4]), this.network.dht.id]),
    Buffer.concat([new Buffer([4]), this.id]),
    this.nonce
  );

  this.initPacket = msg;

  console.log('auth size: ' + msg.length);
  this.socket.write(msg, function() {
    self.state = 'Ack';
    self._nextPacketSize = 210;
    console.log('data sent!');
  });
};

Peer.prototype.sendAck = function() {
  var msg = ecies.createAck(this.ourEphemeralPubKey, this.id, this.nonce);
  this.initPacket = msg;
  this.socket.write(msg, function() {
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
  });
};

Peer.prototype.parseData = function(data) {

  var sec = this.network.secretKey;

  if (this.state === 'Auth') {
    var auth = ecies.parseAuth(sec, data);
    this.remoteEphemeralPubKey = auth.ephemeralPubKey;
    this.remoteNonce = auth.nonce;
    this.sendAck();
    this.setupFrame(data);
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
  } else if (this.state === 'Ack') {
    var decrypted = ecies.parseAck(sec, data);
    this.remoteEphemeralPubKey = decrypted.ephemeralPubKey;
    this.remoteNonce = decrypted.nonce;
    this.setupFrame(data);
    this.state = 'HelloHeader';
    this._nextPacketSize = 32;
    console.log('got ack');
  } else if(this.state === 'HelloHeader' || this.state === 'Header') {
     var size = ecies.parseHeader(this.aesSecret, this.ingressMac, data.slice(0, 32));
     this.state = 'HelloBody';
     this._bodySize = size;
     console.log('size: ' + size);
     this._nextPacketSize = (32 - (size % 16)) + size;
    console.log('hello header');
  }else{
    var body = ecies.parseBody(this.aesSecret, this.ingressMac, data, this._bodySize);
    //process the body
    this.state = 'Header';
    console.log('hello body');
    this._nextPacketSize = 32;
  }

};

Peer.prototype.setupFrame = function(data){
    var nonceMaterial = this.initiator
        ? Buffer.concat([this.nonce, this.remoteNonce])
        : Buffer.concat([this.remoteNonce, this.nonce]);

    var hNonce = ethUtil.sha3(nonceMaterial);
    var sharedSecret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, hNonce]));
    this.token = ethUtil.sha3(sharedSecret);
    this.aesSecret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, sharedSecret]));
    this.macSecret = this.egressMac.secret = this.ingressMac.secret = ethUtil.sha3(Buffer.concat([this.ephemeralSecret, this.aesSecret]));

    var egressData = this.initiator
        ? Buffer.concat([xor(this.macSecret, this.nonce), data])
        : Buffer.concat([xor(this.macSecret, this.remoteNonce), this.initPacket]);

    var ingressData = this.initiator
        ? Buffer.concat([xor(this.macSecret, this.remoteNonce), this.initPacket])
        : Buffer.concat([xor(this.macSecret, this.nonce), data]);

    this.ingressMac.rawUpdate(ingressData);
    this.egressMac.rawUpdate(egressData);
};

/**
 * formats packets as a 4-byte synchronisation token (0x22400891), a 4-byte
 * 'payload size', to be interpreted as a big-endian integer and finally an
 * N-byte rlp-serialised data structure, where N is the aforementioned
 * 'payload size'.
 * @method sendMessage
 * @param {Object} message a the message that is being sent
 * @param {Function} cb a callback function
 */
Peer.prototype.sendMessage = function(message, cb) {
  var payload = rlp.encode(message),
    len = new Buffer(4);

  len.writeUInt32BE(payload.length, 0);
  var formatedPayload = Buffer.concat([new Buffer(codes.syncToken, 'hex'), len, payload]);
  this.socket.write(formatedPayload, cb);
};

Peer.prototype._parsePayload = function(command, payload) {

  var code = codes.code[command],
    parseFunc = this.network._parseFuncs[code];

  if (parseFunc) {
    return parseFunc.bind(this)(payload);
  } else {
    throw ('invalid message id');
  }
};

Peer.addSubFunctions = function(def) {

  var root;
  var method;
  var name = def.meta.name;

  if (name) {
    root = Peer.prototype[name] = {};
  } else {
    name = '';
    root = Peer.prototype;
  }

  for (method in def.methods) {
    root[method] = function(method) {
      return function() {
        def.methods[method].apply(this, arguments);
      };
    }(method, name);
  }

  //attaches the sending functions to the subprotocol object
  for (var os in def.offsets) {
    method = def.offsets[os];

    //first function creates an enclosure
    root[method] = function(method, name) {
      return function() {
        var func = def.send[method];

        //if there is no sending definition for a message type then use this
        //function
        if (typeof func !== 'function') {
          func = function() {
            return [];
          };
        }

        var onDone = false;
        var cb = arguments[arguments.length - 1];
        if (typeof cb !== 'function') {
          cb = function() {};
        }

        cb = function() {
          if (onDone) onDone();
        };

        [].push.call(arguments, function(doneFunc) {
          onDone = doneFunc;
        });

        //run the function
        var message = func.apply(this, arguments);
        var offset = this.network._messageOffsets[name + method];
        message.unshift(offset);

        this.sendMessage(message, cb);
      };
    }(method, name);
  }
};

Peer.prototype.toString = function() {
  return this.socket.remoteAddress + ':' + this.socket.remotePort;
};
