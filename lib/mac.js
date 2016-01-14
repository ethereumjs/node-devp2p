const SHA3 = require('keccakjs')
const xor = require('buffer-xor')
const crypto = require('crypto')

var MAC = module.exports = function (secret) {
  this.secret = secret
  this.sha3 = new SHA3(256)
}

// Updates the underlining SHA3 256
MAC.prototype.rawUpdate = function (data) {
  this.sha3.update(data)
}

MAC.prototype.updateHeader = function (data) {
  var aes = crypto.createCipheriv('aes-256-ecb', this.secret, '')
  var encrypted = aes.update(this.digest())
  this.sha3.update(xor(encrypted, data))
}

MAC.prototype.updateBody = function (data) {
  this.sha3.update(data)
  var prev = this.digest()
  var aes = crypto.createCipheriv('aes-256-ecb', this.secret, '')
  var encrypted = aes.update(prev)
  this.sha3.update(xor(encrypted, prev))
}

MAC.prototype.digest = function () {
  return new Buffer(this.sha3.digest('hex'), 'hex').slice(0, 16)
}
