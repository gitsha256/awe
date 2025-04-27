import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Chat from '../components/Chat';
import Guess from '../components/Guess';
import VideoChat from '../components/VideoChat';
import Leaderboard from '../components/Leaderboard';
import Badge from '../components/Badge';

const socket = io('http://localhost:4000', {
  reconnect: true,
  transports: ['websocket', 'polling'],
  withCredentials: true,
});

function Home() {
  const [sessionId] = useState(Math.random().toString(36).slice(2));
  const [state, setState] = useState('waiting');
  const [partnerId, setPartnerId] = useState(null);
  const [isHuman, setIsHuman] = useState(null);
  const [messages, setMessages] = useState([]);
  const [badges, setBadges] = useState([]);
  const [error, setError] = useState(null);

  console.log('Home rendering, state:', state, 'sessionId:', sessionId, 'error:', error);

  useEffect(() => {
    console.log('useEffect running');

    socket.on('connect', () => {
      console.log('Socket.IO connected, socket id:', socket.id);
      setError(null);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO error:', err.message, err.stack);
      setError(`Failed to connect to server: ${err.message}`);
    });

    socket.on('error', (err) => {
      console.error('Socket.IO server error:', err);
      setError(`Server error: ${err}`);
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setError('Disconnected from server');
    });

    socket.on('matched', ({ partnerId, isHuman }) => {
      console.log('Matched:', { partnerId, isHuman });
      setPartnerId(partnerId);
      setIsHuman(isHuman);
      setState('chatting');
    });

    socket.on('message', (msg) => {
      console.log('Message received:', msg);
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('timeUp', () => {
      console.log('Time up');
      setState('guessing');
    });

    socket.on('guessResult', ({ correct, isHuman }) => {
      console.log('Guess result:', { correct, isHuman });
      if (correct && isHuman) {
        console.log('Transitioning to video state');
        setState('video');
      } else {
        console.log('Transitioning to waiting state');
        setMessages([]);
        setState('waiting');
        socket.emit('join', sessionId);
      }
    });

    socket.emit('join', sessionId);

    const fetchBadges = async () => {
      try {
        console.log('Fetching badges for sessionId:', sessionId);
        const res = await fetch(`http://localhost:4000/badges/${sessionId}`, {
          mode: 'cors',
          credentials: 'include',
        });
        console.log('Fetch response:', { status: res.status, statusText: res.statusText });
        if (!res.ok) {
          const text = await res.text();
          console.log('Fetch error response:', text.slice(0, 100));
          throw new Error(`HTTP error ${res.status}`);
        }
        const data = await res.json();
        console.log('Badges fetched:', data);
        setBadges(data.badges || []);
      } catch (err) {
        console.error('Fetch badges error:', err);
      }
    };
    fetchBadges();

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('error');
      socket.off('disconnect');
      socket.off('matched');
      socket.off('message');
      socket.off('timeUp');
      socket.off('guessResult');
      socket.disconnect();
    };
  }, [sessionId]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <h1 className="text-2xl text-red-600">Error: {error}</h1>
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
      <Leaderboard />
      <div className="w-full max-w-md mb-4">
        <h2 className="text-lg">Your Badges</h2>
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <Badge key={badge} name={badge} />
          ))}
        </div>
      </div>
      {state === 'waiting' && <h1 className="text-2xl">Finding a match...</h1>}
      {state === 'chatting' && (
        <Chat socket={socket} sessionId={sessionId} messages={messages} />
      )}
      {state === 'guessing' && (
        <Guess socket={socket} sessionId={sessionId} partnerId={partnerId} />
      )}
      {state === 'video' && <VideoChat sessionId={sessionId} partnerId={partnerId} />}
    </div>
  );
}

export default Home;