const crypto = require('crypto')
const SHA3 = require('keccakjs')
const xor = require('buffer-xor')

function MAC (secret) {
  this._hash = new SHA3(256)
  this._secret = secret
}

MAC.prototype.update = function (data) {
  this._hash.update(data)
}

MAC.prototype.updateHeader = function (data) {
  let aes = crypto.createCipheriv('aes-256-ecb', this._secret, '')
  let encrypted = aes.update(this.digest())
  this._hash.update(xor(encrypted, data))
}

MAC.prototype.updateBody = function (data) {
  this._hash.update(data)
  let prev = this.digest()
  let aes = crypto.createCipheriv('aes-256-ecb', this._secret, '')
  let encrypted = aes.update(prev)
  this._hash.update(xor(encrypted, prev))
}

MAC.prototype.digest = function () {
  return new Buffer(this._hash.digest('hex'), 'hex').slice(0, 16)
}

module.exports = MAC
