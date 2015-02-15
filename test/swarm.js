var Network = require('../index.js'),
  RLP = require('rlp'),
  net = require('net'),
  assert = require('assert'),
  cluster = require('cluster');

const NODES = 2;
var ONLINE = 0;

const internals = {
  //test port and host
  port: 4447,
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

    for (var i = 0; i < NODES; i++) {
      cluster.fork({id: i});
    }

    cluster.on('online', function(worker) {
      ONLINE++;
      if (ONLINE == NODES){
        console.log('SWARM READY')
        done()
      }
    });

  }

  function killWorkers() {
    for (var id in cluster.workers) {
      cluster.workers[id].kill()
    }
  };

  function command(msg, done) {
    var worker;
    var WORKING = 0;

    console.error('Start Command: '+ msg)
    Object.keys(cluster.workers).forEach(function(id) {
      worker = cluster.workers[id];

      console.error('Fetch Worker: '+ id)
      // Send Worker Command
      console.log(worker.isConnected())
      worker.send(msg)
      console.error('Sent '+msg +' Worker: '+ id)

      // Wait For Worker Message
      worker.on('message', function(msg) {
        if (msg.error){
          console.error('ERROR IN WORKER')
          done(msg.error)
        } else if(++WORKING == NODES){
          console.error('SUCESS IN WORKER')
          done()
        } else {
          console.error('WAITING FOR NEXT WORKER')
          WORKING++
        }

      });
      
    });
  }

} else {

  var network = new Network(),
    port = process.env.id + internals.port;

  process.on('message', function(msg) {
    console.log(msg);
    if (msg == 'youListen'){
      meListen(report)
    } else if (msg == 'youStop'){
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
    // network.listen(port, internals.host, done)
    done();
  }

  function meStop(done) {
    // network.stop(done);
    done();
  }
}