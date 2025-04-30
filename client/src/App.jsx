console.log('App.jsx loaded');
import React, { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import Chat from './Chat';
import Guess from './Guess';
import VideoChat from './VideoChat';
import config from './config'; // Adjust path if config.js is elsewhere

// Enable Socket.IO debugging
localStorage.setItem('debug', 'socket.io-client:*');

function ErrorBoundary({ children }) {
  const [error, setError] = useState(null);
  if (error) {
    return <div>Error: {error.message}. Please refresh.</div>;
  }
  return children;
}

function App() {
  // Generate sessionId synchronously
  const generateSessionId = useCallback(() => {
    const newId = `user-${uuidv4()}-${Date.now()}`;
    console.log('Generated new sessionId:', newId);
    return newId;
  }, []);

  // Always generate a new sessionId on load
  const [sessionId, setSessionId] = useState(generateSessionId());
  const [messages, setMessages] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const partnerIdRef = useRef(partnerId);
  const [isHuman, setIsHuman] = useState(false);
  const [isVideoChatUnlocked, setIsVideoChatUnlocked] = useState(false);
  const [matchingStatus, setMatchingStatus] = useState('Connecting to server...');
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');
  const resetTimeoutRef = useRef(null);
  const socketRef = useRef(null);
  const retryCount = useRef(0);

  // Update partnerIdRef
  useEffect(() => {
    partnerIdRef.current = partnerId;
    console.log('Updated partnerIdRef:', partnerId);
  }, [partnerId]);

  // Reset and join with throttling
  const resetAndJoin = useCallback(() => {
    if (!sessionId || resetTimeoutRef.current || !socketRef.current) {
      console.log('Skipping resetAndJoin: sessionId=', sessionId, 'resetTimeout=', !!resetTimeoutRef.current, 'socket=', !!socketRef.current);
      return;
    }
    console.log('Executing resetAndJoin, leaving sessionId:', sessionId);
    socketRef.current.emit('leave', sessionId);
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setMessages([]);
    setPartnerId(null);
    setIsHuman(false);
    setIsVideoChatUnlocked(false);
    setPeerId('');
    setRemotePeerId('');
    setMatchingStatus('Finding a random partner...');
    setTimeout(() => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('join', newSessionId);
        console.log('Emitted join with sessionId:', newSessionId);
      } else {
        console.log('Socket not connected, attempting reconnect');
        socketRef.current.connect();
        setTimeout(() => {
          socketRef.current.emit('join', newSessionId);
          console.log('Emitted join after reconnect attempt:', newSessionId);
        }, 1000);
      }
    }, 7000);
    resetTimeoutRef.current = setTimeout(() => {
      resetTimeoutRef.current = null;
    }, 30000);
  }, [sessionId, generateSessionId]);

  // Initialize Socket.IO (runs once)
  useEffect(() => {
    socketRef.current = io(config.server.url, {
      withCredentials: true,
      transports: ['polling'], // Force polling to avoid WebSocket issues
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    console.log('Socket.IO initialized:', socketRef.current.id || 'pending', 'URL:', config.server.url);

    const socket = socketRef.current;

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { sessionId });
        console.log('Sent heartbeat for sessionId:', sessionId);
      }
    }, 15000);

    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
      retryCount.current = 0;
      setMatchingStatus('Finding a random partner...');
      socket.emit('join', sessionId);
      console.log('Emitted join on connect with sessionId:', sessionId);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO connect_error:', err.message, err.stack);
      setMatchingStatus(`Connection failed: ${err.message}. Retrying (${retryCount.current + 1}/5)...`);
      retryCount.current += 1;
      if (retryCount.current >= 5) {
        setMatchingStatus('Failed to connect to server. Please check server status and refresh.');
      }
    });

    socket.on('error', (err) => {
      console.error('Socket.IO error:', err.message);
      setMatchingStatus(`Error: ${err.message}`);
      if (err.message.includes('Session ID already in use')) {
        const newSessionId = generateSessionId();
        setSessionId(newSessionId);
        socket.emit('join', newSessionId);
        console.log('Generated new sessionId due to conflict:', newSessionId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      setMatchingStatus(`Disconnected: ${reason}. Reconnecting...`);
      if (reason === 'ping timeout' || reason === 'io server disconnect') {
        console.warn('Disconnect detected, attempting reconnect');
        socket.connect();
      }
    });

    socket.on('reconnect', (attempt) => {
      console.log(`Socket.IO reconnected after ${attempt} attempts`);
      setMatchingStatus('Finding a random partner...');
      socket.emit('join', sessionId);
      console.log('Emitted join on reconnect with sessionId:', sessionId);
    });

    socket.on('reconnect_failed', () => {
      console.error('Socket.IO reconnection failed');
      setMatchingStatus('Failed to reconnect. Please refresh the page.');
    });

    socket.on('matched', ({ partnerId, isHuman }) => {
      console.log('Matched event received:', { partnerId, isHuman });
      setPartnerId(partnerId);
      setIsHuman(isHuman);
      setIsVideoChatUnlocked(false);
      setMessages([]);
      setPeerId('');
      setRemotePeerId('');
      setMatchingStatus(`Matched with ${isHuman ? 'a human' : 'an AI'} (ID: ${partnerId})`);
    });

    socket.on('partnerDisconnected', () => {
      console.log('Partner disconnected');
      alert('Your partner disconnected. Finding a new partner...');
      resetAndJoin();
    });

    socket.on('timeUp', () => {
      console.log('Session timed out');
      alert('Session timed out. Finding a new partner...');
      resetAndJoin();
    });

    socket.on('left', ({ sessionId }) => {
      console.log(`Confirmed leave for sessionId: ${sessionId}`);
    });

    socket.on('guessResult', ({ partnerId, isCorrect, isPartnerHuman }) => {
      console.log(`Guess result: partner=${partnerId}, isCorrect=${isCorrect}, isPartnerHuman=${isPartnerHuman}`);
      alert(`Your guess was ${isCorrect ? 'correct' : 'incorrect'}! Partner is ${isPartnerHuman ? 'human' : 'AI'}.`);
    });

    socket.on('unlockVideoChat', ({ partnerId }) => {
      console.log(`Unlocking video chat with partner: ${partnerId}`);
      setIsVideoChatUnlocked(true);
    });

    socket.on('receivePeerId', ({ peerId, fromSessionId }) => {
      console.log(`Received peerId ${peerId} from ${fromSessionId}`);
      setRemotePeerId(peerId);
    });

    socket.connect();
    console.log('Forced Socket.IO connect attempt');

    const errorHandler = (err) => {
      console.error('Global error:', err.message, err.stack);
      setMatchingStatus(`Error: ${err.message}. Please refresh.`);
    };
    window.addEventListener('error', errorHandler);

    return () => {
      console.log('Cleaning up Socket.IO');
      clearInterval(heartbeatInterval);
      window.removeEventListener('error', errorHandler);
      clearTimeout(resetTimeoutRef.current);
    };
  }, [sessionId, generateSessionId]);

  const handlePeerIdGenerated = (newPeerId) => {
    console.log('PeerId generated:', newPeerId);
    setPeerId(newPeerId);
    if (partnerIdRef.current && socketRef.current) {
      socketRef.current.emit('peerId', { sessionId, peerId: newPeerId, partnerId: partnerIdRef.current });
      console.log('Emitted peerId:', { sessionId, peerId: newPeerId, partnerId: partnerIdRef.current });
    }
  };

  return (
    <ErrorBoundary>
      <div className="App">
        <h1>Human or AI</h1>
        <p>{matchingStatus}</p>
        {partnerId && !isVideoChatUnlocked && (
          <Chat socket={socketRef.current} sessionId={sessionId} messages={messages} setMessages={setMessages} />
        )}
        {partnerId && !isVideoChatUnlocked && (
          <Guess socket={socketRef.current} sessionId={sessionId} partnerId={partnerId} />
        )}
        {isVideoChatUnlocked && sessionId && partnerId && remotePeerId && (
          <VideoChat
            sessionId={sessionId}
            partnerId={partnerId}
            peerId={peerId}
            remotePeerId={remotePeerId}
            onPeerIdGenerated={handlePeerIdGenerated}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;