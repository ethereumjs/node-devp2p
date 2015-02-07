// Specify Constants for Maximum and Minimum Peer Reputation
const MAX_REP = 3;
const MIN_REP = 1;

/**
 * Evalutes Given Peer
 * Includes Chaining - "evalPeer(peer).upvote().downvote()"
 * @param  {Object} peer Peer Object
 */

var evalPeer = module.exports = function(peer) {

	// Check and Set Default
	if(!peer){
		throw new Error('Peer Unspecified');
	} else {
		peer.rep = peer.rep ? peer.rep : MAX_REP;
	}

	// Upvote Peer
	function upvotePeer() {
		checkPeer(peer);
		if(peer.rep < MAX_REP){
			peer.rep += 1;
			return this;
		}
	}

	// Downvote Peer
	function downvotePeer(cb){
		checkPeer(peer);
		if(peer.rep > MIN_REP){
			peer.rep -= 1;
			return this;
		} else {
			cb(peer);
		}
	}

	return {
		upvote: upvotePeer
		downvote: downvotePeer
	}

};