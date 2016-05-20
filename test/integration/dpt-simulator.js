'use strict'
const tape = require('tape')
const async = require('async')
const devp2p = require('../../lib')

const localhost = '127.0.0.1'
const port = 30306
const numOfNode = 15

var nodes = []

function setup (cb) {
  console.log('setup..')

  for (let i = 0; i < numOfNode; i++) {
    let dpt = new devp2p.DPT(devp2p._util.genPrivateKey(), {
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
  nodes[0].addPeer({ address: localhost, port: port + 1 }, (err) => {
    printNodes()
    setTimeout(() => cb(err), 100)
  })
}

function bootstrap (cb) {
  console.log('bootstrap..')
  async.eachSeries(nodes.slice(2), (node, done) => {
    node.bootstrap({ address: localhost, port: port + 1 }, (err) => {
      printNodes()
      setTimeout(() => done(err), 100)
    })
  }, cb)
}

function refresh (cb) {
  console.log('refresh..')
  async.eachSeries(nodes, (node, done) => {
    node.refresh()
    setTimeout(() => {
      printNodes()
      done(null)
    }, 200)
  }, cb)
}

function printNodes () {
  console.log('------------')
  nodes.forEach((node, i) => console.log(`${i}:${node.getPeers().length}`))
}

function checkNodes (t) {
  nodes.forEach((node, i) => t.equal(node.getPeers().length, numOfNode))
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
