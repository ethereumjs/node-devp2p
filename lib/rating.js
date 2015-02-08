// Specify Constants for Maximum and Minimum Peer Reputation
const MAX_REP = 3;
const MIN_REP = 1;

/**
 * Rates Given Peer
 * Includes Chaining - "RatePeer(peer).upvote().downvote()"
 * @param  {Object} peer Peer Object
 */

var RatePeer = module.exports = function(peer) {

	// Check and Set Default
	if(!peer){
		throw new Error('Peer Unspecified');
	} else {
		peer.rep = peer.rep ? peer.rep : MAX_REP;
	}

	// Upvote Peer
	function upvotePeer() {
		if(peer.rep < MAX_REP){
			peer.rep += 1;
		}
		return this;
	}

	// Downvote Peer
	// Return Callback on REP < MIN_REP
	function downvotePeer(cb){
		if(peer.rep > MIN_REP){
			peer.rep -= 1;
		} else {
			cb(peer, id);
		}
		return this;
	}

	return {
		upvote: upvotePeer,
		downvote: downvotePeer
	}

};