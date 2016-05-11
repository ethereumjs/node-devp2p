const DPT = require('../lib').DPT
const chalk = require('chalk')

const PRIVATE_KEY = 'd772e3d6a001a38064dd23964dd2836239fa0e6cec8b28972a87460a17210fe9'
const BOOTNODES = [
  { address: '52.16.188.185', port: 30303 },
  { address: '54.94.239.50', port: 30303 },
  { address: '52.74.57.123', port: 30303 }
]

const dpt = new DPT(new Buffer(PRIVATE_KEY, 'hex'), {
  endpoint: {
    address: '0.0.0.0',
    udpPort: 30303,
    tcpPort: null
  }
})

dpt.on('error', (err) => console.error(chalk.red(err)))

dpt.on('peer:add', (peer) => {
  let endpoint = peer.endpoint
  let info = `(${peer.id.toString('hex')},${endpoint.address},${endpoint.udpPort},${endpoint.tcpPort})`
  console.log(chalk.green(`New peer: ${peer.address}:${peer.port} ${info} (total: ${dpt.getPeers().length})`))
})

dpt.on('peer:remove', (peer) => {
  console.log(chalk.yellow(`Remove peer: ${peer.id.toString('hex')} (total: ${dpt.getPeers().length})`))
})

dpt.once('listening', () => {
  let callback = (err) => {
    if (err) console.error(chalk.bold.red(err))
  }

  for (let bootnode of BOOTNODES) dpt.bootstrap(bootnode, callback)
})

dpt.bind(30303, '0.0.0.0')
