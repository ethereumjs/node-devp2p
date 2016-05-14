# RLPx

### Protocol

See [ETH](eth.md)

### RawPeer

  - `Buffer` id
  - `string` address
  - `number` port

### Peer

##### getId

returns: `Buffer`

##### getHelloMessage

returns: `?{ protocolVersion: number, clientId: string, capabilities: { name: string, version: number }[], port: number, id: Buffer }`

##### getProtocols

returns: `[]Protocol`

##### disconnect

  - `Number` reason

<hr>

### Events

#### error

  - `Error` err

#### listening

#### close

#### peer:add

  - `Peer` peer

#### peer:remove

  - `Peer` peer

<hr>

### constructor

  - `Buffer` privateKey
  - `Object` [options]
    - `number` [timeout] - request timeout, 10s by default
    - `number` maxPeers
    - `string` clientId
    - `{ name: string, version: number, length: number, constructor: function }[]` capabilities
    - `number` listenPort
    - `DPT` [dpt]

### listen

  Similar to [node net listen](https://nodejs.org/api/net.html#net_server_listen_handle_backlog_callback)

### close

  Similar to [node net close](https://nodejs.org/api/net.html#net_server_close_callback)

### connect

  - `RawPeer` peer
  - `function` callback

### getPeers

returns: `[]Peer`

### disconnect

  - `Buffer` id
  - `function` callback
