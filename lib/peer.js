const util = require('util')
const ethUtil = require('ethereumjs-util')
const EventEmitter = require('events').EventEmitter
const ECIES = require('./ecies.js')
const rlp = require('rlp')
const Stream = require('./stream.js')

const prefix = {
  HELLO: 0x80,
  DISCONNECT: 1,
  PING: 2,
  PONG: 3
}

/**
 * The peer represents a peer on the ethereum network. Peer objects cannot be created directly. The `Network` creates them when a connection happens
 * @constructor
 * @param {Object} socket an Intialized Sockets. MUST alread be connected
 * @param {Object} network the network that initailized the connection
 * @param {Buffer} id
 * @fires connection
 * @fires close
 * @fires pong
 * @fires data
 */
var Peer = exports = module.exports = function (socket, network, id) {
  // Register as event emitter
  EventEmitter.call(this)

  this.id = id
  this.socket = socket
  this.network = network
  this.initiator = true // did this peer start the connection
  this.DISCONNECT_REASONS = Peer.disconnectReasons

  this.eciesSession = new ECIES(
    this.network.secretKey, // secert key
    Buffer.concat([new Buffer([4]), this.network.dpt.id]) // public key
  )

  if (id) {
    this.eciesSession.remotePubKey = Buffer.concat([new Buffer([4]), this.id]) // remote public key
  }

  // the ephemral shared secret
  Object.defineProperty(this, 'ephemeralSecret', {
    get: function () {
      if (!this._ephShared) {
        this._ephShared = ECIES.ecdh(this.ephemeralSecKey, Buffer.concat([new Buffer([4]), this.remoteEphemeralPubKey]))
      }
      return this._ephShared
    }
  })

  Object.defineProperty(this, 'staticSecret', {
    get: function () {
      if (!this._staticShared) {
        this._staticShared = ECIES.ecdh(this.network.secretKey, Buffer.concat([new Buffer([4]), this.id]))
      }
      return this._staticShared
    }
  })

  this.state = 'Auth'
  // Auth, Ack, HelloHeader, HelloFrame, Header, Frame
  this.hello = false // the info given by the hello packet

  this._nextPacketSize = 307

  var self = this
  socket.on('error', function (e) {
    self.emit('error', e)
  })

  var data = new Buffer([])

  // defines the packet parsing behavoir
  socket.on('data', function (newData) {
    var more = true
    data = Buffer.concat([data, newData])
    while (more) {
      if (data.length >= self._nextPacketSize) {
        var remainder = data.slice(self._nextPacketSize)
        self.parseData(data.slice(0, self._nextPacketSize))
        data = remainder
      } else {
        more = false
      }
    }
  })
}

util.inherits(Peer, EventEmitter)

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

Peer.prototype.sendAuth = function () {
  // public keys need 0x4 appended to them
  var self = this
  var msg = this.eciesSession.createAuth()
  this.socket.write(msg, function () {
    self.state = 'Ack'
    self._nextPacketSize = 210
  })
}

Peer.prototype.sendAck = function () {
  var self = this
  var msg = this.eciesSession.createAck(this.ourEphemeralPubKey, this.id, this.nonce)
  this.socket.write(msg, function () {
    self.state = 'Header'
    self._nextPacketSize = 32
    self.sendHello()
  })
}

Peer.prototype.parseData = function (data) {
  switch (this.state) {
    case 'Auth':
      this.eciesSession.parseAuth(data)
      this.id = this.eciesSession.remotePubKey.slice(1)
      this.sendAck()
      this.state = 'Header'
      this._nextPacketSize = 32
      break

    case 'Ack':
      this.eciesSession.parseAck(data)
      this.state = 'Header'
      this._nextPacketSize = 32
      this.sendHello()
      break

    case 'Header':
      var size = this.eciesSession.parseHeader(data)
      this.state = 'Body'
      var remainder = size % 16
      if (remainder) {
        this._nextPacketSize = (16 - remainder) + size + 16
      } else {
        this._nextPacketSize = size + 16
      }
      break

    case 'Body':
      var body = this.eciesSession.parseBody(data)
      // process the body
      // pipe out ect
      this.state = 'Header'
      this._nextPacketSize = 32

      var type = body.slice(0, 1)
      // check for base types
      if (type[0] < 0x10 || type[0] === 0x80) {
        this.parseBasePacket(type, body.slice(1))
      } else {
        /**
         * Emitted when the peer gets data from the network
         * @event Peer#data
         * @type {Buffer}
         */
        this.emit('data', body)
      }

      break
  // error
  }
}

