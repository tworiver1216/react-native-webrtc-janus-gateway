import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
  TextInput,
  ListView,
} from 'react-native';

import {
  RTCPeerConnection,
  RTCMediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  RTCVideoView,
  MediaStreamTrack,
  getUserMedia,
} from 'react-native-webrtc';

import Janus from './janus.mobile.js';
import config from './config.js';

let server = config.JanusWssHost

let janus;
let sfutest = null;
let started = false;

let myusername = Math.floor(Math.random() * 1000);
let roomId = 1234
let myid = null;
let mystream = null;

let feeds = [];
var bitrateTimer = [];

var localstream_janus

Janus.init({debug: "all", callback: function() {
        if(started)
            return;
        started = true;
}});
janus = new Janus(
            {
                server: server,
                success: function() {
                    janus.attach(
                        {
                            plugin: "janus.plugin.videoroom",
                            success: function(pluginHandle) {
                                sfutest = pluginHandle;
                                Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                                Janus.log("  -- This is a publisher/manager");
                                        var register = { "request": "join", "room": roomId, "ptype": "publisher", "display": myusername };
                                        sfutest.send({"message": register});
                                        console.log("send msg join room")
                            },
                            error: function(error) {
                                Janus.error("  -- Error attaching plugin...", error);
                            },
                            consentDialog: function(on) {
                            },
                            mediaState: function(medium, on) {
                                Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                            },
                            webrtcState: function(on) {
                                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                            },
                            onmessage: function(msg, jsep) {
                                Janus.debug(" ::: Got a message (publisher) :::");
                                Janus.debug(JSON.stringify(msg));
                                var event = msg["videoroom"];
                                Janus.debug("Event: " + event);
                                if(event != undefined && event != null) {
                                    if(event === "joined") {
                                        // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                        myid = msg["id"];
                                        Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                        publishOwnFeed(true);
                                        // Any new feed to attach to?
                                        if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:");
                                            Janus.debug(list);
                                            for(var f in list) {
                                                var id = list[f]["id"];
                                                var display = list[f]["display"];
                                                Janus.debug("  >> [" + id + "] " + display);
                                                newRemoteFeed(id, display)
                                            }
                                        }
                                    } else if(event === "destroyed") {
                                        Janus.warn("The room has been destroyed!");
                                    } else if(event === "event") {
                                        // Any new feed to attach to?
                                        if(msg["publishers"] !== undefined && msg["publishers"] !== null) {
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:");
                                            Janus.debug(list);
                                            for(var f in list) {
                                                var id = list[f]["id"];
                                                var display = list[f]["display"];
                                                Janus.debug("  >> [" + id + "] " + display);
                                                newRemoteFeed(id, display)
                                            }
                                        } else if(msg["leaving"] !== undefined && msg["leaving"] !== null) {
                                            // One of the publishers has gone away?
                                            var leaving = msg["leaving"];
                                            Janus.log("Publisher left: " + leaving);
                                            var remoteFeed = null;
                                            for(var i=1; i<6; i++) {
                                                if(feeds[i] != null && feeds[i] != undefined && feeds[i].rfid == leaving) {
                                                    remoteFeed = feeds[i];
                                                    break;
                                                }
                                            }
                                            if(remoteFeed != null) {
                                                Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                            }
                                        } else if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                                            // One of the publishers has unpublished?
                                            var unpublished = msg["unpublished"];
                                            Janus.log("Publisher left: " + unpublished);
                                            if(unpublished === 'ok') {
                                                // That's us
                                                sfutest.hangup();
                                                return;
                                            }
                                            var remoteFeed = null;
                                            for(var i=1; i<6; i++) {
                                                if(feeds[i] != null && feeds[i] != undefined && feeds[i].rfid == unpublished) {
                                                    remoteFeed = feeds[i];
                                                    break;
                                                }
                                            }
                                            if(remoteFeed != null) {
                                                Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                            }
                                        } else if(msg["error"] !== undefined && msg["error"] !== null) {
                                        }
                                    }
                                }
                                if(jsep !== undefined && jsep !== null) {
                                    Janus.debug("Handling SDP as well...");
                                    Janus.debug(jsep);
                                    sfutest.handleRemoteJsep({jsep: jsep});
                                }
                            },
                            onlocalstream: function(stream) {
                                localstream_janus = stream;
                                container.setState({selfViewSrc: stream.toURL()});
                                container.setState({status: 'ready', info: 'Please enter or create room ID'});
                            },
                            onremotestream: function(stream) {
                            },
                            oncleanup: function() {
                                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                mystream = null;
                            }
                        });
                },
                error: function(error) {
                },
                destroyed: function() {
                    window.location.reload();
                }
            });

