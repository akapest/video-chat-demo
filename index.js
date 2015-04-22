'use strict';

var express = require('express'),
	app = express(),
	http = require('http').Server(app),
	io = require('socket.io')(http);


io.on('connection', function(socket){
	console.log('a user connected');

	socket.on('message', function(msg){
		io.emit('message', msg);
		if (msg.type !== 'candidate'){
			console.log(msg)
			console.log('')
		}

	});

	socket.on('disconnect', function(){
		console.log('user disconnected');
	});
});

app.use(express.static(__dirname));

app.get('/', function(req, res){
	res.sendFile('index.html');
});

http.listen(process.env.PORT || 3000, function () {
});
