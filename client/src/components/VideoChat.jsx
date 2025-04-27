import { useEffect, useRef } from 'react';
import Peer from 'peerjs';

function VideoChat({ sessionId, partnerId }) {
  const videoRef = useRef();
  const partnerVideoRef = useRef();

  useEffect(() => {
    // Use default PeerJS server for simplicity
    const peer = new Peer(sessionId, {
      host: 'peerjs.com', // Default public PeerJS server
      port: 443,
      secure: true,
    });

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      videoRef.current.srcObject = stream;
      const call = peer.call(partnerId, stream);
      call.on('stream', (remoteStream) => {
        partnerVideoRef.current.srcObject = remoteStream;
      });
    }).catch((err) => {
      console.error('Failed to get media:', err);
    });

    peer.on('call', (call) => {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        call.answer(stream);
        call.on('stream', (remoteStream) => {
          partnerVideoRef.current.srcObject = remoteStream;
        });
      }).catch((err) => {
        console.error('Failed to answer call:', err);
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
    });

    return () => peer.destroy();
  }, [sessionId, partnerId]);

  return (
    <div className="w-full max-w-md bg-white p-4 rounded shadow">
      <h2 className="text-xl mb-4">Video Chat</h2>
      <div className="flex space-x-2">
        <video ref={videoRef} autoPlay muted className="w-1/2 border" />
        <video ref={partnerVideoRef} autoPlay className="w-1/2 border" />
      </div>
    </div>
  );
}

export default VideoChat;