function checkEnter(field, event) {
    var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
    if(theCode == 13) {
        registerUsername();
        return false;
    } else {
        return true;
    }
}



function publishOwnFeed(useAudio) {
    sfutest.createOffer(
        {
            media: { audioRecv: false, videoRecv: false, audioSend: false, videoSend: false}, // Publishers are sendonly
            success: function(jsep) {
                Janus.debug("Got publisher SDP!");
                Janus.debug(jsep);
                var publish = { "request": "configure", "audio": useAudio, "video": true };
                sfutest.send({"message": publish, "jsep": jsep});
            },
            error: function(error) {
                Janus.error("WebRTC error:", error);
                if (useAudio) {
                     publishOwnFeed(false);
                } else {
                }
            }
        });
}

function toggleMute() {
    var muted = sfutest.isAudioMuted();
    Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
    if(muted)
        sfutest.unmuteAudio();
    else
        sfutest.muteAudio();
    muted = sfutest.isAudioMuted();
}

function unpublishOwnFeed() {
    var unpublish = { "request": "unpublish" };
    sfutest.send({"message": unpublish});
}

function newRemoteFeed(id, display) {
    let remoteFeed = null;
    janus.attach(
        {
            plugin: "janus.plugin.videoroom",
            success: function(pluginHandle) {
                remoteFeed = pluginHandle;
                Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
                Janus.log("  -- This is a subscriber");
                let listen = { "request": "join", "room": roomId, "ptype": "listener", "feed": id };
                remoteFeed.send({"message": listen});
            },
            error: function(error) {
                Janus.error("  -- Error attaching plugin...", error);
            },
            onmessage: function(msg, jsep) {
                Janus.debug(" ::: Got a message (listener) :::");
                Janus.debug(JSON.stringify(msg));
                let event = msg["videoroom"];
                Janus.debug("Event: " + event);
                if(event != undefined && event != null) {
                    if(event === "attached") {
                        // Subscriber created and attached
                    }
                }
                if(jsep !== undefined && jsep !== null) {
                    Janus.debug("Handling SDP as well...");
                    Janus.debug(jsep);
                    remoteFeed.createAnswer(
                        {
                            jsep: jsep,
                            media: { audioSend: false, videoSend: false },
                            success: function(jsep) {
                                Janus.debug("Got SDP!");
                                Janus.debug(jsep);
                                var body = { "request": "start", "room": roomId };
                                remoteFeed.send({"message": body, "jsep": jsep});
                            },
                            error: function(error) {
                                Janus.error("WebRTC error:", error);

                            }
                        });
                }
            },
            webrtcState: function(on) {
                Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
            },
            onlocalstream: function(stream) {
            },
            onremotestream: function(stream) {
                    console.log('onaddstream', stream);
                    container.setState({info: 'One peer join!'});
                    const remoteList = container.state.remoteList;
                    remoteList[remoteFeed.getId()] = stream.toURL();
                    container.setState({ remoteList: remoteList });
            },
            oncleanup: function() {
                Janus.log(" ::: Got a cleanup notification (remote feed " + id + ") :::");
                if(remoteFeed.spinner !== undefined && remoteFeed.spinner !== null)
                    remoteFeed.spinner.stop();
                remoteFeed.spinner = null;
                if(bitrateTimer[remoteFeed.rfindex] !== null && bitrateTimer[remoteFeed.rfindex] !== null)
                    clearInterval(bitrateTimer[remoteFeed.rfindex]);
                bitrateTimer[remoteFeed.rfindex] = null;
            }
        });
}

const pcPeers = {};
let localStream;

function getLocalStream(isFront, callback) {
  MediaStreamTrack.getSources(sourceInfos => {
    console.log(sourceInfos);
    let videoSourceId;
    for (const i = 0; i < sourceInfos.length; i++) {
      const sourceInfo = sourceInfos[i];
      if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
        videoSourceId = sourceInfo.id;
      }
    }
    getUserMedia({
      "audio": true,
      "video": {
        optional: [{sourceId: videoSourceId}]
      }
    }, function (stream) {
      console.log('dddd', stream);
      callback(stream);
    }, logError);
  });
}



