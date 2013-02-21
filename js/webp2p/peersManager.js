// Fallbacks for vendor-specific variables until the spec is finalized.
var RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;


/**
 * @classdesc Manager of the communications with the other peers
 * @constructor
 * @param {IDBDatabase} db ShareIt! database.
 * @param {String} [stun_server="stun.l.google.com:19302"] URL of the server
 * used for the STUN communications.
 */

function PeersManager(db, stun_server)
{
  // Set a default STUN server if none is specified
  if(stun_server == undefined)
     stun_server = 'stun.l.google.com:19302';

  EventTarget.call(this);

  var peers = {};

  var self = this;


  /**
   * UUID generator
   */
  var UUIDv4 = function b(a) {
    return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, b);
  };

  this.uid = UUIDv4();

  /**
   * Get the channel of one of the peers that have the file from its hash.
   * Since the hash and the tracker system are currently not implemented we'll
   * get just the channel of the peer where we got the file that we added
   * ad-hoc before
   * @param {Fileentry} Fileentry of the file to be downloaded.
   * @return {RTCDataChannel} Channel where we can ask for data of the file.
   */

  function getChannel(fileentry) {
    return fileentry.channel;
  }

  /**
   * Request (more) data for a file
   * @param {Fileentry} Fileentry of the file to be requested.
   */

  function transfer_query(fileentry)
  {
    var channel = getChannel(fileentry);
    var chunk = fileentry.bitmap.getRandom(false);

    channel.transfer_query(fileentry, chunk);
  }

  /**
   * Create a new RTCPeerConnection
   * @param {UUID} id Identifier of the other peer so later can be accessed.
   * @return {RTCPeerConnection}
   */
  function createPeerConnection(uid)
  {
    var pc = peers[uid] = new RTCPeerConnection(
    {
      iceServers: [{url: 'stun:'+stun_server}]
    });
    pc.onstatechange = function(event)
    {
      // Remove the peer from the list of peers when gets closed
      if(event.target.readyState == 'closed')
        delete peers[uid];
    };

    return pc;
  }

  /**
   * Initialize a {RTCDataChannel}
   * @param {RTCPeerConnection} pc PeerConnection owner of the DataChannel.
   * @param {RTCDataChannel} channel Communication channel with the other peer.
   */

  function initDataChannel(pc, channel, uid) {
    channel.uid = uid;

    pc._channel = channel;

    Transport_init(channel);

    Transport_Host_init(channel, db);
    Transport_Peer_init(channel, db, self);
    Transport_Routing_init(channel, self);
    Transport_Search_init(channel, db, self);

    channel.onclose = function() {
      delete pc._channel;

      pc.close();
    };

    self.addEventListener('file.added', function(event)
    {
      var fileentry = event.data[0];

      channel._send_file_added(fileentry);
    });
    self.addEventListener('file.deleted', function(event)
    {
      var fileentry = event.data[0];

      channel._send_file_deleted(fileentry);
    });
  }


  /**
   * Process the offer to connect to a new peer
   * @param {UUID} uid Identifier of the other peer.
   * @param {String} sdp Session Description Protocol data of the other peer.
   * @return {RTCPeerConnection} The (newly created) peer.
   */
  this.onoffer = function(uid, sdp) {
    // Search the peer between the list of currently connected peers
    var peer = peers[uid];

    // Peer is not connected, create a new channel
    if (!peer) {
      peer = createPeerConnection(uid);
      peer.ondatachannel = function(event) {
        console.log('Created datachannel with peer ' + uid);
        initDataChannel(peer, event.channel, uid);
      };
      peer.onerror = function(event) {
        if (onerror) onerror(uid, event);
      };
    }

    // Process offer
    peer.setRemoteDescription(new RTCSessionDescription({
      sdp: sdp,
      type: 'offer'
    }));

    return peer;
  };

  /**
   * Process the answer received while attempting to connect to the other peer
   * @param {UUID} uid Identifier of the other peer.
   * @param {String} sdp Session Description Protocol data of the other peer.
   * @param {Function} onerror Callback called if we don't have previously
   * wanted to connect to the other peer.
   */
  this.onanswer = function(uid, sdp, onerror) {
    // Search the peer on the list of currently connected peers
    var peer = peers[uid];
    if (peer) peer.setRemoteDescription(new RTCSessionDescription({
      sdp: sdp,
      type: 'answer'
    }));
    else if (onerror) onerror(uid);
  };

  // Init handshake manager
  var handshakeManager = new HandshakeManager('json/handshake.json', this);
  handshakeManager.onerror = function(error)
  {
    console.error(error);
    alert(error);
  };
  handshakeManager.onopen = function()
  {
    var event = document.createEvent("Event");
        event.initEvent('uid',true,true);
        event.data = [self.uid]

    self.dispatchEvent(event);

//    // Restart downloads
//    db.files_getAll(null, function(filelist)
//    {
//      if(filelist.length)
//        policy(function()
//        {
//          for(var i=0, fileentry; fileentry=filelist[i]; i++)
//            if(fileentry.bitmap)
//              self.transfer_query(fileentry)
//        })
//    })
  };

  /**
   * Connects to another peer based on its UID. If we are already connected,
   * it does nothing.
   * @param {UUID} uid Identifier of the other peer to be connected.
   * @param {Function} onsuccess Callback called when the connection was done.
   * @param {Function} onerror Callback called when connection was not possible.
   * @param {MessageChannel} incomingChannel Optional channel where to
   * send the offer. If not defined send it to all connected peers.
   */
  this.connectTo = function(uid, onsuccess, onerror, incomingChannel)
  {
    // Search the peer between the list of currently connected peers
    var peer = peers[uid];

    // Peer is not connected, create a new channel
    if(!peer)
    {
      // Create PeerConnection
      peer = createPeerConnection(uid);
      peer.onopen = function(event)
      {
        var channel = peer.createDataChannel('webp2p');
        channel.addEventListener('open', function(event)
        {
          initDataChannel(peer, channel, uid);

          if(onsuccess)
             onsuccess(channel);
        });
        channel.onerror = function(event)
        {
          if(onerror)
             onerror(uid, peer, channel);
        };
      };
      peer.onerror = function(event)
      {
        if(onerror)
           onerror(uid, peer);
      };

      // Send offer to new PeerConnection
      peer.createOffer(function(offer)
      {
        // Send the offer only for the incoming channel
        if(incomingChannel)
           incomingChannel.sendOffer(uid, offer.sdp);

        // Send the offer throught all the peers
        else
        {
          var channels = self.getChannels();

          // Send the connection offer to the other connected peers
          for(var channel_id in channels)
            channels[channel_id].sendOffer(uid, offer.sdp);
        }

        // Set the peer local description
        peer.setLocalDescription(new RTCSessionDescription(
        {
          sdp: offer.sdp,
          type: 'offer'
        }));
      });
    }

    // PeerConnection is connected but channel not created
    else if(!peer._channel)
      alert('PeerConnection is connected but channel not created, please wait'+
            'some more seconds')

    // Channel is created and we have defined an 'onsucess' callback
    else if(onsuccess)
    {
      // Channel is open
      if(peer._channel.readyState == 'open')
        onsuccess(peer._channel);

      // Channel is not yet open
      else
        peer._channel.addEventListener('open', function(event)
        {
          onsuccess(event.target);
        })
    }
  };

  /**
   * Get the channels of all the connected peers and handshake servers
   */
  this.getChannels = function()
  {
    var channels = {};

    // Peers channels
    for(var uid in peers)
    {
      var channel = peers[uid]._channel;
      if(channel)
        channels[uid] = channel;
    }

    // Handshake servers channels
    var handshakeChannels = handshakeManager.getChannels();
    for(var uid in handshakeChannels)
      if(handshakeChannels.hasOwnProperty(uid))
        channels[uid] = handshakeChannels[uid];

      return channels;
  };


  this.handshakeDisconnected = function()
  {
    if(!Object.keys(peers).length)
    {
      var event = document.createEvent("Event");
          event.initEvent('error.noPeers',true,true);

      this.dispatchEvent(event);
    }
  };
}