# Network

[lib/index.js:25-74](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L25-L74 "Source code on GitHub")

Creates a new Networking Object. This Implements Ethereum's Wire Protocol and provides networking functions.

**Parameters**

-   `options` **Object** 
    -   `options.protocolVersion` **[Integer]** The network version (optional, default `1`)
    -   `options.publicIp` **String** The public ip address of this instance
    -   `options.capabilties` **Object** A hash containing the capbilities of this node and their corrisponding version numbers
    -   `options.timeout` **[Integer]** The length of time in milliseconds to wait for a peer to response after connecting to it (optional, default `20000`)
    -   `options.maxPeers` **[Integer]** The max number of peer the network will try to connect to (optional, default `10`)
    -   `options.clientId` **String** Specifies the client software identity, as a human-readable string

## close

[lib/index.js:203-225](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L203-L225 "Source code on GitHub")

stops the tcp server and disconnects any peers

**Parameters**

-   `cb` **Function** the callback

## connect

[lib/index.js:106-151](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L106-L151 "Source code on GitHub")

connects to a peer

**Parameters**

-   `port` **Number** the port of the peer
-   `host` **String** the hostname or IP of the peer
-   `peer`  
-   `cb` **Function** the callback
    TODO: fix `cb`

## listen

[lib/index.js:84-96](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L84-L96 "Source code on GitHub")

starts the tcp server

**Parameters**

-   `port` **[Number]** The hostname or IP address the server is bound to. Defaults to 0.0.0.0 which means any available network (optional, default `30303`)
-   `host` **[String]** The TPC port the server is listening to. Defaults to port 30303 (optional, default `'0.0.0.0'`)
-   `cb`  
# Network Events
## closing

[lib/index.js:183-183](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L183-L183 "Source code on GitHub")

Emitted when a peer disconnects. Gives the peer to the handler.

## connection

[lib/index.js:173-173](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/index.js#L173-L173 "Source code on GitHub")

Emitted whenever a peer connects. Gives the peer to the handler.

# Peer

[lib/peer.js:26-91](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L26-L91 "Source code on GitHub")

The peer represents a peer on the ethereum network. Peer objects cannot be created directly. The `Network` creates them when a connection happens

**Parameters**

-   `socket` **Object** an Intialized Sockets. MUST alread be connected
-   `network` **Object** the network that initailized the connection
-   `id` **Buffer** 

## createStream

[lib/peer.js:342-344](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L342-L344 "Source code on GitHub")

Creates a Duplex stream. Uses node's steams

**Parameters**

-   `opts`  

## sendDisconnect

[lib/peer.js:311-325](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L311-L325 "Source code on GitHub")

Sends the disconnect message, where reason is one of the following integers

-   0x00 - Disconnect requested
-   0x01 - TCP sub-system error
-   0x02 - Bad protocol
-   0x03 - Useless peer
-   0x04 - Too many peers
-   0x05 - Already connected
-   0x06 - Wrong genesis block
-   0x07 - Incompatible network protocols
-   0x08 - Client quitting

**Parameters**

-   `reason` **Inteter** 

## toString

[lib/peer.js:241-243](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L241-L243 "Source code on GitHub")

# Peer Events
## connection

[lib/peer.js:208-208](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L208-L208 "Source code on GitHub")

Emitted whenever this peer connects. Gives the peer to the handler.

## data

[lib/peer.js:176-176](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L176-L176 "Source code on GitHub")

Emitted when the peer gets data from the network

## pong

[lib/peer.js:233-233](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L233-L233 "Source code on GitHub")

Emitted when this peer gets a `pong`

## closing

[lib/peer.js:218-218](https://github.com/ethereumjs/node-devp2p/blob/f6c67db4c164299e4bddb935edcf9505de40d582/lib/peer.js#L218-L218 "Source code on GitHub")

Emitted when this peer disconnects. Gives the peer to the handler.