function mapHash(hash, func) {
  const array = [];
  for (const key in hash) {
    const obj = hash[key];
    array.push(func(obj, key));
  }
  return array;
}

function getStats() {
  const pc = pcPeers[Object.keys(pcPeers)[0]];
  if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
    const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
    console.log('track', track);
    pc.getStats(track, function(report) {
      console.log('getStats report', report);
    }, logError);
  }
}

let container;

class reactNativeJanusWebrtcGateway extends Component{

    constructor(props) {
        super(props);
        this.ds = new ListView.DataSource({rowHasChanged: (r1, r2) => true});
        this.state ={ 
        info: 'Initializing',
        status: 'init',
        roomID: '',
        isFront: true,
        selfViewSrc: null,
        remoteList: {},
        textRoomConnected: false,
        textRoomData: [],
        textRoomValue: '',
        };
    } 

  componentDidMount(){
    container = this
  }

  _press(event) {
    this.refs.roomID.blur();
    this.setState({status: 'connect', info: 'Connecting'});
    join(this.state.roomID);
  } 

  _switchVideoType() {
    const isFront = !this.state.isFront;
    this.setState({isFront});
    getLocalStream(isFront, function(stream) {
      if (localStream) {
        for (const id in pcPeers) {
          const pc = pcPeers[id];
          pc && pc.removeStream(localStream);
        }
        localStream.release();
      }
      localStream = stream;
      container.setState({selfViewSrc: stream.toURL()});

      for (const id in pcPeers) {
        const pc = pcPeers[id];
        pc && pc.addStream(localStream);
      }
    });
  }

  receiveTextData(data) {
    const textRoomData = this.state.textRoomData.slice();
    textRoomData.push(data);
    this.setState({textRoomData, textRoomValue: ''});
  }

  _textRoomPress() {
    if (!this.state.textRoomValue) {
      return
    }
    const textRoomData = this.state.textRoomData.slice();
    textRoomData.push({user: 'Me', message: this.state.textRoomValue});
    for (const key in pcPeers) {
      const pc = pcPeers[key];
      pc.textDataChannel.send(this.state.textRoomValue);
    }
    this.setState({textRoomData, textRoomValue: ''});
  }

  _renderTextRoom() {
    return (
      <View style={styles.listViewContainer}>
        <ListView
          dataSource={this.ds.cloneWithRows(this.state.textRoomData)}
          renderRow={rowData => <Text>{`${rowData.user}: ${rowData.message}`}</Text>}
          />
        <TextInput
          style={{width: 200, height: 30, borderColor: 'gray', borderWidth: 1}}
          onChangeText={value => this.setState({textRoomValue: value})}
          value={this.state.textRoomValue}
        />
        <TouchableHighlight
          onPress={this._textRoomPress}>
          <Text>Send</Text>
        </TouchableHighlight>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          {this.state.info}
        </Text>
        {this.state.textRoomConnected && this._renderTextRoom()}
        <View style={{flexDirection: 'row'}}>
          <Text>
            {this.state.isFront ? "Use front camera" : "Use back camera"}
          </Text>
          <TouchableHighlight
            style={{borderWidth: 1, borderColor: 'black'}}
            onPress={this._switchVideoType}>
            <Text>Switch camera</Text>
          </TouchableHighlight>
        </View>
        { this.state.status == 'ready' ?
          (<View>
            <TextInput
              ref='roomID'
              autoCorrect={false}
              style={{width: 200, height: 40, borderColor: 'gray', borderWidth: 1}}
              onChangeText={(text) => this.setState({roomID: text})}
              value={this.state.roomID}
            />
            <TouchableHighlight
              onPress={this._press}>
              <Text>Enter room</Text>
            </TouchableHighlight>
          </View>) : null
        }
        <RTCView streamURL={this.state.selfViewSrc} style={styles.selfView}/>
        {
          mapHash(this.state.remoteList, function(remote, index) {
            return <RTCView key={index} streamURL={remote} style={styles.remoteView}/>
          })
        }
      </View>
    );
  }
};

const styles = StyleSheet.create({
  selfView: {
    width: 200,
    height: 150,
  },
  remoteView: {
    width: 200,
    height: 150,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  listViewContainer: {
    height: 150,
  },
});

AppRegistry.registerComponent('reactNativeJanusWebrtcGateway', () => reactNativeJanusWebrtcGateway);
