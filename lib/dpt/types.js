'use strict'
const ip = require('ip')
const rlp = require('rlp')
const secp256k1 = require('secp256k1')
const util = require('../util')

const TYPENAMES = {
  BY_NAME: {
    ping: 0x01,
    pong: 0x02,
    findneighbours: 0x03,
    neighbours: 0x04
  },
  BY_TYPE: {
    0x01: 'ping',
    0x02: 'pong',
    0x03: 'findneighbours',
    0x04: 'neighbours'
  }
}

function getTimestamp () {
  return (Date.now() / 1000) | 0
}

const timestamp = {
  encode: function (value) {
    if (value === undefined) value = getTimestamp() + 60 // hack
    let buffer = new Buffer(4)
    buffer.writeUInt32BE(value)
    return buffer
  },
  decode: function (buffer) {
    if (buffer.length !== 4) throw new RangeError(`Invalid timestamp buffer :${buffer.toString('hex')}`)
    return buffer.readUInt32BE(0)
  }
}

const address = {
  encode: function (value) {
    if (ip.isV4Format(value)) return ip.toBuffer(value)
    if (ip.isV6Format(value)) return ip.toBuffer(value)
    throw new Error(`Invalid address: ${value}`)
  },
  decode: function (buffer) {
    if (buffer.length === 4) return ip.toString(buffer)
    if (buffer.length === 16) return ip.toString(buffer)
    throw new Error(`Invalid address buffer: ${buffer.toString('hex')}`)
  }
}

const port = {
  encode: function (value) {
    if (value === null) return new Buffer(0)
    if ((value >>> 16) > 0) throw new RangeError(`Invalid port: ${value}`)
    return new Buffer([ (value >>> 8) & 0xff, (value >>> 0) & 0xff ])
  },
  decode: function (buffer) {
    if (buffer.length === 0) return null
    if (buffer.length !== 2) throw new RangeError(`Invalid port buffer: ${buffer.toString('hex')}`)
    return (buffer[0] << 8) + buffer[1]
  }
}

const endpoint = {
  encode: function (obj) {
    return [
      address.encode(obj.address),
      port.encode(obj.udpPort),
      port.encode(obj.tcpPort)
    ]
  },
  decode: function (payload) {
    return {
      address: address.decode(payload[0]),
      udpPort: port.decode(payload[1]),
      tcpPort: port.decode(payload[2])
    }
  }
}

const ping = {
  encode: function (obj) {
    return [
      new Buffer([ obj.version ]),
      endpoint.encode(obj.from),
      endpoint.encode(obj.to),
      timestamp.encode(obj.timestamp)
    ]
  },
  decode: function (payload) {
    return {
      version: payload[0][0],
      from: endpoint.decode(payload[1]),
      to: endpoint.decode(payload[2]),
      timestamp: timestamp.decode(payload[3])
    }
  }
}

const pong = {
  encode: function (obj) {
    return [
      endpoint.encode(obj.to),
      obj.hash,
      timestamp.encode(obj.timestamp)
    ]
  },
  decode: function (payload) {
    return {
      to: endpoint.decode(payload[0]),
      hash: payload[1],
      timestamp: timestamp.decode(payload[2])
    }
  }
}

const findneighbours = {
  encode: function (obj) {
    return [
      obj.id,
      timestamp.encode(obj.timestamp)
    ]
  },
  decode: function (payload) {
    return {
      id: payload[0],
      timestamp: timestamp.decode(payload[1])
    }
  }
}

const neighbours = {
  encode: function (obj) {
    return [
      obj.peers.map((peer) => {
        return endpoint.encode(peer).concat(peer.id)
      }),
      timestamp.encode(obj.timestamp)
    ]
  },
  decode: function (payload) {
    return {
      peers: payload[0].map((data) => {
        return { endpoint: endpoint.decode(data), id: data[3] } // hack for id
      }),
      timestamp: timestamp.decode(payload[1])
    }
  }
}

const packet = {
  encode: function (typename, data, privateKey) {
    let type = TYPENAMES.BY_NAME[typename]

    if (type === 0x01) data = ping.encode(data)
    else if (type === 0x02) data = pong.encode(data)
    else if (type === 0x03) data = findneighbours.encode(data)
    else if (type === 0x04) data = neighbours.encode(data)
    else throw new RangeError(`Invalid typename: ${typename}`)

    let typedata = Buffer.concat([ new Buffer([ type ]), rlp.encode(data) ])
    let sighash = util.keccak256(typedata)
    let sig = secp256k1.sign(sighash, privateKey)
    let hashdata = Buffer.concat([ sig.signature, new Buffer([ sig.recovery ]), typedata ])
    let hash = util.keccak256(hashdata)
    return Buffer.concat([ hash, hashdata ])
  },
  decode: function (buffer) {
    let hash = util.keccak256(buffer.slice(32))
    if (!buffer.slice(0, 32).equals(hash)) throw new Error('Hash verification failed')

    let signature = buffer.slice(32, 96)
    let typedata = buffer.slice(97)
    let sighash = util.keccak256(typedata)
    let publicKey = util.pk2id(secp256k1.recover(sighash, signature, buffer[96], false))

    let type = typedata[0]
    let data = rlp.decode(typedata.slice(1))
    if (type === 0x01) data = ping.decode(data)
    else if (type === 0x02) data = pong.decode(data)
    else if (type === 0x03) data = findneighbours.decode(data)
    else if (type === 0x04) data = neighbours.decode(data)
    else throw new RangeError(`Invalid type: ${type}`)

    return { typename: TYPENAMES.BY_TYPE[type], data, publicKey }
  }
}

module.exports = {
  address,
  port,
  endpoint,
  ping,
  pong,
  findneighbours,
  neighbours,
  packet
}
