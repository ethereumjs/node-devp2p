const SHA3 = require('keccakjs')
const secp256k1 = require('secp256k1')

exports.keccak256 = function (buffer) {
  return new Buffer(new SHA3(256).update(buffer).digest('hex'), 'hex')
}

exports.id2pk = function (id) {
  return Buffer.concat([ new Buffer([ 0x04 ]), id ])
}

exports.pk2id = function (pk) {
  if (pk.length === 33) pk = secp256k1.publicKeyConvert(pk, false)
  return pk.slice(1)
}

exports.buffer2int = function (buffer) {
  if (buffer.length === 0) return NaN

  let n = 0
  for (let i = 0; i < buffer.length; ++i) n = n * 256 + buffer[i]
  return n
}

exports.int2buffer = function (n) {
  let s = n.toString(16)
  if (s.length % 2 === 1) s = '0' + s
  return new Buffer(s, 'hex')
}

exports.zfill = function (buffer, size, leftpad) {
  if (buffer.length >= size) return buffer
  if (leftpad === undefined) leftpad = true
  let pad = new Buffer(size - buffer.length).fill(0x00)
  return leftpad ? Buffer.concat([ pad, buffer ]) : Buffer.concat([ buffer, pad ])
}
