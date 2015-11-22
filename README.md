# node-devp2p 
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard) [![Build Status](https://travis-ci.org/ethereum/node-devp2p.svg?branch=master)](https://travis-ci.org/ethereum/node-devp2p) [![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/ethereum/ethereumjs-lib?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge) or #ethereumjs on freenode

Implements the [RPLx](https://github.com/ethereum/devp2p/blob/master/rlpx.md) transport.


# INSTALL
`npm install devp2p`

#API 
- [`Network`](#network)
    - [`new Network([host], [post], [options])`](#new-networkhost-port-options)
    - [`Network` options](#network-options)
    - [`Network` methods](#network-methods)
        - [`network.listen([port], [host])`](#networklistenport-host)
        - [`network.connect(port, host, [callback])`](#networkconnectport-host-callback)
        - [`network.stop([callback])`](#networkstopcallback)
    - [`Network` events](#network-events)
- [`Peer`](#peer)
    - [`Peer` methods](#peer-methods)
        - [`peer.sendHello([callback])`](#peersendhellocallback)
        - [`peer.sendDisconnect(reason, [callback])`](#peersenddisconnectreason-callback)
        - [`peer.sendPing([callback])`](#peersendpingcallback)
        - [`peer.sendPong([callback])`](#peersendpongcallback)
    - [`Peer` events](#peer-events)

## `Network`
### `new Network([options])`
Creates new Network object with the following arguments
- `options` - An object with the Network configuration. See [`Network` options](#network-options)

### `Network` options
When creating a Network the following options can be used to configure its behavoir.
- `timeout` - The lenght of time in milliseconds to wait for a peer to response after connecting to it
- `maxPeers` - The max number of peer the network will try to connect to
- `clientId` - specifies the client software identity, as a human-readable string 
- `publicIp` - The public ip of this node
- `secretKey` - a 32 byte `Buffer` use to encrypte packets and identify the node.
- `subprotocols` - a hash containing the subprotocol name and its corisponding version number 

### `Network` methods
#### `network.listen([port], [host])`
start the tcp server
- `host` - The hostname or IP address the server is bound to. Defaults to `0.0.0.0` which means any available network
- `port` - The TPC port the server is listening to. Defaults to port `30303` 

#### `network.connect(peer, [callback])`
connect to a peer
- `peer` - a POJO containing
    - `host` - the hostname or IP of the peer
    - `port` - the port of the peer
    - `id` - the id/public key of the peer
- `callback` - a callback function

#### `network.close([callback])`
stops the tcp server and disconnects any peers


### `Network` events
The Network object inherits from `Events.EventEmitter` and emits the following events.
- `connection` - fires whever we connect with a peetr
    - `peer` - The [peer](#peer) that emitted the event

## `Peer`
The peer represents a peer on the ethereum network. Peer objects cannot be created directly.
- file - [lib/network/peer.js](../tree/master/lib/network/peer.js)

### `Peer` methods
#### `peer.sendHello([callback])`
Sends the hello message
#### `peer.sendDisconnect(reason, [callback])`
Sends the disconnect message, where reason is one of the following integers
- `0x00` - Disconnect requested
- `0x01` - TCP sub-system error
- `0x02` - Bad protocol
- `0x03` - Useless peer
- `0x04` - Too many peers
- `0x05` - Already connected
- `0x06` - Wrong genesis block
- `0x07` - Incompatible network protocols
- `0x08` - Client quitting

#### `peer.sendPing([callback])`
Send Ping
#### `peer.sendPong([callback])`
Send Pong

##`Peer` events
peer events are the same as [`Network` events](#network-events)

# LICENSE
MLP-2.0
