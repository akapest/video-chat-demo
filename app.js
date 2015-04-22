(function(){

	// UI
	var local = document.querySelector('#local'),
		remote = document.querySelector('#remote'),
		callButton = document.querySelector('#callButton'),
		hangupButton = document.querySelector('#hangupButton'),
		localId = document.querySelector('#localId'),
		remoteId = document.querySelector('#remoteId'),
		console_ = document.querySelector('#console')

	// EVENTS
	callButton.onclick = call
	hangupButton.onclick = hangup
	remoteId.onkeyup = onChangeRemoteId

	// DEBUG
//	console = console || {}
//	console.log = function(message){
//		var el = document.createElement('p')
//		var log = message.length ? message : JSON.stringify(message)
//		log = log.slice(0, 300)
//		el.innerHTML = log
//		console_.appendChild(el)
//	}

	// SIGNALLING TRANSPORT
	var socket = io()

	// IDs
	var selfId = parseInt(Math.random() * 99999)
	localId.innerHTML = selfId

	// STUN/TURN
	var isChrome = !!navigator.webkitGetUserMedia,
		STUN = {
			url: isChrome
				? 'stun:stun.l.google.com:19302'
				: 'stun:23.21.150.121'
		},
		TURN = {
			url: 'turn:homeo@turn.bistri.com:80',
			credential: 'homeo'
		},
		iceServers = {
			iceServers: [STUN, TURN]
		},
		pcConstraints = {
			optional: [{DtlsSrtpKeyAgreement: true}] // DTLS/SRTP is preferred on chrome to interop with Firefox which supports them by default
		},
		sdpConstraints = {
			optional: [],
			mandatory: {
				OfferToReceiveAudio: true,
				OfferToReceiveVideo: true
			}
		}

	// LOCAL MEDIA
	var localMedia = null
	getUserMedia({audio:true, video:true}, function(media){
		localMedia = media
		attachMediaStream(local, media)
		updateReadiness()

	}, function(e){
		console.error('Can not get user media', e)
	})

	// STATE
	function remotePeerId(){
		return parseInt(remoteId.value)
	}

	function onChangeRemoteId(){
		updateReadiness()
	}

	function updateReadiness(){
		var remoteIdReady = !isNaN(remotePeerId()) && remotePeerId() > 0
		if (localMedia && remoteIdReady){
			setState('idle')
		} else {
			setState('notReady')
		}
	}

	function setState(state){
		if (state == 'notReady'){
			callButton.disabled = 'disabled'
			hangupButton.disabled = 'disabled'

		} else if (state == 'idle'){
			callButton.disabled = ''
			hangupButton.disabled = 'disabled'

		} else if (state == 'calling'){
			callButton.disabled = 'disabled'
			hangupButton.disabled = ''
		}
	}

	// ACTIONS
	var sender = null,
		receiver = null

	function call(){
		sender = new Peer(selfId, 'sender', localMedia, remotePeerId())
		sender.connection.createOffer(sender.genMessage('offer'), function(e){console.error(e)}, sdpConstraints)
		setState('calling')
	}

	function hangup(){
		sender.connection.close()
		socket.send({type: 'close'})
		setState('idle')
	}

	// REACTIONS
	socket.on('message', function(data){
		var peer = null
		if (data.remote == 's' + selfId){
			peer = sender
		} else if (data.remote == 'r' + selfId){
			peer = receiver
		} else {
			return
		}
		if (data.type != 'candidate'){
			console.log('get message')
			console.log(data)
		}
		switch (data.type){
			case 'offer': {
				if (!localMedia) alert('No video captured, try to allow')
				receiver = new Peer(selfId, 'receiver', localMedia, data.sender)
				receiver.setRemoteDescription(data.sdp)
				receiver.connection.createAnswer(receiver.genMessage('answer'), function(e){console.error(e)}, sdpConstraints)
				setState('calling')
				break
			}
			case 'answer': {
				sender.setRemoteDescription(data.sdp)
				break
			}
			case 'candidate': {
				peer.connection.addIceCandidate(new RTCIceCandidate({
					sdpMLineIndex: data.candidate.sdpMLineIndex,
					candidate: data.candidate.candidate
				}))
				break
			}
			case 'close': {
				receiver.connection.close()
				setState('idle	')
			}
		}
	})

	// PEER CONNECTION
	var Peer = function(id, type, stream, remoteId){
		if (!(type == 'sender' || type == 'receiver')) throw new Error('Invalid peer type')
		if (type == 'sender' && !remoteId) throw new Error('Remote not specified')
		if (!stream) throw new Error('Local stream not specified')
		if (!remoteId) throw new Error('Remote id not specified')
		this.id = type.slice(0, 1) + id
		this.connection = this.createConnection(stream)
		this.remoteId = remoteId.length ? remoteId : 'r' + remoteId // adding 's' or 'r' to id to enable connecting to peer on the same page
	}

	Peer.prototype.createConnection = function(stream){
		var connection = new RTCPeerConnection(iceServers, pcConstraints)
		connection.addStream(localMedia)
		connection.onaddstream = function(event) {
			console.log('Attaching remote stream')
			console.log(event)
			attachMediaStream(remote, event.stream) //TODO extract to event
		}
		var self = this
		connection.onicecandidate = function(event){
			if(event.candidate) {
				self.send({
					type: 'candidate',
					candidate: event.candidate
				})
			}
		}
		return connection
	}

	Peer.prototype.setRemoteDescription = function(sdp){
		this.connection.setRemoteDescription(new RTCSessionDescription(sdp))
	}
	
	Peer.prototype.send = function(message){
		message.sender = this.id
		message.remote = this.remoteId
		socket.emit('message', message)
	}

	Peer.prototype.genMessage = function(type){
		return genMessage(this, type)
	}

	var genMessage = function(peer, type){
		return function(sdp){
			console.log(type + ' sent, from ' + peer.id)
			peer.connection.setLocalDescription(sdp)
			peer.send({
				type: type,
				sdp: sdp
			})
		}
	}


}())