'use strict'
const net = require('net')
const enableServerDestroy = require('server-destroy')
const secp256k1 = require('secp256k1')
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const ms = require('ms')
const debug = require('debug')('devp2p:rlpx')
const pVersion = require('../../package.json').version
const util = require('../util')
const Peer = require('./peer')

function RLPx (privateKey, options) {
  EventEmitter.call(this)

  this._privateKey = new Buffer(privateKey)
  this._id = util.pk2id(secp256k1.publicKeyCreate(this._privateKey, false))

  // options
  this._timeout = options.timeout || ms('10s')
  this._maxPeers = options.maxPeers || 10
  this._clientId = new Buffer(options.clientId || `Ethereum Node.js/${pVersion}`)
  this._capabilities = options.capabilities
  this._listenPort = options.listenPort

  // DPT
  this._dpt = options.dpt || null
  if (this._dpt !== null) {
    this._dpt.on('peer:add', (peer) => {
      if (this._getOpenSlots() > 0) this._connectById(peer.id)
      else this._peersQueue.unshift(peer.id.toString('hex')) // no open slots, save to queue
    })
    this._dpt.on('peer:remove', (peer) => {
      let index = this._peersQueue.indexOf(peer.id.toString('hex'))
      if (index !== -1) this._peersQueue.splice(index, 1) // remove from queue
    })
  }

  // internal
  this._server = net.createServer()
  enableServerDestroy(this._server)

  this._peers = {}
  this._peersHandshake = new Set()
  this._peersQueue = []
}

inherits(RLPx, EventEmitter)

RLPx.prototype.listen = function () {
  if (this._server === null) throw new Error('Server already closed')
  if (this._server.listening) throw new Error('Server already started')
  debug('call .listen')

  this._server.listen.apply(this._server, arguments)

  this._server.once('listening', () => this.emit('listening'))
  this._server.once('close', () => this.emit('close'))
  this._server.on('error', (err) => this.emit('error', err))
  this._server.on('connection', (socket) => this._onConnect(socket, null, () => {}))
}

RLPx.prototype.close = function (callback) {
  if (this._server === null) throw new Error('Server already closed')
  debug('call .close')

  this._server.removeAllListeners()
  this._server.close()
  this._server = null

  for (let key of Object.keys(this._peers)) this.disconnect(new Buffer(key, 'hex'), () => {})
}

RLPx.prototype.connect = function (peer, callback) {
  if (!Buffer.isBuffer(peer.id)) throw new TypeError('Expected peer.id as Buffer')
  if (this._peers[peer.id.toString('hex')]) return callback(new Error('Already connected'))
  if (this._getOpenSlots() === 0) return callback(new Error('Too much peers already connected'))
  debug(`connect to ${peer.address}:${peer.port} (id: ${peer.id.toString('hex')})`)

  let wasCalled = false
  let _callback = (err) => {
    if (wasCalled) return
    wasCalled = true

    if (err !== null) {
      if (this._dpt !== null) this._dpt.banPeer(peer, ms('5m'))
      this._peersHandshake.delete(socket)
      this._refillConnections()
    }

    callback(err)
  }

  let socket = new net.Socket()
  this._peersHandshake.add(socket)

  socket.once('error', _callback)
  socket.setTimeout(this._timeout, () => {
    if (connected) return
    socket.destroy()
    _callback(new Error('Connection timeout'))
  })

  let connected = false
  socket.connect(peer.port, peer.address, () => {
    connected = true
    socket.on('error', (err) => this.emit('error', err))
    socket.removeListener('error', _callback)
    this._onConnect(socket, peer.id, _callback)
  })
}

RLPx.prototype.getPeers = function () {
  return Object.keys(this._peers).map((id) => this._peers[id])
}

RLPx.prototype.disconnect = function (id, callback) {
  let key = id.toString('hex')
  let peer = this._peers[key]
  if (peer === undefined) return

  delete this._peers[key]
  if (callback) peer._socket.once('close', () => callback(null))
  peer.disconnect(Peer.DISCONNECT_REASONS.CLIENT_QUITTING)
  setTimeout(() => peer._socket.end(), ms('2s'))
}

RLPx.prototype._getOpenSlots = function () {
  return Math.max(this._maxPeers - Object.keys(this._peers).length - this._peersHandshake.size, 0)
}

RLPx.prototype._connectById = function (id, callback) {
  let peer = this._dpt.getPeer(id)
  this.connect({ id: peer.id, address: peer.endpoint.address, port: peer.endpoint.tcpPort }, () => {})
}

RLPx.prototype._onConnect = function (socket, id, callback) {
  debug(`connected to ${socket.remoteAddress}:${socket.remotePort}, handshake waiting..`)

  let newPeer = () => {
    return new Peer({
      socket: socket,
      remoteId: id,
      privateKey: this._privateKey,
      id: this._id,

      timeout: this._timeout,
      clientId: this._clientId,
      capabilities: this._capabilities,
      port: this._listenPort
    })
  }

  if (id === null) {
    // handle incoming connection when we haven't open slots
    if (this._getOpenSlots() === 0) {
      let peer = newPeer()
      peer.once('connect', () => peer.disconnect(Peer.DISCONNECT_REASONS.TOO_MANY_PEERS))
      return callback(new Error('Too much peers already connected'))
    }

    this._peersHandshake.add(socket)
  }

  let peer = newPeer()
  process.nextTick(() => callback(null, peer))

  let connecting = true
  peer.once('connect', () => {
    debug(`handshake with ${socket.remoteAddress}:${socket.remotePort} was successful`)
    connecting = false
    this._peersHandshake.delete(socket)
    if (this._peers[peer.getId().toString('hex')]) {
      return peer.disconnect(Peer.DISCONNECT_REASONS.ALREADY_CONNECTED)
    }

    this._peers[peer.getId().toString('hex')] = peer
    this.emit('peer:add', peer)
  })

  peer.once('close', (reason) => {
    delete this._peers[peer.getId().toString('hex')]
    if (this._dpt !== null && this._dpt.getPeer(peer.getId()) !== null) {
      this._peersQueue.push(peer.getId().toString('hex'))
    }

    this.emit('peer:remove', peer, reason)
  })

  socket.once('close', () => {
    if (connecting && this._dpt !== null) {
      this._dpt.banPeer({ id, address: peer.remoteAddress, port: peer.remotePort }, ms('5m'))
    }

    peer.removeAllListeners()
    socket.removeAllListeners()
    this._peersHandshake.delete(socket)
    this._refillConnections()
  })
}

RLPx.prototype._refillConnections = function () {
  let next = () => {
    debug(`refill connections.. queue size: ${this._peersQueue.length}, open slots: ${this._getOpenSlots()}`)
    if (this._server === null || this._peersQueue.length === 0 || this._getOpenSlots() === 0) return
    this._connectById(new Buffer(this._peersQueue.shift(), 'hex'), next)
  }

  for (let i = 0, max = this._getOpenSlots(); i < max; ++i) next()
}

module.exports = RLPx
