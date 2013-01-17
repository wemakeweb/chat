var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	socket = require('socket.io').listen(server),
	crypto = require('crypto'),
	_ = require('underscore');

var rooms = {
	'Lobby' : {},
	'Dev' : {}
},
	user = {

	};

function User(options){
	//we hash the email to get gravatar url
	var hash = crypto.createHash('md5');
		hash.update(options.email);

	this.name = options.name;
	this.pic = hash.digest('hex');
	this.socket = options.socket;
	this.room = null;
	this.bind();
	this.join(1);
};

User.prototype.bind = function(){
	this.socket.on('message', _.bind(this.onMessage, this));
	this.socket.on('typing', _.bind(this.onTyping, this));
}

User.prototype.join = function(room){
	if(this.room){
		this.socket.leave(this.room);
	}

	this.room = room;
	this.socket.join(this.room);
};

User.prototype.onMessage = function(message){
	//TODO Save message here

	socket.sockets.in(this.room).emit('message', {
		message : message,
		user_name : this.name,
		user_pic : this.pic
	});
};

User.prototype.onTyping = function(){
	socket.sockets.in(this.room).emit('typing', {
		user_name : this.name,
		user_pic : this.pic
	});
};


server.listen(8080);


app.use(function(req, res, next){
  console.log('%s %s', req.method, req.url);
  next();
});
app.use(express.favicon());
app.use('/', express.static(__dirname + '/public'));


socket.sockets.on('connection', function (socket) {
	socket.on('user.new', function (data){
		new User({ name : data.name, email: data.email, socket: socket });
	});
});


console.log("chat listening :8080");