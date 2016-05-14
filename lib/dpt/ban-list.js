'use strict'
const LRUCache = require('lru-cache')
const debug = require('debug')('devp2p:dpt:ban-list')

function BanList () {
  this._lru = new LRUCache({ max: 100000, stale: false })
}

BanList.prototype._getKeys = function (obj) {
  let keys = []
  if (Buffer.isBuffer(obj)) keys.push(obj.toString('hex'))
  if (obj && Buffer.isBuffer(obj.id)) keys.push(obj.id.toString('hex'))
  if (obj && obj.address && obj.port) keys.push(`${obj.address}:${obj.port}`)
  return keys
}

BanList.prototype.add = function (obj, period) {
  for (let key of this._getKeys(obj)) {
    debug(`add ${key}, size: ${this._lru.length}`)
    this._lru.set(key, true, period)
  }
}

BanList.prototype.has = function (obj) {
  return this._getKeys(obj).some((key) => this._lru.get(key))
}

module.exports = BanList
