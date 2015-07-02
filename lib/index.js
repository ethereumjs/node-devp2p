const net = require('net')
const crypto = require('crypto')
const util = require('util')
const enableDestroy = require('server-destroy')
const EventEmitter = require('events').EventEmitter
const _ = require('underscore')
const async = require('async')
const Peer = require('./peer')
const pjson = require('../package.json')
const DPT = require('devp2p-dpt')

/**
 * Creates new Network object
 * @class Implements Ethereum's Wire Protocol and provides networking functions.
 * @param {Object} options
 * @param {Number} [options.protocolVersion=1] The network version
 * @param {String} [options.publicIp] The public ip address of this instance
 * @param {Object} [options.capabilties] A hash containing the capbilities of this node and their corrisponding version numbers
 * @param {Number} [options.timeout=20000] The length of time in milliseconds to wait for a peer to response after connecting to it
 * @param {Number} [options.maxPeers=10] The max number of peer the network will try to connect to
 * @param {String} [options.clientId] Specifies the client software identity, as a human-readable string
 */
var Network = exports = module.exports = function(options) {

  var self = this

  //Register as event emitter
  EventEmitter.call(this)

  //setup defaults
  var optionDefaults = {
    timeout: 20000, //10 seconds
    maxPeers: 10,
    clientId: 'Ethereum Node.js/' + pjson.version
  }

  options = options ? options : {}
  _.defaults(options, optionDefaults)
  _.defaults(this, options)

  if (!this.secretKey)
     this.secretKey = crypto.randomBytes(32)

  this._peers = {} //list of peer connected to
  this._stopping = false
  this.port = 0
  this.protocolVersion = 4

  Object.defineProperties(this, {
    peers: {
      get: function() {
        return _.values(this._peers)
      }
    }
  })
 
  this.dpt = new DPT({
    secretKey: this.secretKey,
    timeout: 6000,
    address: this.publicIp
  })

  this.dpt.on('error', function(a, e){
    console.log(a)
  })

  this.dpt.on('newPeer', function(peer){
    self.connect(peer)
  })

  this.server = net.createServer(this._onConnect.bind(this))
}

util.inherits(Network, EventEmitter)

/**
 * start the server
 * @method listen
 * @param {Number} [port=30303] The hostname or IP address the server is bound to. Defaults to 0.0.0.0 which means any available network
 * @param {String} [host='0.0.0.0'] The TPC port the server is listening to. Defaults to port 30303
 */
Network.prototype.listen = function(port, host, cb) {
  var self = this
  this.host = host ? host : '0.0.0.0'
  this.port = port ? port : 30303
  this._listening = true

  if (!_.isFunction(cb))
    cb = function(){}

  this.dpt.bind(this.port, this.host)
  this.server.listen(this.port, this.host, cb)
  enableDestroy(this.server)
}

/**
 * connects to a peer
 * @method connect
 * @param {Number} port the port of the peer
 * @param {String} host the hostname or IP of the peer
 * @param {Function} cb the callback
 * TODO: fix `cb`
 */
Network.prototype.connect = function(peer, cb) {

  if (!cb) cb = function() {}

  var self = this
  var openSlots = this.maxPeers - this.peers.length

  //connects to the peer once we have an ID
  function onId(err, peer) {
    if (!err) {
      var socket = new net.Socket()

      function onError(e) {
        socket.destroy()
        cb(e)
      }

      socket.setTimeout(self.timeout)
      socket.on('timeout', onError)
      socket.on('error', onError)
      socket.on('connect', function() {
        self._onConnect(socket, peer.id, true)
        socket.removeListener('error', onError)
        cb()
      })
      socket.connect(peer.port, peer.address)
    } else {
      cb(err)
    }
  }

  if (openSlots > 0) {
    if (!peer.id) {
      //ping the peer to get its public key, aka ID
      this.dpt.ping({
        address: peer.address,
        port: peer.port
      }, cb)
    } else {
      onId(null, peer)
    }
  } else {
    cb()
  }
}

//creates a new peer object and adds it to the peer hash
Network.prototype._onConnect = function(socket, id, outgoing) {
  var self = this
  var openSlots = this.maxPeers - this.peers.length

  if (openSlots > 0) {
    if (!this.publicIp) {
      this.publicIp = socket.localAddress
    }

    var peer = new Peer(socket, self, id)

    if(!id){
      peer.on('connection', function(){
        self._peers[peer.id.toString('hex')] = peer
      })
    }else{
      self._peers[id.toString('hex')] = peer
    }

    //disconnect delete peers
    socket.on('close', function() {
      self.emit('closing', peer)
      //delete refrances to the peer
      self._popPeerList()
      delete self._peers[peer.id.toString('hex')]
    })

    if(outgoing){
      peer.state = 'Ack'
      peer.sendAuth()
    }
  } else {
    socket.destroy()
  }
}

/**
 * stops the tcp server and disconnects any peers
 * @method stop
 * @param {Function} cb the callback
 */
Network.prototype.close = function(cb) {
  var self = this
  this._stopping = true
  this.dpt.close()

  //disconnect all the peers
  async.each(this.peers, function(peer, cb2) {
    //TODO add timeouts
    peer.socket.once('close', cb2)
    //0x08 Client quitting.
    peer.sendDisconnect(0x08, function() {
      peer.socket.end()
    })
  }, function() {
    //disconnect peers
    if (self._listening) {
      self.server.destroy(cb)
      // self.server.close(cb)
    } else if (cb) {
      cb()
    }
  })
}

/**
 * Pops peers off the peer list and connects to them untill we reach maxPeers
 * or we run out of peer in the peer list
 * @private
 */
Network.prototype._popPeerList = function() {

  var openSlots = this.maxPeers - this.peers.length
  var self = this

  if (openSlots > 0 && !this._stopping) {
    //find peer that we are not already connected to
    var peers = self.dpt.kBucket.toArray().filter(function(p){
      return !self._peers[p.id.toString('hex')]
    })

    var i = openSlots
    var q = async.queue(function (peer, cb) {
      self.connect(peer, function(err){
          if(err){
            i++
            if(peers[i]){
              q.push(peers[i])
            }
          }
          cb()
      })
    }, openSlots)

    q.push(peers.slice(0, openSlots))
  }
}
