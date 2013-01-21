var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	socket = require('socket.io').listen(server),
	crypto = require('crypto'),
	redis = require('redis'),
	redis_cli = redis.createClient(),
	_ = require('underscore');

//redis client error
redis_cli.on("error", function (err) {
    console.log("Redis Error " + err);
});


//setnx sets the key to one if the key doesnt exists
redis_cli.get('chat:message:index', function(err, val){
	if(!val){
		Simon.message_index = 0;
		redis_cli.set('chat:message:index', 0);
	} else {
		Simon.message_index = val;
	}
});

process.

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
	//we hash the email to get gravatar url & that hash is the user id
	var hash = crypto.createHash('md5');
		hash.update(options.email);

	this.id = hash.digest('hex');
	this.name =  _.str.escapeHTML(options.name);
	this.socket = options.socket;
	this.room = null;
	this.bind();
	this.join(1);
	this.sendRecent();
};


User.prototype.sendRecent = function(){
	var self = this;

	//get the recent items in range 0 - 50
	redis_cli.lrange("chat:room:" + this.room, 0, 50 , function(err, items){
		items.reverse().forEach(function(id){

			//get the individual message
			redis_cli.hvals("chat:message:" + id , function(err, vals){

				//emit the message
				self.socket.emit('message', {
					message : _.str.escapeHTML(vals[0]),
					user : vals[1],
					time : vals[2],
					name : _.str.escapeHTML(vals[4])
				});
			});
		});
	});
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
	var m = {
		message :  _.str.escapeHTML(message),
		name : this.name,
		user : this.id,
		time : new Date().getTime()
	},
	id = ++Simon.message_index;

	console.log("#%s from %s to %s", id, this.name, this.room);
	
	redis_cli.incr('chat:message:index');

	//hash with all the message properties
	redis_cli.hset("chat:message:" + id , "message", m.message);
	redis_cli.hset("chat:message:" + id , "user", this.id);
	redis_cli.hset("chat:message:" + id , "time", m.time);
	redis_cli.hset("chat:message:" + id , "room", this.room);
	redis_cli.hset("chat:message:" + id , "name", this.name);


	//push the message to the room list
	redis_cli.lpush("chat:room:" + this.room, id);

	//TODO check if messages contains a mentioned user via @user

	//broadcast message to all other in this.room
	socket.sockets.in(this.room).emit('message', m);
};

User.prototype.onTyping = function(){
	socket.sockets.in(this.room).emit('typing', {
		name : this.name,
		user : this.id
	});
};