/*
 * This implements the logic for the Peers
 */
exports.logic = function (peer) {

  peer.on('hello', function (hello) {
    var ourCaps = this.network.capabilities;

    //disconnect if using differnt protocols versions
    for (var cap in hello.capabilities) {
      if (ourCaps[cap] && ourCaps[cap] !== hello.capabilities[cap]) {
        peer.disconnect(0x07);
      }
    }

    this.capabilities = hello.capabilities;
    this.id = hello.id;
    this.publicIp = hello.ip;
    this.port = hello.port;
  });

  peer.on('ping', function () {
    peer.pong();
  });

  peer.on('disconnect', function () {
    peer.socket.end();
  });
};
