Manager = function(db, dht){
  dht.on('peer', this.savePeer);
  this.subProtocols = {};
};

Manager.prototype.connect = function(proto){
  //if we don't have enough peers, on `peer` should checkout `lookingSub`
  this._lookingSub.push(subP)
}

Manager.prototype.getPeers  = function(num, proto){

  //lookuo peers
  //sort by rating possible
  peers.forEach(function(peer){
    //connect and see if 
    this.connect(peer);
  })
  
};

Manager.prototype.addSubProtocol(proto){
  this.subProtocols.push(proto);
}


//how do you load peers? 
//allow the subprotocols to rate and store there own peers
//otherwise just get from the DHT
