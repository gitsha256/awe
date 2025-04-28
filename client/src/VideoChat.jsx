import { useEffect, useRef } from 'react';
import Peer from 'peerjs';

function VideoChat({ sessionId, partnerId, peerId, remotePeerId, onPeerIdGenerated }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerInstance = useRef(null);

  useEffect(() => {
    // Fallback peer ID if sessionId is undefined
    const peerIdValue = sessionId ? `peer-${sessionId}` : `peer-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Initializing PeerJS with ID: ${peerIdValue}, sessionId: ${sessionId}`);

    const peer = new Peer(peerIdValue, {
      host: 'localhost',
      port: 4000,
      path: '/peerjs',
      debug: 3,
    });

    peerInstance.current = peer;

    peer.on('open', (id) => {
      console.log('PeerJS: My peer ID is', id);
      onPeerIdGenerated(id);
    });

    peer.on('call', (call) => {
      console.log('PeerJS: Receiving call');
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play();
          call.answer(stream);
          call.on('stream', (remoteStream) => {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play();
          });
          call.on('error', (err) => {
            console.error('Call error:', err);
          });
        })
        .catch((err) => {
          console.error('Media error:', err);
          alert('Failed to access camera/microphone. Please grant permissions.');
        });
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      alert('PeerJS error: ' + err.message);
    });

    return () => {
      peer.destroy();
    };
  }, [sessionId, onPeerIdGenerated]);

  useEffect(() => {
    if (remotePeerId && peerId && peerInstance.current) {
      // Only initiate call if sessionId is lexicographically smaller
      if (sessionId && sessionId < partnerId) {
        console.log(`Initiating call to ${remotePeerId}`);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then((stream) => {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play();
            const call = peerInstance.current.call(remotePeerId, stream);
            call.on('stream', (remoteStream) => {
              remoteVideoRef.current.srcObject = remoteStream;
              remoteVideoRef.current.play();
            });
            call.on('error', (err) => {
              console.error('Call error:', err);
            });
          })
          .catch((err) => {
            console.error('Media error:', err);
            alert('Failed to access camera/microphone. Please grant permissions.');
          });
      } else {
        console.log(`Waiting for call from ${remotePeerId}`);
      }
    }
  }, [remotePeerId, peerId, sessionId, partnerId]);

  return (
    <div className="w-full max-w-4xl bg-white p-4 rounded shadow">
      <h2 className="text-xl mb-4">Video Chat</h2>
      <p>Enjoy your conversation!</p>
      <div className="flex space-x-4">
        <div>
          <h3>My Video</h3>
          <video ref={localVideoRef} muted className="w-64 h-48 border" />
        </div>
        <div>
          <h3>Partner's Video</h3>
          <video ref={remoteVideoRef} className="w-64 h-48 border" />
        </div>
      </div>
      <div className="mt-4">
        <p>My Peer ID: {peerId}</p>
        <p>Partner's Peer ID: {remotePeerId}</p>
      </div>
    </div>
  );
}

export default VideoChat;