'use strict'
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const rlp = require('rlp')
const BufferList = require('bl')
const ms = require('ms')
const util = require('../util')
const ECIES = require('./ecies')

const BASE_PROTOCOL_VERSION = 4
const BASE_PROTOCOL_LENGTH = 16

const PING_INTERVAL = ms('15s')

const PREFIXES = {
  HELLO: 0x00,
  DISCONNECT: 0x01,
  PING: 0x02,
  PONG: 0x03
}

function Peer (options) {
  EventEmitter.call(this)

  // hello data
  this._clientId = options.clientId
  this._capabilities = options.capabilities
  this._port = options.port
  this._id = options.id

  // ECIES session
  this._remoteId = options.remoteId
  this._eciesSession = new ECIES(options.privateKey, this._id, this._remoteId)

  // Auth, Ack, Header, Body
  this._state = 'Auth'
  this._hello = null
  this._nextPacketSize = 307

  // socket
  this._socket = options.socket
  this._socket.once('close', (err) => {
    this._closed = true
    clearInterval(this._pingIntervalId)
    clearTimeout(this._pingTimeoutId)
    this.emit('close', this._disconnectReason)
  })

  let bl = new BufferList()
  this._socket.on('data', (data) => {
    if (this._closed) return
    bl.append(data)
    while (bl.length >= this._nextPacketSize) {
      let bytesCount = this._nextPacketSize
      try {
        this._parsePacket(bl.slice(0, bytesCount))
      } catch (err) {
        this.emit('error', err)
      }
      bl.consume(bytesCount)
    }
  })

  this._connected = false
  this._closed = false
  this._disconnectReason = null
  this._pingIntervalId = null
  this._pingTimeout = options.timeout
  this._pingTimeoutId = null

  // sub-protocols
  this._protocols = []

  // send AUTH if outgoing connection
  if (this._remoteId !== null) this._sendAuth()
}

inherits(Peer, EventEmitter)

Peer.DISCONNECT_REASONS = Object.freeze({
  DISCONNECT_REQUESTED: 0x00,
  SUBSYSTEM_ERROR: 0x01,
  BREACH_OF_PROTOCOL: 0x02,
  USELESS_PEER: 0x03,
  TOO_MANY_PEERS: 0x04,
  ALREADY_CONNECTED: 0x05,
  INCOMPATIBLE_P2P_PROTOCOL_VERSION: 0x06,
  NULL_NODE_IDENTITY: 0x07,
  CLIENT_QUITTING: 0x08,
  UNEXPECTED_IDENTITY: 0x09,
  SAME_IDENTITY: 0x0a,
  TIMEOUT: 0x0b,
  SUBPROTOCOL_REASON: 0x10
})

Peer.prototype._parsePacket = function (data) {
  switch (this._state) {
    case 'Auth':
      this._eciesSession.parseAuth(data)
      this._state = 'Header'
      this._nextPacketSize = 32
      process.nextTick(() => this._sendAck())
      break

    case 'Ack':
      this._eciesSession.parseAck(data)
      this._state = 'Header'
      this._nextPacketSize = 32
      process.nextTick(() => this._sendHello())
      break

    case 'Header':
      let size = this._eciesSession.parseHeader(data)
      this._state = 'Body'
      this._nextPacketSize = size + 16
      if (size % 16 > 0) this._nextPacketSize += 16 - size % 16
      break

    case 'Body':
      let body = this._eciesSession.parseBody(data)
      this._state = 'Header'
      this._nextPacketSize = 32

      // TODO, FIXME: add decodeNumber to ethereumjs/rlp ?
      // https://github.com/ethereumjs/rlp/issues/10
      let code = body[0]
      if (code === 0x80) code = 0

      let obj = this._getProtocol(code)
      if (obj) obj.protocol._handleMessage(code - obj.offset, body.slice(1))

      break
  }
}

Peer.prototype._getProtocol = function (code) {
  if (code < BASE_PROTOCOL_LENGTH) return { protocol: this, offset: 0 }
  for (let obj of this._protocols) {
    if (code >= obj.offset && code < obj.offset + obj.length) return obj
  }
}

