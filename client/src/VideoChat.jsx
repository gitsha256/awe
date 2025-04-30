import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';

const VideoChat = ({ sessionId, partnerId, peerId, remotePeerId, onPeerIdGenerated }) => {
  const [peer, setPeer] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    console.log('Initializing PeerJS with sessionId:', sessionId, 'partnerId:', partnerId);
    // Initialize PeerJS with explicit ID and retry logic
    const peerId = `peer-${sessionId}`;
    const peerInstance = new Peer(peerId, {
      host: 'localhost',
      port: 4000,
      path: '/peerjs',
      debug: 3, // Maximum debug level
      secure: false,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      },
    });

    peerInstance.on('open', (id) => {
      console.log(`PeerJS ID generated: ${id}`);
      setConnectionError(null);
      onPeerIdGenerated(id);
      setPeer(peerInstance);
    });

    peerInstance.on('error', (err) => {
      console.error('PeerJS error:', err.type, err.message);
      setConnectionError(`PeerJS error: ${err.message}`);
      // Retry connection after 5 seconds
      setTimeout(() => {
        console.log('Retrying PeerJS connection...');
        peerInstance.reconnect();
      }, 5000);
    });

    peerInstance.on('disconnected', () => {
      console.log('PeerJS disconnected, attempting to reconnect...');
      peerInstance.reconnect();
    });

    return () => {
      console.log('Cleaning up PeerJS, ID:', peerId);
      peerInstance.destroy();
    };
  }, [sessionId, onPeerIdGenerated]);

  useEffect(() => {
    if (peer && remotePeerId) {
      console.log('Starting video call with remotePeerId:', remotePeerId);
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          const call = peer.call(remotePeerId, stream);
          call.on('stream', (remoteStream) => {
            console.log('Received remote stream');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          });
          call.on('error', (err) => {
            console.error('Call error:', err);
            setConnectionError(`Call error: ${err.message}`);
          });
          call.on('close', () => {
            console.log('Call closed');
            setConnectionError('Call ended');
          });
        })
        .catch((err) => {
          console.error('Failed to get user media:', err);
          setConnectionError(`Media error: ${err.message}`);
        });

      peer.on('call', (call) => {
        console.log('Receiving incoming call');
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then((stream) => {
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
            call.answer(stream);
            call.on('stream', (remoteStream) => {
              console.log('Received remote stream');
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
              }
            });
            call.on('error', (err) => {
              console.error('Call error:', err);
              setConnectionError(`Call error: ${err.message}`);
            });
            call.on('close', () => {
              console.log('Call closed');
              setConnectionError('Call ended');
            });
          })
          .catch((err) => {
            console.error('Failed to get user media:', err);
            setConnectionError(`Media error: ${err.message}`);
          });
      });
    }
  }, [peer, remotePeerId]);

  return (
    <div>
      <h2>Video Chat</h2>
      {connectionError && <p style={{ color: 'red' }}>{connectionError}</p>}
      <video ref={localVideoRef} autoPlay muted style={{ width: '300px' }} />
      <video ref={remoteVideoRef} autoPlay style={{ width: '300px' }} />
    </div>
  );
};

export default VideoChat;