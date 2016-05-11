const tape = require('tape')
const DPT = require('../../lib')
const crypto = require('crypto')
const async = require('async')

const localhost = '127.0.0.1'
const port = 30306
const numOfNode = 15

var nodes = []

function setup (cb) {
  console.log('setup..')

  for (let i = 0; i < numOfNode; i++) {
    let dpt = new DPT({
      privateKey: crypto.randomBytes(32),
      endpoint: {
        address: localhost,
        udpPort: port + i,
        tcpPort: null
      },
      timeout: 100,
      refreshInterval: 250
    })
    dpt.bind(port + i)
    nodes.push(dpt)
  }

  cb()
}

function connect (cb) {
  console.log('connect..')
  nodes[0].addPeers([{ address: localhost, port: port + 1 }], (err, peers) => {
    printNodes()
    if (err === null) err = peers[0][0]
    setTimeout(() => cb(err), 100)
  })
}

function bootstrap (cb) {
  console.log('bootstrap..')
  async.eachSeries(nodes.slice(2), (node, done) => {
    node.bootstrap([{ address: localhost, port: port + 1 }], (err, errs) => {
      printNodes()
      if (err === null) err = errs[0][0]
      setTimeout(() => done(err), 100)
    })
  }, cb)
}

function refresh (cb) {
  console.log('refresh..')
  async.eachSeries(nodes, (node, done) => {
    node.refresh((err, errs) => {
      printNodes()
      if (err === null) {
        for (let _err of errs) {
          if (_err !== null) err = _err
        }
      }

      setTimeout(() => done(err), 100)
    })
  }, cb)
}

function printNodes () {
  console.log('------------')
  nodes.forEach((node, i) => console.log(`${i}:${node.getPeers().length}`))
}

function checkNodes (t) {
  nodes.forEach((node, i) => t.true(node.getPeers().length >= numOfNode - 1))
}

function shutDown (cb) {
  async.each(nodes, (node, done) => {
    node.close()
    done()
  }, cb)
}

tape('running simulator', (t) => {
  async.series([
    setup,
    connect,
    bootstrap,
    refresh
  ], () => {
    printNodes()
    checkNodes(t)
    shutDown(t.end)
  })
})
