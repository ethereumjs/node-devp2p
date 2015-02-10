var Network = require('../index.js'),
	Rate = require('../lib/rating.js'),
  RLP = require('rlp'),
  net = require('net'),
  assert = require('assert');

module.exports = function() {
	
	describe('[Rating]: Rating Behavior', function () {

		var peer = {};

    it('should modify peer to default', function (done) {
      Rate(peer)
      assert.equal(peer.rep, 3);
      done();
    });

    it('should downvote peer', function(done) {
    	Rate(peer).downvote();
    	assert.equal(peer.rep, 2);
    	done();
    });

    it('should upvote peer', function(done) {
    	Rate(peer).upvote();
    	assert.equal(peer.rep, 3);
    	done();
    });

  });
};