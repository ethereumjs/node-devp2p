'use strict'
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const _KBucket = require('k-bucket')

const KBUCKET_SIZE = 16
const KBUCKET_CONCURRENCY = 3

function KBucket (id) {
  EventEmitter.call(this)

  this._kbucket = new _KBucket({
    localNodeId: id,
    numberOfNodesPerKBucket: KBUCKET_SIZE,
    numberOfNodesToPing: KBUCKET_CONCURRENCY,
    ping: this.emit.bind(this, 'ping')
  })
  this._peers = new Map()
}

inherits(KBucket, EventEmitter)

KBucket.prototype._getKeys = function (obj) {
  let keys = []
  if (Buffer.isBuffer(obj)) keys.push(obj.toString('hex'))
  if (obj && Buffer.isBuffer(obj.id)) keys.push(obj.id.toString('hex'))
  if (obj && obj.address && obj.port) keys.push(`${obj.address}:${obj.port}`)
  return keys
}

KBucket.prototype.add = function (peer) {
  if (this.has(peer)) return
  // add to bucket
  this._kbucket.add(peer)
  // check that was added
  if (this._kbucket.get(peer.id) !== null) {
    this._getKeys(peer).forEach((key) => this._peers.set(key, peer))
    this.emit('add', peer)
  }
}

KBucket.prototype.get = function (obj) {
  for (let key of this._getKeys(obj)) {
    let peer = this._peers.get(key)
    if (peer !== undefined) return peer
  }

  return null
}

KBucket.prototype.has = function (obj) {
  return this._getKeys(obj).some((key) => this._peers.has(key))
}

KBucket.prototype.getAll = function () {
  return this._kbucket.toArray()
}

KBucket.prototype.closest = function (id) {
  return this._kbucket.closest({ id }, KBUCKET_SIZE)
}

KBucket.prototype.remove = function (obj) {
  // check that exists
  let peer = this.get(obj)
  if (peer === null) return
  // remove from bucket
  this._kbucket.remove(peer)
  this._getKeys(peer).forEach((key) => this._peers.delete(key))
  this.emit('remove', peer)
}

module.exports = KBucket
