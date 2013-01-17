var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	socket = require('socket.io').listen(server),
	crypto = require('crypto'),
	_ = require('underscore');


server.listen(8080);
console.log("listening :8080");


app.use(express.favicon());
app.use('/', express.static(__dirname + '/public'));

socket.set('log level', 2);

socket.sockets.on('connection', function (socket) {
	
	socket.on('user.new', function (data){
		new User({ name : data.name, email: data.email, socket: socket });
		//TODO add User to a collection of all online users
	});


});


function User(options){
	//we hash the email to get gravatar url
	var hash = crypto.createHash('md5');
		hash.update(options.email);

	this.pic = hash.digest('hex');

	this.name = options.name;
	this.socket = options.socket;
	this.room = null;
	this.bind();
	this.join(1);
	this.sendRecent();
};

User.prototype.sendRecent = function(){
	//Todo sent the recent 20 stored messages for this.room
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
	//TODO check if messages contains a mentioned user via @user

	//broadcast message to all other in this.room
	socket.sockets.in(this.room).emit('message', {
		message : message,
		user_name : this.name,
		user_pic : this.pic,
		time : new Date().getTime()
	});
};

User.prototype.onTyping = function(){
	socket.sockets.in(this.room).emit('typing', {
		user_name : this.name,
		user_pic : this.pic
	});
};