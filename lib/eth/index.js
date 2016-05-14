'use strict'
const EventEmitter = require('events').EventEmitter
const inherits = require('inherits')
const rlp = require('rlp')
const ms = require('ms')
const util = require('../util')
const Peer = require('../rlpx/peer')

function ETH (version, peer, send) {
  EventEmitter.call(this)

  this._version = version
  this._peer = peer
  this._send = send

  this._status = null
  this._peerStatus = null
  this._statusTimeoutId = setTimeout(() => {
    this._peer.disconnect(Peer.DISCONNECT_REASONS.TIMEOUT)
  }, ms('5s'))
}

inherits(ETH, EventEmitter)

ETH.eth61 = Object.freeze({ name: 'eth', version: 61, length: 9, constructor: ETH })
ETH.eth62 = Object.freeze({ name: 'eth', version: 62, length: 8, constructor: ETH })
ETH.eth63 = Object.freeze({ name: 'eth', version: 63, length: 17, constructor: ETH })

ETH.MESSAGE_CODES = Object.freeze({
  STATUS: 0x00,
  NEW_BLOCK_HASHES: 0x01,
  TX: 0x02,
  GET_BLOCK_HASHES: 0x03,
  BLOCK_HASHES: 0x04,
  GET_BLOCKS: 0x05,
  BLOCKS: 0x06,
  NEW_BLOCK: 0x07,

  // eth61 specific
  GET_BLOCK_HASHES_FROM_NUMBER: 0x08,

  // eth62 specific
  GET_BLOCK_HEADERS: 0x03,
  BLOCK_HEADERS: 0x04,
  GET_BLOCK_BODIES: 0x05,
  BLOCK_BODIES: 0x06,

  // eth63 specific
  GET_NODE_DATA: 0x0d,
  NODE_DATA: 0x0e,
  GET_RECEIPTS: 0x0f,
  RECEIPTS: 0x10
})

ETH.prototype._handleMessage = function (code, data) {
  try {
    let payload = rlp.decode(data)
    switch (code) {
      case ETH.MESSAGE_CODES.STATUS:
        if (this._peerStatus !== null) throw new Error('Uncontrolled status message')
        this._peerStatus = payload
        this._handleStatus()
        return

      case ETH.MESSAGE_CODES.NEW_BLOCK_HASHES:
      case ETH.MESSAGE_CODES.NEW_BLOCK:
      case ETH.MESSAGE_CODES.TX:
        break

      case ETH.MESSAGE_CODES.GET_BLOCK_HASHES:
      case ETH.MESSAGE_CODES.GET_BLOCK_HASHES_FROM_NUMBER:
      case ETH.MESSAGE_CODES.BLOCK_HASHES:
      case ETH.MESSAGE_CODES.GET_BLOCKS:
      case ETH.MESSAGE_CODES.BLOCKS:
        if (this._version <= ETH.eth61.version) break
        return

      case ETH.MESSAGE_CODES.GET_BLOCK_HEADERS:
      case ETH.MESSAGE_CODES.BLOCK_HEADERS:
      case ETH.MESSAGE_CODES.GET_BLOCK_BODIES:
      case ETH.MESSAGE_CODES.BLOCK_BODIES:
        if (this._version >= ETH.eth62.version) break
        return

      case ETH.MESSAGE_CODES.GET_NODE_DATA:
      case ETH.MESSAGE_CODES.NODE_DATA:
      case ETH.MESSAGE_CODES.GET_RECEIPTS:
      case ETH.MESSAGE_CODES.RECEIPTS:
        if (this._version >= ETH.eth63.version) break
        return

      default:
        return
    }

    this.emit('message', code, payload)
  } catch (err) {
    this.emit('error', err)
  }
}

ETH.prototype._handleStatus = function () {
  if (this._status === null || this._peerStatus === null) return
  clearTimeout(this._statusTimeoutId)

  try {
    if (!this._status[0].equals(this._peerStatus[0])) throw new Error('Protocol version mismatch')
    if (!this._status[1].equals(this._peerStatus[1])) throw new Error('NetworkId mismatch')
    if (!this._status[4].equals(this._peerStatus[4])) throw new Error('Genesis block mismatch')
  } catch (err) {
    this._peer.disconnect(Peer.DISCONNECT_REASONS.SUBPROTOCOL_REASON)
    return this.emit('error', err)
  }

  this.emit('status', {
    networkId: this._peerStatus[1],
    td: new Buffer(this._peerStatus[2]),
    bestHash: new Buffer(this._peerStatus[3]),
    genesisHash: new Buffer(this._peerStatus.genesisHash[4])
  })
}

ETH.prototype.getVersion = function () {
  return this._version
}

ETH.prototype.sendStatus = function (status) {
  if (this._status !== null) return
  this._status = [
    util.int2buffer(this._version),
    util.int2buffer(status.networkId),
    status.td,
    status.bestHash,
    status.genesisHash
  ]

  this._send(ETH.MESSAGE_CODES.STATUS, rlp.encode(this._status))
  this._handleStatus()
}

ETH.prototype.sendMessage = function (code, payload) {
  switch (code) {
    case ETH.MESSAGE_CODES.STATUS:
      throw new Error('Please send status message through .sendStatus')

    case ETH.MESSAGE_CODES.NEW_BLOCK_HASHES:
    case ETH.MESSAGE_CODES.NEW_BLOCK:
    case ETH.MESSAGE_CODES.TX:
      break

    case ETH.MESSAGE_CODES.GET_BLOCK_HASHES:
    case ETH.MESSAGE_CODES.GET_BLOCK_HASHES_FROM_NUMBER:
    case ETH.MESSAGE_CODES.BLOCK_HASHES:
    case ETH.MESSAGE_CODES.GET_BLOCKS:
    case ETH.MESSAGE_CODES.BLOCKS:
      if (this._version <= ETH.eth61.version) break
      throw new Error(`Code ${code} not allowed with version ${this._version}`)

    case ETH.MESSAGE_CODES.GET_BLOCK_HEADERS:
    case ETH.MESSAGE_CODES.BLOCK_HEADERS:
    case ETH.MESSAGE_CODES.GET_BLOCK_BODIES:
    case ETH.MESSAGE_CODES.BLOCK_BODIES:
      if (this._version >= ETH.eth62.version) break
      throw new Error(`Code ${code} not allowed with version ${this._version}`)

    case ETH.MESSAGE_CODES.GET_NODE_DATA:
    case ETH.MESSAGE_CODES.NODE_DATA:
    case ETH.MESSAGE_CODES.GET_RECEIPTS:
    case ETH.MESSAGE_CODES.RECEIPTS:
      if (this._version >= ETH.eth63.version) break
      throw new Error(`Code ${code} not allowed with version ${this._version}`)

    default:
      throw new Error(`Unknown code ${code}`)
  }

  this._send(code, rlp.encode(payload))
}

module.exports = ETH
