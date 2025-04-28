import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const Home = () => {
  const [sessionId, setSessionId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [isHuman, setIsHuman] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [timeUp, setTimeUp] = useState(false);
  const [guessMade, setGuessMade] = useState(false);
  const [guessResult, setGuessResult] = useState(null);

  useEffect(() => {
    // Generate session ID
    const id = crypto.randomUUID();
    setSessionId(id);

    // Initialize socket connection
    const socket = io('https://awe-qztc.onrender.com', {
      transports: ['websocket'],
      withCredentials: true,
    });

    // Emit 'join' event when socket is ready
    socket.emit('join', id);

    // Handle 'matched' event from server
    socket.on('matched', ({ partnerId, isHuman }) => {
      setPartnerId(partnerId);
      setIsHuman(isHuman);
      setMessages([]);
      setTimeUp(false);
      setGuessMade(false);
      setGuessResult(null);
    });

    // Handle incoming messages
    socket.on('message', ({ sender, text }) => {
      setMessages((prev) => [...prev, { sender, text }]);
    });

    // Handle 'timeUp' event
    socket.on('timeUp', () => {
      setTimeUp(true);
    });

    // Handle 'guessResult' event
    socket.on('guessResult', ({ correct, isHuman }) => {
      setGuessResult({ correct, isHuman });
    });

    // Handle partner disconnection
    socket.on('partnerDisconnected', () => {
      alert('Partner disconnected. Finding new partner...');
      window.location.reload(); // simple reload to rejoin
    });

    // Cleanup on component unmount
    return () => {
      socket.disconnect();
    };
  }, []); // Empty dependency array means this effect runs once when the component mounts

  const sendMessage = () => {
    if (messageInput.trim() && partnerId) {
      socket.emit('message', { sessionId, text: messageInput });
      setMessages((prev) => [...prev, { sender: 'You', text: messageInput }]);
      setMessageInput('');
    }
  };

  const makeGuess = (guess) => {
    if (!guessMade) {
      socket.emit('guess', { sessionId, partnerId, guess });
      setGuessMade(true);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Chat Game</h1>

      <div style={{ marginBottom: '10px' }}>
        <strong>Session ID:</strong> {sessionId.slice(0, 8)}
      </div>

      <div style={{ marginBottom: '10px' }}>
        {partnerId ? (
          <div>
            <p><strong>Partner ID:</strong> {partnerId === 'AI' ? '🤖 AI' : partnerId.slice(0, 8)}</p>
            <p>{isHuman ? 'You are chatting with a human 🧑‍🤝‍🧑' : 'You are chatting with an AI 🤖'}</p>
          </div>
        ) : (
          <p>Looking for a partner...</p>
        )}
      </div>

      <div style={{ border: '1px solid #ccc', padding: '10px', height: '300px', overflowY: 'scroll', marginBottom: '10px' }}>
        {messages.map((m, idx) => (
          <div key={idx}><strong>{m.sender}:</strong> {m.text}</div>
        ))}
      </div>

      {!timeUp && partnerId && (
        <>
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            style={{ width: '80%' }}
          />
          <button onClick={sendMessage} style={{ marginLeft: '10px' }}>Send</button>
        </>
      )}

      {timeUp && !guessMade && (
        <div style={{ marginTop: '20px' }}>
          <h3>Time's up! Make your guess:</h3>
          <button onClick={() => makeGuess(true)}>I think it was a Human 🧑‍🤝‍🧑</button>
          <button onClick={() => makeGuess(false)} style={{ marginLeft: '10px' }}>I think it was an AI 🤖</button>
        </div>
      )}

      {guessResult && (
        <div style={{ marginTop: '20px' }}>
          <h3>{guessResult.correct ? '✅ Correct!' : '❌ Wrong!'}</h3>
          <p>Your partner was {guessResult.isHuman ? 'a Human 🧑‍🤝‍🧑' : 'an AI 🤖'}.</p>
          <button onClick={() => window.location.reload()}>Start New Chat</button>
        </div>
      )}
    </div>
  );
};

export default Home;
