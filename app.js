var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	socket = require('socket.io').listen(server),
	crypto = require('crypto'),
	redis = require('redis'),
	redis_cli = redis.createClient(),
	_ = require('underscore');

var Simon = {
	users : {},
};

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

process.on('uncaughtException', function(err) {
	console.log(err);

	var errStr =  (new Date).toUTCString();
		errStr += err.stack;
		errStr += "\n";

 	require("fs").appendFileSync("app.log", errStr);
});

server.listen(8080);
console.log("listening :8080");

app.use(express.favicon());
app.use('/', express.static(__dirname + '/public'));

socket.set('log level', 2);

socket.sockets.on('connection', function (socket) {
	
	socket.on('user.new', function (data){
		var user = new User({ name : data.name, email: data.email, socket: socket });
		Simon.users[user.id] = user;
		Simon.updateConversationList();
	});
});

socket.sockets.on("error", function(err){
	console.error(err);
});

Simon.updateConversationList = function(){
	Simon.getAllRecent( [1,2,3], 0, function(rooms){

		_.each(Simon.users, function(user){
			if(rooms[user.room].users){
				rooms[user.room].users.push({
					id: user.id,
					name : user.name
				})
			} else {
				rooms[user.room].users = [{
					id: user.id,
					name : user.name
				}]
			}
		});

		socket.sockets.emit("updateConversationList", rooms);
	});	
};

Simon.getAllRecent = function(rooms, items, cb, ctx){
	var _items = {},
		fetch = rooms.length;

	rooms.forEach(function(room){
		Simon.getRecent(room, items, function(item){
			_items[room] = {messages: item };
			resolve();
		});
	});

	function resolve(){
		if(--fetch === 0){
			cb.call(ctx||this, _items)
		}
	};
};

Simon.getRecent = function(room, items, cb, ctx){
	var _items = [],
		fetch = 0;

	redis_cli.lrange("chat:room:" + room, 0, items , function(err, items){
		fetch = items.length;
		
		items.reverse().forEach(function(id){
			
			redis_cli.hmget("chat:message:" + id ,'message', 'user', 'time', 'name','room', function(err, vals){
				_items.push({
					message : vals[0],
					user : vals[1],
					time : vals[2],
					name : vals[3],
					room : vals[4],
					id : id
				});

				resolve();
			});
		});
	});

	function resolve(){
		if(--fetch === 0){
			cb.call(ctx || this, _items);
		} 
	};

};

Simon.getMessage = function(id, cb){
	redis_cli.hmget("chat:message:" + id ,'message', 'user', 'time', 'name','room', function(err, vals){
		cb({
			message : vals[0],
			user : vals[1],
			time : vals[2],
			name : vals[3],
			room : vals[4]
		});
	});
};

function User(options){
	//we hash the email to get gravatar url & that hash is the user id
	var hash = crypto.createHash('md5');
		hash.update(options.email);

	this.id = hash.digest('hex');
	this.name =  _.escape(options.name);
	this.socket = options.socket;
	this.room = null;
	this.bind();
	this.join(1);
	this.sendRecent();
	this.sendMentions();
};

User.prototype.sendMentions = function(){
	var _mentions = {},
		fetch = 0,
		self = this;

	redis_cli.lrange('chat:mention:'+ this.name, 0,  -1, function(err, mentions){
		fetch = mentions.length;

		mentions.forEach(function(id){
			Simon.getMessage(id, function(message){
				_mentions[id] = message;
				resolve();
			});

		})
	});

	function resolve(){
		if(--fetch === 0){
			self.socket.emit("mention", _mentions)
		} 
	};
};

User.prototype.sendRecent = function(){
	var self = this;

	Simon.getRecent(this.room, 50, function(items){
		items.forEach(function(item){
			self.socket.emit('message', item);
		});
	});
};

User.prototype.bind = function(){
	this.socket.on('message', _.bind(this.onMessage, this));
	this.socket.on('typing', _.bind(this.onTyping, this));
	this.socket.on('switchRoom', _.bind(this.onRoomSwitch, this));
	this.socket.on('disconnect', _.bind(this.disconnect, this));
	this.socket.on('mentionRemove', _.bind(this.mentionRemove, this));
}
User.prototype.onRoomSwitch = function(room){
	console.log("%s switching in %s", this.name, room);
	this.join(room);
	this.sendRecent();
	Simon.updateConversationList();
};

User.prototype.disconnect = function(){
	delete Simon.users[this.id];
	Simon.updateConversationList();
};
User.prototype.mentionRemove = function(id){
	redis_cli.lrem('chat:mention:' + this.name, -1, id);
};
User.prototype.join = function(room){
	if(this.room){
		this.socket.leave(this.room);
	}

	this.room = room;
	this.socket.join(this.room);
};

User.prototype.onMessage = function(message){
	var messageStr =  message,
		mentions = messageStr.match(/\B@([\w-]+)/gm);

	var id = ++Simon.message_index,
	m = {
		message : messageStr,
		name : this.name,
		user : this.id,
		time : new Date().getTime(),
		room : this.room,
		id : id
	};

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

	if(mentions && mentions.length > 0){
		mentions.forEach(function(mention){
			var mention = mention.replace('@', ''),
				_mention = {};

			//refactor the whole mention system
			_mention[id] = m;


			if(mention === 'all'){
				//uaaaah
				var users = _.difference(['Sebastian', 'domburrr', 'Fabian', 'Andi', 'Benjamin'], Simon.users, [this.name]);

				users.forEach(function(user){
					redis_cli.lpush('chat:mention:'+ user, id);
				});

				socket.sockets.emit('mention', _mention);
			} else {
				var user = _.where(Simon.users, { name : mention });
				
				if(user.length > 0){
					//the user is online and we emit the event
					user[0].socket.emit('mention', _mention);
				} else {
					//we store it in db
					redis_cli.lpush('chat:mention:'+ mention, id);
				}
			}
		})
	}

	

	//broadcast message to all others
	socket.sockets.emit('message', m);
};

User.prototype.onTyping = function(){
	socket.sockets.in(this.room).emit('typing', {
		name : this.name,
		user : this.id
	});
};