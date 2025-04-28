import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import VideoChat from '../components/VideoChat';
import Leaderboard from '../components/Leaderboard';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const [state, setState] = useState('waiting');
  const [sessionId, setSessionId] = useState(uuidv4());
  const [partnerId, setPartnerId] = useState(null);
  const [error, setError] = useState(null);
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    console.log('Initializing Socket.IO for sessionId:', sessionId);
    const socket = io('https://awe-qztc.onrender.com', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
      socket.emit('join', sessionId);
    });

    socket.on('error', (err) => {
      console.error('Socket.IO error:', err);
      setError(`Failed to connect to server: ${err.message || err}`);
    });

    socket.on('matched', ({ partnerId, isHuman }) => {
      console.log('Matched:', { partnerId, isHuman });
      setPartnerId(partnerId);
      setState('chatting');
    });

    socket.on('message', ({ sender, text }) => {
      console.log('Message received:', { sender, text });
      // Handle chat messages (add to UI if needed)
    });

    socket.on('timeUp', () => {
      console.log('Time up received');
      setState('guessing');
    });

    socket.on('guessResult', ({ correct, isHuman }) => {
      console.log('Guess result:', { correct, isHuman });
      if (correct && isHuman) {
        setState('video');
        console.log('Transitioning to video state');
      } else {
        setState('waiting');
        setPartnerId(null);
      }
    });

    socket.on('partnerDisconnected', () => {
      console.log('Partner disconnected');
      setState('waiting');
      setPartnerId(null);
      setError('Partner disconnected, waiting for a new match...');
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setError('Disconnected from server');
    });

    return () => {
      console.log('Cleaning up Socket.IO');
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    console.log('Home rendering, state:', state, 'sessionId:', sessionId, 'error:', error);

    const fetchBadges = async () => {
      try {
        const res = await fetch(`https://awe-qztc.onrender.com/badges/${sessionId}`, {
          mode: 'cors',
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        console.log('Badges fetched:', data);
        setBadges(data.badges);
      } catch (err) {
        console.error('Error fetching badges:', err);
      }
    };

    fetchBadges();
  }, [sessionId, state]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <h2 className="text-2xl text-red-600">Error</h2>
        <p>{error}</p>
        <button
          onClick={() => {
            setError(null);
            setState('waiting');
            setSessionId(uuidv4());
          }}
          className="mt-4 bg-blue-500 text-white p-2 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      {state === 'waiting' && <h2>Waiting for match...</h2>}
      {state === 'chatting' && <h2>Chatting with {partnerId}</h2>}
      {state === 'guessing' && <h2>Guessing...</h2>}
      {state === 'video' && <VideoChat sessionId={sessionId} partnerId={partnerId} />}
      <Leaderboard />
      <div>
        <h3>Badges</h3>
        <ul>{badges.map((badge, i) => <li key={i}>{badge}</li>)}</ul>
      </div>
    </div>
  );
}

export default Home;