Peer.prototype.parseBasePacket = function (type, data) {
  var decoded = rlp.decode(data)
  switch (type[0]) {
    // hello
    case 0x80:
      // mark hello
      this.hello = this.parseHello(decoded)
      this.caps = this.hello.capabilities
      var ourCaps = this.network.capabilities
      var sharedProto = []

      // disconnect if using differnt protocols versions
      for (var cap in this.hello.capabilities) {
        if (ourCaps[cap] && ourCaps[cap] !== this.hello.capabilities[cap]) {
          this.sendDisconnect(0x07)
        } else {
          sharedProto.push(cap)
        }
      }
      /**
       * Emitted whenever this peer connects. Gives the peer to the handler.
       * @event Peer#connection
       * @type {Peer} The peer that connected
       */
      this.emit('connection', this)
      break

    // on disconnect
    case 1:
      /**
       * Emitted when this peer disconnects. Gives the peer to the handler.
       * @event Peet#closing
       * @type {Peer} The peer that disconnected
       */
      this.emit('close')
      this.socket.end()
      break

    // on ping
    case 2:
      this.sendPong()
      break

    case 3:
      /**
       * Emitted when this peer gets a `pong`
       * @event Peer#pong
       * @type {object} the pong object
       */
      this.emit('pong')
      break
  }
}

/**
 * @method toString
 */
Peer.prototype.toString = function () {
  return this.socket.remoteAddress + ':' + this.socket.remotePort
}

Peer.prototype.parseHello = function (payload) {
  // build hello message
  var caps = {}
  payload[2].forEach(function (p) {
    caps[p[0].toString()] = ethUtil.bufferToInt(p[1])
  })

  var hello = {
    protocolVersion: payload[0][0],
    clientId: payload[1].toString(),
    capabilities: caps,
    port: ethUtil.bufferToInt(payload[3]),
    id: payload[4].toString('hex')
  }

  return hello
}

Peer.prototype.createHello = function () {
  var caps = []
  for (var cap in this.network.capabilities) {
    caps.push([cap, new Buffer([Number(this.network.capabilities[cap])])])
  }

  var message = [
    this.network.protocolVersion,
    this.network.clientId,
    caps,
    this.network.port,
    this.network.dpt.id
  ]

  return Buffer.concat([new Buffer([0x80]), rlp.encode(message)])
}

Peer.prototype.sendHello = function (cb) {
  var msg = this.createHello()
  this.sendMessage(msg, cb)
}

Peer.prototype.sendPing = function (cb) {
  var msg = new Buffer([prefix.PING, 0xc0])
  this.sendMessage(msg, cb)
}

Peer.prototype.sendPong = function (cb) {
  var msg = new Buffer([prefix.PONG, 0xc0])
  this.sendMessage(msg, cb)
}

Peer.prototype.sendDisconnect = function (reason) {
  if (reason === undefined) {
    reason = Peer.disconnectReasons.DISCONNECT_REQUESTED
  }

  var msg = new Buffer([prefix.DISCONNECT, rlp.encode[reason]])
  var header = this.eciesSession.createHeader(msg.length)
  var body = this.eciesSession.createBody(msg)
  try {
    this.socket.write(header)
    this.socket.end(body)
  } catch (e) {

  }
}

Peer.prototype.sendMessage = function (msg, cb) {
  var header = this.eciesSession.createHeader(msg.length)
  var body = this.eciesSession.createBody(msg)
  this.socket.write(header)
  this.socket.write(body, cb)
}

Peer.prototype.end = function (reason) {
  // stream.Duplex.prototype.end.call(this)
  this.sendDisconnect(reason)
}
/**
 * Creates a Duplex stream. Uses node's steams
 * @method createStream
 */
Peer.prototype.createStream = function (opts) {
  return new Stream(opts, this)
}
