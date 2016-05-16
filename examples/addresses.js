'use strict'
const devp2p = require('../lib')
const LRUCache = require('lru-cache')
const EthTx = require('ethereumjs-tx')
const EthBlock = require('ethereumjs-block')
const rlp = require('rlp')
const ms = require('ms')
const chalk = require('chalk')

const PRIVATE_KEY = 'd772e3d6a001a38064dd23964dd2836239fa0e6cec8b28972a87460a17210fe9'
const BOOTNODES = [
  { address: '52.16.188.185', port: 30303 },
  { address: '54.94.239.50', port: 30303 },
  { address: '52.74.57.123', port: 30303 }
]

const lruHashes = new LRUCache({ max: 1000, stale: true })

function onTx (tx) {
  let hash = tx.hash().toString('hex')
  if (lruHashes.has(hash)) return
  lruHashes.set(hash, true)
  console.log(chalk.blue(`touched address: ${tx.to.toString('hex')}`))
  console.log(chalk.blue(`touched address: ${tx.from.toString('hex')}`))
}

function onBlock (block) {
  let hash = block.hash().toString('hex')
  if (lruHashes.has(hash)) return
  lruHashes.set(hash, true)
  for (let tx of block.transactions) {
    if (tx.validate()) onTx(tx)
  }
}

// DPT
const dpt = new devp2p.DPT(new Buffer(PRIVATE_KEY, 'hex'), {
  endpoint: {
    address: '0.0.0.0',
    udpPort: 30303,
    tcpPort: 30303
  }
})

dpt.on('error', (err) => console.error(chalk.red(`DPT error: ${err}`)))
dpt.once('listening', () => {
  let callback = (err) => {
    if (err) console.error(chalk.bold.red(`DPT bootstrap error: ${err}`))
  }

  for (let bootnode of BOOTNODES) dpt.bootstrap(bootnode, callback)
  setInterval(() => {
    console.log(chalk.yellow(`Total nodes in DPT: ${dpt.getPeers().length}`))
  }, ms('30s'))
})

// RLPx
const rlpx = new devp2p.RLPx(new Buffer(PRIVATE_KEY, 'hex'), {
  dpt: dpt,
  maxPeers: 3,
  capabilities: [
    devp2p.ETH.eth61 // { name: 'eth', version: 61, length: 9, constructor: devp2p.ETH }
  ],
  listenPort: 30303
})

rlpx.on('error', (err) => console.log(`RLPx error: ${err.stack}`))

rlpx.on('peer:add', (peer) => {
  let addr = `${peer._socket.remoteAddress}:${peer._socket.remotePort}`
  console.log(chalk.green(`Add peer: ${addr} (total: ${Object.keys(rlpx._peers).length})`))

  peer.on('error', (peer, err) => console.log(`Peer error (${addr}): ${err.stack}`))
  peer.on('data', (data) => {})

  let eth = peer.getProtocols()[0]
  eth.sendStatus({
    networkId: 1,
    td: devp2p._util.int2buffer(17179869184), // total difficulty in genesis block
    bestHash: new Buffer('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex'),
    genesisHash: new Buffer('d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3', 'hex')
  })

  eth.on('error', (err) => console.log(chalk.red(`ETH error: ${err}`)))
  eth.on('message', (code, payload) => {
    switch (code) {
      case devp2p.ETH.MESSAGE_CODES.TX:
        let tx = new EthTx(payload[0])
        if (!tx.validate()) break
        console.log(`new tx (${addr}): ${tx.hash().toString('hex')}`)
        onTx(tx)
        break

      case devp2p.ETH.MESSAGE_CODES.NEW_BLOCK_HASHES:
        let blockHash = payload[0].toString('hex')
        console.log(`new block (${addr}): ${blockHash}`)
        if (lruHashes.has(blockHash)) break
        eth.sendMessage(devp2p.ETH.MESSAGE_CODES.GET_BLOCKS, [ new Buffer(blockHash, 'hex') ])
        break

      case devp2p.ETH.MESSAGE_CODES.BLOCKS:
        for (let rawBlock of payload) onBlock(new EthBlock(rawBlock))
        break

      case devp2p.ETH.MESSAGE_CODES.NEW_BLOCK:
        onBlock(new EthBlock(payload[0]))
        break

      default:
        console.log(`new message (${addr}) ${code} ${rlp.encode(payload).toString('hex')}`)
        break
    }
  })

  peer.once('close', () => {
    peer.removeAllListeners()
    eth.removeAllListeners()
  })
})

rlpx.on('peer:remove', (peer, reason) => {
  let addr = `${peer._socket.remoteAddress}:${peer._socket.remotePort}`
  console.log(chalk.yellow(`Remove peer: ${addr} (reason code: ${reason || 'undefined'})`))
})

// start
rlpx.listen(30303, '0.0.0.0')
dpt.bind(30303, '0.0.0.0')
