import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';

function VideoChat({ sessionId, partnerId }) {
  const [error, setError] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    console.log('VideoChat useEffect, sessionId:', sessionId, 'partnerId:', partnerId);

    const peerInstance = new Peer(sessionId, {
      host: 'awe-qztc.onrender.com',
      port: 443,
      path: '/peerjs',
      secure: true,
      debug: 3,
    });

    peerRef.current = peerInstance;

    peerInstance.on('open', (id) => {
      console.log('PeerJS connected, ID:', id);
      setError(null);
    });

    peerInstance.on('error', (err) => {
      console.error('PeerJS error:', err.type, err.message);
      setError(`PeerJS error: ${err.message}`);
    });

    peerInstance.on('disconnected', () => {
      console.log('PeerJS disconnected, attempting reconnect');
      peerInstance.reconnect();
    });

    peerInstance.on('close', () => {
      console.log('PeerJS connection closed');
      setError('PeerJS connection closed');
    });

    peerInstance.on('call', (call) => {
      console.log('Received call from:', call.peer);
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          console.log('Got local stream');
          streamRef.current = stream;
          localVideoRef.current.srcObject = stream;
          call.answer(stream);
          call.on('stream', (remoteStream) => {
            console.log('Received remote stream');
            remoteVideoRef.current.srcObject = remoteStream;
          });
          call.on('error', (err) => {
            console.error('Call error:', err);
            setError(`Call error: ${err.message}`);
          });
          call.on('close', () => {
            console.log('Call closed');
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
              streamRef.current = null;
            }
          });
        })
        .catch((err) => {
          console.error('Media error:', err);
          setError(`Media error: ${err.message}`);
        });
    });

    return () => {
      console.log('Cleaning up PeerJS');
      if (peerInstance) {
        peerInstance.destroy();
        peerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (peerRef.current && partnerId && streamRef.current) {
      console.log('Initiating call to:', partnerId);
      const call = peerRef.current.call(partnerId, streamRef.current);
      if (call) {
        call.on('stream', (remoteStream) => {
          console.log('Received remote stream from call');
          remoteVideoRef.current.srcObject = remoteStream;
        });
        call.on('error', (err) => {
          console.error('Call error:', err);
          setError(`Call error: ${err.message}`);
        });
        call.on('close', () => {
          console.log('Call closed');
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        });
      } else {
        console.error('Failed to initiate call: call object is undefined');
        setError('Failed to initiate call');
      }
    }
  }, [partnerId]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <h2 className="text-2xl text-red-600">Video Chat Error</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-blue-500 text-white p-2 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <h2>Video Chat</h2>
      <div className="flex gap-4">
        <video ref={localVideoRef} autoPlay muted className="w-1/2 border" />
        <video ref={remoteVideoRef} autoPlay className="w-1/2 border" />
      </div>
    </div>
  );
}

export default VideoChat;