const tape = require('tape');
const DHT = require('../index2.js');

var dht;

const port = 30306;
const privateKey = new Buffer('18f9226f2b10bafffbe7fe2a864b220eade9f6b76b44b71925653089c581485e', 'hex');

tape('sanity checks', function(t){
  t.doesNotThrow(function(){
    dht = new DHT({
      port: port,
      secretKey: privateKey
    },null, 'should consturct');
  });

  t.doesNotThrow(function(){
    dht.bind();
  }, null, 'should listen');


  t.doesNotThrow(function(){
    dht.close();
  }, null, 'should close');

  t.end();
});
