'use strict'
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const dgram = require('dgram')
const ms = require('ms')
const LRUCache = require('lru-cache')
const debug = require('debug')('devp2p:dpt:server')
const types = require('./types')

const VERSION = 0x04

function Server (dpt, privateKey, options) {
  EventEmitter.call(this)

  this._dpt = dpt
  this._privateKey = privateKey

  this._timeout = options.timeout || ms('10s')
  this._endpoint = options.endpoint || { address: '0.0.0.0', udpPort: null, tcpPort: null }
  this._requests = {}
  this._pingsCache = new LRUCache({ max: 1000, maxAge: ms('1s'), stale: false })

  let createSocket = options.createSocket || dgram.createSocket.bind(null, 'udp4')
  this._socket = createSocket()
  this._socket.once('listening', () => this.emit('listening'))
  this._socket.once('close', () => {
    this._socket.removeAllListeners()
    this.emit('close')
  })
  this._socket.on('error', (err) => this.emit('error', err))
  this._socket.on('message', (msg, rinfo) => {
    try {
      this._msgHandler(msg, rinfo)
    } catch (err) {
      this.emit('error', err)
    }
  })
}

inherits(Server, EventEmitter)

Server.prototype.bind = function () {
  if (this._socket === null) throw new Error('Server already destroyed')
  debug('call .bind')

  this._socket.bind.apply(this._socket, arguments)
}

Server.prototype.destroy = function () {
  if (this._socket === null) throw new Error('Server already destroyed')
  debug('call .destroy')

  this._socket.removeAllListeners()
  this._socket.once('close', () => this.emit('close'))
  this._socket.close()
  this._socket = null
}

Server.prototype.sendPing = function (peer, callback) {
  if (this._socket === null) return callback(new Error('Server already destroyed'))

  let cacheKey = `${peer.address}:${peer.udpPort}`
  let promise = this._pingsCache.get(cacheKey)
  if (promise === undefined) {
    let data = {
      version: VERSION,
      from: this._endpoint,
      to: peer
    }

    let defer
    promise = new Promise((resolve, reject) => { defer = { resolve, reject } })
    this._pingsCache.set(cacheKey, promise)

    let hash = this._sendPacket(peer, 'ping', data)
    this._pushRequest(hash, peer, 'ping', (err, peer) => {
      if (err) defer.reject(err)
      else defer.resolve(peer)
    })
  }

  promise.then((peer) => callback(null, peer), (reason) => callback(reason))
}

Server.prototype.sendFindNeighbours = function (peer, id, callback) {
  if (this._socket === null) return callback(new Error('Server already destroyed'))

  this._sendPacket(peer, 'findneighbours', { id })
  this._pushRequest(peer.id, peer, 'findneighbours', callback)
}

Server.prototype._sendPacket = function (peer, typename, data) {
  debug(`send ${typename} to ${peer.address}:${peer.udpPort} (peerId: ${peer.id && peer.id.toString('hex')})`)

  let packet = types.packet.encode(typename, data, this._privateKey)
  this._socket.send(packet, 0, packet.length, peer.udpPort, peer.address)
  return packet.slice(0, 32)
}

Server.prototype._pushRequest = function (key, peer, command, callback) {
  let skey = key.toString('hex')
  if (this._requests[skey] === undefined) this._requests[skey] = []
  this._requests[skey].push({
    peer: peer,
    callback: callback,
    timeoutId: setTimeout(() => {
      debug(`${command} timeout for ${skey}`)
      let errMsg = `Timeout error: ${command} ${peer.address}:${peer.udpPort}`
      this._popRequests(key, (request) => request.callback(new Error(errMsg)))
    }, this._timeout)
  })
}

Server.prototype._popRequests = function (key, callback) {
  let skey = key.toString('hex')
  let requests = this._requests[skey] || []
  delete this._requests[skey]

  for (let request of requests) {
    clearTimeout(request.timeoutId)
    callback(request)
  }
}

Server.prototype._msgHandler = function (msg, rinfo) {
  let info = types.packet.decode(msg)
  debug(`received ${info.typename} from ${rinfo.address}:${rinfo.port} (peerId: ${info.publicKey.toString('hex')})`)

  // add peer if not in our table
  let peer = this._dpt.getPeer(info.publicKey)
  if (peer === null && info.typename === 'ping' && info.data.from.udpPort !== null) {
    // prevent sending second ping
    setTimeout(() => {
      this._dpt.addPeer(info.data.from, () => {})
    }, ms('50ms'))
  }

  switch (info.typename) {
    case 'ping':
      Object.assign(rinfo, { id: info.publicKey, udpPort: rinfo.port })
      this._sendPacket(rinfo, 'pong', {
        to: {
          address: rinfo.address,
          udpPort: rinfo.port,
          tcpPort: info.data.from.tcpPort
        },
        hash: msg.slice(0, 32)
      })
      break

    case 'pong':
      this._popRequests(info.data.hash, (request) => {
        request.callback(null, {
          id: info.publicKey,
          address: request.peer.address,
          udpPort: request.peer.udpPort,
          tcpPort: request.peer.tcpPort
        })
      })
      break

    case 'findneighbours':
      Object.assign(rinfo, { id: info.publicKey, udpPort: rinfo.port })
      this._sendPacket(rinfo, 'neighbours', {
        peers: this._dpt.getClosestPeers(info.publicKey)
      })
      break

    case 'neighbours':
      this._popRequests(info.publicKey, (request) => {
        request.callback(null, info.data.peers.map((peer) => peer.endpoint))
      })
      break
  }
}

module.exports = Server
