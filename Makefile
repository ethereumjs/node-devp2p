testall:
	mocha ./test/network.js && mocha ./test/rating.js && mocha -t 5000 ./test/swarm.js
