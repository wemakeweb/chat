(function(){
	var App = {
		Views : {},
		Models : {},
		Collections : {}
	};
	App.Views.Main = Backbone.View.extend({
		initialize : function(){
			this.templates = {
				message : _.template($.trim($('#template-message').text()))
			};
			this.connect();
			this.layout();
			this.showLogin();

			$(window).on("resize", $.proxy(this.layout, this));
		},

		el : $('#app'),

		events : {
			'click .btn-login-submit' : 'login',
			'keydown #message-input' : 'keydown'
		},

		layout : function(){
			$('#messages').css("height", $(window).height() - 70);
		},

		showLogin : function(){
			$('#user-new').modal();
		},

		keydown : function(event){
			if(event.keyCode === 13){
				var $input = $(event.currentTarget);
				this.socket.emit('message', $input.val());
				$input.val('');
				event.preventDefault();
			} else {
				this.socket.emit('typing');
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
		},
		connect : function(){
			this.socket = io.connect('http://localhost');
		},

		bind : function(){
			this.socket.on('message', $.proxy(this.renderMessage, this));
		},

		renderMessage : function(message){
			if(this.lastMessage && this.lastMessage.user_name === message.user_name){
				this.$lastMessage.find('.message-body').append('<div>' + message.message + '</div>');
			} else {
				this.$lastMessage = $(this.templates.message({ message: message }));
				$('#messages').append(this.$lastMessage);
			}
			$('#messages').stop().animate({ scrollTop: $('#messages')[0].scrollHeight }, 200);

			this.lastMessage = message;
		},
	});


	new App.Views.Main();
})();