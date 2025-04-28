import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Chat from './Chat';
import Guess from './Guess';
import VideoChat from './VideoChat';

const socket = io('http://localhost:4000'); // Replace with your server URL

function App() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const [isHuman, setIsHuman] = useState(false);
  const [isVideoChatUnlocked, setIsVideoChatUnlocked] = useState(false);

  useEffect(() => {
    const sessionId = `user-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(sessionId);
    socket.emit('join', sessionId);

    socket.on('matched', ({ partnerId, isHuman }) => {
      setPartnerId(partnerId);
      setIsHuman(isHuman);
    });

    socket.on('message', (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    socket.on('guessResult', ({ correct, isHuman }) => {
      if (correct && isHuman) {
        setIsVideoChatUnlocked(true);
      } else {
        alert('Incorrect guess. Finding a new partner...');
        setMessages([]);
        setPartnerId(null);
        setIsHuman(false);
      }
    });

    socket.on('partnerDisconnected', () => {
      alert('Your partner disconnected. Finding a new partner...');
      setMessages([]);
      setPartnerId(null);
      setIsHuman(false);
    });

    socket.on('timeUp', () => {
      alert('Time is up! Your guess time starts now.');
    });

    return () => {
      socket.off('matched');
      socket.off('message');
      socket.off('guessResult');
      socket.off('partnerDisconnected');
      socket.off('timeUp');
    };
  }, []);

  return (
    <div className="App">
      <h1>Guess if your partner is Human or AI</h1>
      {!partnerId && <p>Looking for a partner...</p>}
      {partnerId && !isVideoChatUnlocked && <Chat socket={socket} sessionId={sessionId} messages={messages} />}
      {partnerId && !isVideoChatUnlocked && <Guess socket={socket} sessionId={sessionId} partnerId={partnerId} />}
      {isVideoChatUnlocked && <VideoChat />}
    </div>
  );
}

export default App;
