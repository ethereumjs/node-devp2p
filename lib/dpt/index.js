'use strict'
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const crypto = require('crypto')
const secp256k1 = require('secp256k1')
const ms = require('ms')
const debug = require('debug')('devp2p:dpt')
const util = require('../util')
const KBucket = require('./kbucket')
const BanList = require('./ban-list')
const Server = require('./server')

function DPT (privateKey, options) {
  EventEmitter.call(this)

  this._privateKey = new Buffer(privateKey)
  this._id = util.pk2id(secp256k1.publicKeyCreate(this._privateKey, false))

  this._banlist = new BanList()

  this._kbucket = new KBucket(this._id)
  this._kbucket.on('add', (peer) => this.emit('peer:add', peer))
  this._kbucket.on('remove', (peer) => this.emit('peer:remove', peer))
  this._kbucket.on('ping', (oldPeers, newPeer) => {
    if (this._banlist.has(newPeer)) return

    let count = 0
    let err = null
    for (let peer of oldPeers) {
      this._server.sendPing(peer, (_err) => {
        if (_err !== null) {
          this._banlist.add(peer, ms('5m'))
          this._kbucket.remove(peer)
        }

        err = err || _err
        if (++count === oldPeers.length) {
          if (err === null) this._banlist.add(newPeer, ms('5m'))
          else this._kbucket.add(newPeer)
        }
      })
    }
  })

  this._server = new Server(this, this._privateKey, {
    createSocket: options.createSocket,
    timeout: options.timeout,
    endpoint: options.endpoint
  })
  this._server.on('error', (err) => this.emit('error', err))

  this._refreshIntervalId = null
  this._refreshIntervial = options.refreshIntervial || ms('60s')
}

inherits(DPT, EventEmitter)

DPT.prototype.bind = function () {
  this._server.bind.apply(this._server, arguments)

  this._server.once('listening', () => {
    this._refreshIntervalId = setInterval(() => this.refresh(), this._refreshIntervial)
    this.emit('listening')
  })
}

DPT.prototype.close = function () {
  this._server.close()

  this._server.once('close', () => {
    clearInterval(this._refreshIntervalId)
    this._server.removeAllListeners()
    this.emit('close')
  })
}

DPT.prototype.bootstrap = function (peer, callback) {
  debug(`bootstrap with peer ${peer.address}:${peer.port}`)

  this.addPeer(peer, (err, peer) => {
    if (err) return callback(err)
    this._server.sendFindNeighbours(peer, this._id, (err, peers) => {
      if (err === null) {
        for (let peer of peers) this.addPeer(peer, () => {})
      }

      return callback(err)
    })
  })
}

DPT.prototype.addPeer = function (obj, callback) {
  if (this._banlist.has(obj)) return callback(new Error('Peer is banned'))
  debug(`attempt adding peer ${obj.address}:${obj.port}`)

  // check in bucket
  let peer = this._kbucket.get(obj)
  if (peer !== null) return callback(null, peer)

  // check that peer is alive
  this._server.sendPing(obj, (err, peer) => {
    if (err === null) this._kbucket.add(peer)
    else this._banlist.add(obj, ms('5m'))

    callback(err, peer)
  })
}

DPT.prototype.getPeer = function (obj) {
  return this._kbucket.get(obj)
}

DPT.prototype.getPeers = function () {
  return this._kbucket.getAll()
}

DPT.prototype.getClosestPeers = function (id) {
  return this._kbucket.closest(id)
}

DPT.prototype.removePeer = function (obj) {
  this._kbucket.remove(obj)
}

DPT.prototype.banPeer = function (obj, period) {
  this._banlist.add(obj, period)
  this._kbucket.remove(obj)
}

DPT.prototype.refresh = function () {
  let peers = this.getPeers()
  debug(`call .refresh (${peers.length} peers in table)`)

  for (let peer of peers) {
    this._server.sendFindNeighbours(peer, crypto.randomBytes(64), (err, peers) => {
      if (err !== null) return
      for (let peer of peers) this.addPeer(peer, () => {})
    })
  }
}

module.exports = DPT
