import { useState, useEffect } from 'react';

function Chat({ socket, sessionId, messages, setMessages }) {
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [isChatActive, setIsChatActive] = useState(true);

  useEffect(() => {
    // Sync timer with server
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 && isChatActive ? prev - 1 : 0));
    }, 1000);

    // Handle incoming messages
    const handleMessage = ({ sender, text }) => {
      console.log(`Received message from ${sender}: ${text}`);
      setMessages((prev) => [...prev, { sender, text }]);
    };

    // Handle timeUp event
    const handleTimeUp = () => {
      console.log('Received timeUp event in Chat');
      setIsChatActive(false);
      setTimeLeft(0);
      setMessages((prev) => [...prev, { sender: 'System', text: 'Time is up!' }]);
    };

    // Handle partner disconnection
    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected in Chat');
      setIsChatActive(false);
      setMessages((prev) => [...prev, { sender: 'System', text: 'Partner disconnected.' }]);
    };

    // Handle errors
    const handleError = (err) => {
      console.error('Chat error:', err.message);
      setMessages((prev) => [...prev, { sender: 'System', text: `Error: ${err.message}` }]);
    };

    // Register socket event listeners
    socket.on('message', handleMessage);
    socket.on('timeUp', handleTimeUp);
    socket.on('partnerDisconnected', handlePartnerDisconnected);
    socket.on('error', handleError);

    return () => {
      clearInterval(timer);
      socket.off('message', handleMessage);
      socket.off('timeUp', handleTimeUp);
      socket.off('partnerDisconnected', handlePartnerDisconnected);
      socket.off('error', handleError);
      console.log('Chat cleanup, sessionId:', sessionId);
    };
  }, [socket, sessionId, setMessages, isChatActive]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && isChatActive) {
      console.log(`Sending message from ${sessionId}: ${message}`);
      socket.emit('message', { sender: sessionId, text: message });
      setMessages((prev) => [...prev, { sender: sessionId, text: message }]);
      setMessage('');
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-4 rounded shadow">
      <h2 className="text-xl mb-4">Chat ({timeLeft}s)</h2>
      <div className="h-64 overflow-y-auto mb-4 border p-2">
        {messages.map((msg, i) => (
          <p key={i} className={msg.sender === sessionId ? 'text-right' : ''}>
            <strong>{msg.sender === sessionId ? 'You' : msg.sender}:</strong> {msg.text}
          </p>
        ))}
      </div>
      <form onSubmit={sendMessage} className="flex">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 border p-2 rounded-l"
          placeholder="Type a message..."
          disabled={!isChatActive}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white p-2 rounded-r"
          disabled={!isChatActive}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default Chat;