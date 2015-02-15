var Network = require('../index.js'),
  RLP = require('rlp'),
  net = require('net'),
  assert = require('assert'),
  async = require('async'),
  cluster = require('cluster');

const NODES = 2;
const internals = {
  //test port and host
  port: 2000,
  host: 'localhost'
};

// Set Test in Master
if (cluster.isMaster) {

  describe('[Swarm]: Listening functions', function() {
    before('startSwarm', startSwarm);

    it('should listen', function(done) {
      command('youListen', done)
    });

    it('should stop listening', function(done) {
      command('youStop', done)
    });

    after('stopSwarm', killWorkers);
  });

  function startSwarm(done){
    var ONLINE = 0;
    for (var i = 0; i < NODES; i++) {
      cluster.fork({id: i});
    }

    cluster.on('online', function(worker) {
      ONLINE++;
      if (ONLINE == NODES){
        setTimeout(done, 2000)
      }
    });

  }

  function killWorkers() {
    for (var id in cluster.workers) {
      cluster.workers[id].kill()
    }
  };

  function command(msg, done) {
    var workers = Object.keys(cluster.workers);

    function sendMsg(id, done) {
      worker = cluster.workers[id];
      // Send Worker Command
      worker.send(msg)
      // Listen to Message
      worker.on('message', function(msg) {
        if (msg.error) {
          done(msg.error)
        } else {
          done()
        }
      });
    };

    async.each(workers, sendMsg, done)
  }

} else {

  var network = new Network(),
    port = process.env.id + internals.port;

  process.on('message', function(msg) {
    if (msg == 'youListen'){
      meListen(report)
    }
    if (msg == 'youStop'){
      meStop(report)
    }
  })

  function report(err) {
    console.log('Errr???', err)
    if (err){
      process.send({err: err})
    } else {
      process.send({yep: 'I passed'})
    }
  }

  function meListen(done){
    network.listen(port, internals.host, done)
  }

  function meStop(done) {
    network.stop(done);
  }
}