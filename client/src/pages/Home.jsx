import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import VideoChat from '../components/VideoChat';
import Leaderboard from '../components/Leaderboard';

function Home() {
  const [state, setState] = useState('waiting');
  const [sessionId, setSessionId] = useState('lz57wcgk6s'); // Replace with actual sessionId logic
  const [partnerId, setPartnerId] = useState(null);
  const [error, setError] = useState(null);
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    const socket = io('https://awe-backend.onrender.com', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
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
      // Handle chat messages
    });

    socket.on('timeUp', () => {
      console.log('Time up');
      setState('guessing');
    });

    socket.on('guessResult', ({ correct, isHuman }) => {
      console.log('Guess result:', { correct, isHuman });
      if (correct && isHuman) {
        setState('video');
        console.log('Transitioning to video state');
      } else {
        setState('waiting');
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setError('Disconnected from server');
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    console.log('Home rendering, state:', state, 'sessionId:', sessionId, 'error:', error);

    const fetchBadges = async () => {
      try {
        const res = await fetch(`https://awe-backend.onrender.com/badges${sessionId}`, {
          mode: 'cors',
          credentials: 'include',
        });
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