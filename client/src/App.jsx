import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Chat from './Chat';
import Guess from './Guess';
import VideoChat from './VideoChat';

// Initialize Socket.IO client
const socket = io('http://localhost:4000', {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

function App() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const [isHuman, setIsHuman] = useState(false);
  const [isVideoChatUnlocked, setIsVideoChatUnlocked] = useState(false);
  const [matchingStatus, setMatchingStatus] = useState('Connecting to server...');
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');

  useEffect(() => {
    const sessionId = `user-${Math.random().toString(36).substr(2, 9)}`;
    console.log('Generated sessionId:', sessionId);
    setSessionId(sessionId);

    socket.on('connect', () => {
      console.log('Connected to Socket.IO server:', socket.id);
      setMatchingStatus('Looking for a partner...');
      socket.emit('join', sessionId);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err.message);
      setMatchingStatus(`Failed to connect to server: ${err.message}. Retrying...`);
    });

    socket.on('error', (err) => {
      console.error('Socket.IO error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
      console.log(`Socket.IO reconnected after ${attempt} attempts`);
      setMatchingStatus('Looking for a partner...');
      socket.emit('join', sessionId);
    });

    socket.on('reconnect_failed', () => {
      console.error('Socket.IO reconnection failed');
      setMatchingStatus('Failed to reconnect to server. Please refresh the page.');
    });

    socket.on('matched', ({ partnerId, isHuman }) => {
      console.log(`Matched with ${partnerId} (isHuman: ${isHuman})`);
      setPartnerId(partnerId);
      setIsHuman(isHuman);
      setMatchingStatus(`Matched with ${isHuman ? 'a human' : 'an AI'}`);
    });

    socket.on('message', (message) => {
      console.log('Received message:', message);
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    socket.on('guessResult', ({ correct, isHuman }) => {
      console.log(`Guess result: Correct=${correct}, isHuman=${isHuman}`);
      if (correct && isHuman) {
        setIsVideoChatUnlocked(true);
        setMatchingStatus('Correct guess! Video chat unlocked.');
        socket.emit('videoChatUnlocked', { sessionId, partnerId });
      } else {
        alert('Incorrect guess. Finding a new partner...');
        setMessages([]);
        setPartnerId(null);
        setIsHuman(false);
        setIsVideoChatUnlocked(false);
        setPeerId('');
        setRemotePeerId('');
        setMatchingStatus('Looking for a new partner...');
      }
    });

    socket.on('videoChatUnlocked', ({ sessionId: senderId }) => {
      console.log(`Video chat unlocked by ${senderId}`);
      setIsVideoChatUnlocked(true);
      setMatchingStatus('Partner unlocked video chat!');
    });

    socket.on('peerId', ({ sessionId: senderId, peerId: remoteId }) => {
      console.log(`Received peer ID from ${senderId}: ${remoteId}`);
      setRemotePeerId(remoteId);
    });

    socket.on('partnerDisconnected', () => {
      console.log('Partner disconnected');
      alert('Your partner disconnected. Finding a new partner...');
      setMessages([]);
      setPartnerId(null);
      setIsHuman(false);
      setIsVideoChatUnlocked(false);
      setPeerId('');
      setRemotePeerId('');
      setMatchingStatus('Looking for a new partner...');
    });

    socket.on('timeUp', () => {
      console.log('Time up');
      alert('Time is up! Your guess time starts now.');
      setMatchingStatus('Time up! Make your guess.');
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('error');
      socket.off('reconnect');
      socket.off('reconnect_failed');
      socket.off('matched');
      socket.off('message');
      socket.off('guessResult');
      socket.off('videoChatUnlocked');
      socket.off('peerId');
      socket.off('partnerDisconnected');
      socket.off('timeUp');
    };
  }, []);

  const handlePeerIdGenerated = (newPeerId) => {
    console.log(`Generated peer ID: ${newPeerId}`);
    setPeerId(newPeerId);
    if (partnerId) {
      socket.emit('peerId', { sessionId, peerId: newPeerId, partnerId });
    }
  };

  return (
    <div className="App">
      <h1>Guess if your partner is Human or AI</h1>
      <p>{matchingStatus}</p>
      {partnerId && !isVideoChatUnlocked && <Chat socket={socket} sessionId={sessionId} messages={messages} />}
      {partnerId && !isVideoChatUnlocked && <Guess socket={socket} sessionId={sessionId} partnerId={partnerId} />}
      {isVideoChatUnlocked && sessionId && (
        <VideoChat
          sessionId={sessionId}
          partnerId={partnerId}
          peerId={peerId}
          remotePeerId={remotePeerId}
          onPeerIdGenerated={handlePeerIdGenerated}
        />
      )}
    </div>
  );
}

export default App;