import { useState, useEffect } from 'react';

function Chat({ socket, sessionId, messages }) {
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [isChatActive, setIsChatActive] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    socket.on('timeUp', () => {
      console.log('Received timeUp event');
      setIsChatActive(false);
      setTimeLeft(0);
    });

    return () => {
      clearInterval(timer);
      socket.off('timeUp');
    };
  }, [socket]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && isChatActive) {
      console.log(`Sending message from ${sessionId}: ${message}`);
      socket.emit('message', { sessionId, text: message });
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