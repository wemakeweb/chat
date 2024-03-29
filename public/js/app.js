(function(){

	function replaceURLWithHTMLLinks(text) {
	    var exp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
	    return text.replace(exp,"<a href='$1' target='_blank'>$1</a>"); 
	};

	Tinycon.setOptions({
	    width: 7,
	    height: 9,
	    font: '10px arial',
	    colour: '#ffffff',
	    background: '#549A2F',
	    fallback: true
	});


	var App = {
		Views : {},
		Models : {},
		Collections : {}
	};
	App.Views.Main = Backbone.View.extend({
		notifications : [],
		mentions : {},
		room : 1,

		desktopNotifications : false,

		initialize : function(){
			this.templates = {
				message : _.template($.trim($('#template-message').text()))
			};
			this.connect();
			this.layout();

			if(this.storedUser()){
				this.bind();
				this.socket.emit('user.new', this.user);	
			} else {
				this.showLogin();
			}

			if(window.webkitNotifications && window.webkitNotifications.checkPermission() === 1){
				$('#noti-trigger').fadeIn();
			}

			$(window).on("resize", $.proxy(this.layout, this));
			$(window).on("blur", $.proxy(this.inactive, this));
			$(window).on("focus", $.proxy(this.active, this));
			
		},

		el : $('#app'),

		events : {
			'click .btn-login-submit' : 'login',
			'keydown #message-input' : 'keydown',
			'keyup #message-input' : 'keyup',
			'click .user-list li' : 'mentionUser',
			'click #conversations > li' : 'roomSwitch',
			'click #mentions li a .close' : 'mentionRemove',
			'click #mentions li a' : 'mentionShow'
		},

		layout : function(){
			$('#messages, .sidebar').css("height", $(window).height() - 70);
		},

		showLogin : function(){
			$('#user-new').modal();
		},

		keydown : function(event){
			if(!this.shift && event.keyCode === 13){
				var $input = $(event.currentTarget);
				this.socket.emit('message', $.trim($input.val()));
				$input.val('');
				event.preventDefault();
			} else if(event.keyCode === 16){
				this.shift = true;
			} else {
				this.socket.emit('typing');
			}
		},

		keyup : function(event){
			if(event.keyCode === 16){
				this.shift = false;
			}
		},

		active : function(){
			if(this.notifications.length > 0){
				this.clearNotifications();
			}
			this.windowActive = true;
		},
		
		inactive : function(){
			this.windowActive = false;
		},

		clearNotifications : function(){
			this.$el.find(".message.new").removeClass("new");
			this.notifications = [];
			Tinycon.setBubble(0);
		},

		storedUser : function(){
			if(! "localStorage" in window){
				alert("Upgrade your Browser!");
				return false;
			};	

			if( localStorage.getItem("user.name")){
				this.user = {
					email : localStorage.getItem("user.email"),
					name : localStorage.getItem("user.name")
				};
				return true;
			}
		},

		login : function(){
			var $modal = $('#user-new').modal('hide'),
				data = $modal.find('form').serializeArray();

			this.user = {
				name : data[0].value,
				email : data[1].value
			};

			this.bind();
			this.socket.emit('user.new', this.user);	

			if(! "localStorage" in window){
				return alert("Upgrade your Browser!");
			};	

			localStorage.setItem("user.name", this.user.name);
			localStorage.setItem("user.email", this.user.email);
		},

		connect : function(){
			this.socket = io.connect(document.location.hostname + ':8080');
		},

		bind : function(){
			var self = this;

			this.socket.on('message', $.proxy(this.renderMessage, this));
			this.socket.on('typing', $.proxy(this.renderTyping, this))
			this.socket.on('updateConversationList', $.proxy(this.renderConversationList, this));
			this.socket.on('mention', $.proxy(this.renderMention, this));
			this.socket.once('disconnect', function(){
				$('#disconnect').fadeIn();
				self.socket.once('connect', function(){
					$('#disconnect').fadeOut();
					self.socket.emit('user.new', self.user);
				});
			});
		},

		mentionShow : function(event){
			var $li = $(event.currentTarget).parents('li'),
				room = $li.data('room'),
				id = $li.data('id'),
				rooms = ['Lobby', 'Design', 'Dev'];

			if(this.room === parseInt(room) ){
				var $message = $('.message_part.m' + id).addClass("mentioned");
				
				if($message.length > 0){
					$('#messages').scrollTo($message)
					return;
				}
			}

			var message = this.mentions[id];
			
			message = this.sanitizeMessage(message);

			var $mentionDialog = $('#mention-dialog');
			if(this.room !== parseInt(room)){
				$mentionDialog.find('.modal-body').html("<h6>You was mentioned in <em>" + rooms[message.room-1] + "</em></h6>");
			} else {
				$mentionDialog.find('.modal-body').html("<h6>You was mentioned in the past</h6>");
			}
			
			$mentionDialog.find('.modal-body').append($(this.templates.message({ message: message })))
			$mentionDialog.modal();	

			event.preventDefault();
		},

		mentionRemove : function(event){
			var $li = $(event.currentTarget).parents('li');

			this.socket.emit('mentionRemove', $li.data('id'));
			$li.remove();

			event.preventDefault();
			event.stopPropagation();
		},

		mentionUser : function(event){
			var user = $(event.currentTarget).data('user'),
				$input = $('#message-input');

			$input.insertAtCaret(' @' + user + ' ');
		},

		roomSwitch : function(event){
			var $t = $(event.currentTarget),
				room = $t.data("room");

			$('#conversations > li.active').removeClass('active');
			$t.addClass('active');

			$('#messages').html("");

			this.room = room;
			this.socket.emit('switchRoom', room);
		},

		sanitizeMessage : function(message){
			message.message = jQuery('<div/>').text(message.message).html();
			message.message = message.message.replace(/\r?\n|\r/g, "<br>");

			var imgMatch = message.message.match(/^((\w+):)?\/\/((\w|\.)+(:\d+)?)[^:]+\.(jpe?g|gif|png)$/);

			if(imgMatch){
				message.message = message.message.replace(imgMatch[0], '<img src="' + imgMatch[0] + '" class="auto-img"/><br /><a href="' + imgMatch[0] + '">' + imgMatch[0] + '</a>');

			} else {
				message.message = replaceURLWithHTMLLinks(message.message);
			}


			message.room = parseInt(message.room);
			message.time = this.formatTime(message.time);
			return message;
		},

		renderMention : function(mention){
			var self = this;

			$.each(mention, function(id, item){
				if(item.name === self.user.name) return;

				$('#mentions').append('<li data-room="' + item.room + '" data-id="'+id+'"><a href="#" > <b>' + item.name +'</b> mentioned you.<span class="time">' + self.formatTime(item.time) +"</span><button type='button' class='close' >&times;</button></a></li>");

				self.mentions[id] = item;
			})
		},

		renderConversationList : function(convs){
			var $ul = $('<ul />'),
				self = this;

			$.each(convs, function(name, conv){
				var $conv = $('#conversations > li[data-room="' + name +'"]'),
					message = conv.messages[0];
					
					if(conv.users){
						$.each(conv.users, function(i, user){
							$ul.append('<li data-user="'+user.name+'"><img src="http://gravatar.com/avatar/' + user.id +'" /><span></span></li>');
						});
					}
					
					$conv.find(' .text').html( message.name +': ' + message.message );
					$conv.find('.time').text(self.formatTime(message.time));
			});

			$('.user-list').html($ul);
		},

		renderMessage : function(message){
			var message_timestamp = message.time;
			
			message = this.sanitizeMessage(message);

			if(message.room === this.room){
				if(this.lastMessage && this.lastMessage.user === message.user){
					this.$lastMessage.find('.message-body').append('<div class="message_part m'+message.id +'">' + message.message + '</div>');
				} else {
					this.$lastMessage = $(this.templates.message({ message: message }));
					$('#messages').append(this.$lastMessage);
				}


				$('#messages').stop().animate({ scrollTop: $('#messages')[0].scrollHeight + 30 }, 200);
				
				if(!this.windowActive &&  (message.user !== this.lastMessage.user || message.user === this.lastMessage.user && message.time > this.lastActive && this.notifications.indexOf(message.user) < 0)){

					//experimental notifications
					if (window.webkitNotifications && window.webkitNotifications.checkPermission() == 0) { 
	    				var notification = window.webkitNotifications.createNotification(
	    					'http://gravatar.com/avatar/' + message.user + '.jpg', message.name, message.message);
					    notification.show();

					    notification.onclick = $.proxy(function(){
					    	this.clearNotifications();
					    	notification.close();
					    }, this);	
	  				}

					this.notifications.push(message.user);
					Tinycon.setBubble(this.notifications.length);
					this.$lastMessage.addClass("new");
				}

				this.lastMessage = message;
			} 

			var $conversation = $('#conversations > li[data-room="' + message.room +'"]');
			$conversation.find(' .text').html(message.name +': ' + message.message );
			$conversation.find('.time').text(message.time);
		},

		renderTyping : function(types){
			clearTimeout(this.typingTimer);

			if(types.name === this.user.name){
				return;
			}

			$('#typing-info').html(types.name + " is typing…");

			this.typingTimer = setTimeout(function(){
				$('#typing-info').html("");
			}, 800);
		},

		formatTime : function(time){
			var n = new Date(parseInt(time)); 
            if((+new Date() - 86400000) > n){
               return [('0'+n.getDate()).slice(-2), ('0'+(n.getMonth()+1)).slice(-2), n.getFullYear()].join('.')+' ' + [('0'+n.getHours()).slice(-2), ('0'+n.getMinutes()).slice(-2)].join(':');
            } else {
                return [('0'+n.getHours()).slice(-2), ('0'+n.getMinutes()).slice(-2)].join(':');
            } 
		}
	});


	new App.Views.Main();
})();
