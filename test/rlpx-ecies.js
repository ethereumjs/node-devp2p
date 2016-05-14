const crypto = require('crypto')
const secp256k1 = require('secp256k1')
const test = require('tape')
const devp2p = require('../lib')
const ECIES = require('../lib/rlpx/ecies')

function beforeEach (fn) {
  return (t) => {
    let privateKey1 = devp2p._util.genPrivateKey(32)
    let privateKey2 = devp2p._util.genPrivateKey(32)
    let publicKey1 = secp256k1.publicKeyCreate(privateKey1, false)
    let publicKey2 = secp256k1.publicKeyCreate(privateKey2, false)
    t.context = {
      a: new ECIES(privateKey1, devp2p._util.pk2id(publicKey1), devp2p._util.pk2id(publicKey2)),
      b: new ECIES(privateKey2, devp2p._util.pk2id(publicKey2), devp2p._util.pk2id(publicKey1))
    }

    fn(t)
  }
}

test('#_encryptMessage/#_encryptMessage', beforeEach((t) => {
  let message = new Buffer('The Magic Words are Squeamish Ossifrage')
  let encypted = t.context.a._encryptMessage(message)
  let decrypted = t.context.b._decryptMessage(encypted)
  t.same(message, decrypted)
  t.end()
}))

test('auth -> ack -> header -> body', beforeEach((t) => {
  t.doesNotThrow(() => {
    t.context.b.parseAuth(t.context.a.createAuth())
    t.context.a.parseAck(t.context.b.createAck())
  })
  let body = crypto.randomBytes(600)
  t.same(t.context.b.parseHeader(t.context.a.createHeader(body.length)), body.length)
  t.same(t.context.b.parseBody(t.context.a.createBody(body)), body)
  t.end()
}))
