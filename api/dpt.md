# DPT

### RawPeer

  - `string` address
  - `number` port

### Peer

  - `Buffer` id
  - `string` address
  - `number` port
  - `Object` endpoint
    - `string` address
    - `number` udpPort
    - `number` tcpPort

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
    - `function` [createSocket] - function for creating socket, by default `dgram.createSocket('udp4')` will be called
    - `number` [timeout] - request timeout, 10s by default
    - `number` [refreshInterval] - refresh interval, 60s by default
    - `Object` [endpoint]
      - `string` address
      - `?number` udpPort
      - `?number` tcpPort - `null` for bootstrap node

### bind

  Similar to [node dgram bind](https://nodejs.org/api/dgram.html#dgram_socket_bind_port_address_callback)

### close

  Similar to [node dgram close](https://nodejs.org/api/dgram.html#dgram_socket_close_callback)

### bootstrap

  - `RawPeer` peer
  - `function` callback

### addPeer

  - `RawPeer` peer
  - `function` callback

### getPeer

  - `(Buffer|{ address: string, port: number })` obj

returns: `Peer`

### getPeers

returns: `Peer[]`

### getClosestPeers

  - `Buffer` id

returns: `Peer[]`

### removePeer

  - `(Buffer|{ address: string, port: number })` obj

### banPeer

Remove peers and disallow adding them again

  - `(Buffer|{ address: string, port: number })` obj

### refresh