Peer.prototype._handleMessage = function (code, msg) {
  let payload = rlp.decode(msg)
  switch (code) {
    case PREFIXES.HELLO:
      this._hello = {
        protocolVersion: util.buffer2int(payload[0]),
        clientId: payload[1].toString(),
        capabilities: payload[2].map((item) => {
          return { name: item[0].toString(), version: util.buffer2int(item[1]) }
        }),
        port: util.buffer2int(payload[3]),
        id: payload[4]
      }
      this._remoteId = new Buffer(this._hello.id)

      let shared = {}
      for (let item of this._hello.capabilities) {
        for (let obj of this._capabilities) {
          if (obj.name !== item.name || obj.version !== item.version) continue
          if (shared[obj.name] && shared[obj.name].version > obj.version) continue
          shared[obj.name] = obj
        }
      }

      let offset = BASE_PROTOCOL_LENGTH
      this._protocols = Object.keys(shared).map((key) => shared[key])
        .sort((obj1, obj2) => obj1.name < obj2.name ? -1 : 1)
        .map((obj) => {
          let _offset = offset
          offset += obj.length

          let SubProtocol = obj.constructor
          let protocol = new SubProtocol(obj.version, this, (code, data) => {
            if (code > obj.length) throw new Error('Code out of range')
            this._sendMessage(_offset + code, data)
          })

          return { protocol, offset: _offset, length: obj.length }
        })

      if (this._protocols.length === 0) {
        return this._sendDisconnect(Peer.DISCONNECT_REASONS.INCOMPATIBLE_P2P_PROTOCOL_VERSION)
      }

      this._connected = true
      this._pingIntervalId = setInterval(() => this._sendPing(), PING_INTERVAL)
      this.emit('connect')
      break

    case PREFIXES.DISCONNECT:
      this._closed = true
      this._disconnectReason = payload[0][0]
      this._socket.end()
      break

    case PREFIXES.PING:
      this._sendPong()
      break

    case PREFIXES.PONG:
      clearTimeout(this._pingTimeoutId)
      break
  }
}

Peer.prototype._sendAuth = function () {
  if (this._closed) return
  this._socket.write(this._eciesSession.createAuth())
  this._state = 'Ack'
  this._nextPacketSize = 210
}

Peer.prototype._sendAck = function () {
  if (this._closed) return
  this._socket.write(this._eciesSession.createAck())
  this._state = 'Header'
  this._nextPacketSize = 32
  this._sendHello()
}

Peer.prototype._sendMessage = function (code, data) {
  if (this._closed) return false
  let msg = Buffer.concat([ rlp.encode(code), data ])
  this._socket.write(this._eciesSession.createHeader(msg.length))
  this._socket.write(this._eciesSession.createBody(msg))
  return true
}

Peer.prototype._sendHello = function () {
  let payload = [
    util.int2buffer(BASE_PROTOCOL_VERSION),
    this._clientId,
    this._capabilities.map((obj) => [ new Buffer(obj.name), util.int2buffer(obj.version) ]),
    this._port === null ? new Buffer(0) : util.int2buffer(this._port),
    this._id
  ]

  this._sendMessage(PREFIXES.HELLO, rlp.encode(payload))
}

Peer.prototype._sendPing = function () {
  let data = rlp.encode([])
  if (!this._sendMessage(PREFIXES.PING, data)) return

  clearTimeout(this._pingTimeoutId)
  this._pingTimeoutId = setTimeout(() => {
    this._sendDisconnect(Peer.DISCONNECT_REASONS.TIMEOUT)
  }, this._pingTimeout)
}

Peer.prototype._sendPong = function () {
  let data = rlp.encode([])
  this._sendMessage(PREFIXES.PONG, data)
}

Peer.prototype._sendDisconnect = function (reason) {
  let data = rlp.encode(reason)
  if (!this._sendMessage(PREFIXES.DISCONNECT, data)) return

  this._closed = true
  setTimeout(() => this._socket.end(), ms('2s'))
}

Peer.prototype.getId = function () {
  return new Buffer(this._remoteId)
}

Peer.prototype.getHelloMessage = function () {
  return this._hello
}

Peer.prototype.getProtocols = function () {
  return this._protocols.map((obj) => obj.protocol)
}

Peer.prototype.disconnect = function (reason) {
  this._sendDisconnect(reason || Peer.DISCONNECT_REASONS.DISCONNECT_REQUESTED)
}

module.exports = Peer
