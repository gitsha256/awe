const io = require('socket.io-client');
const socket = io('http://localhost:4000', { transports: ['polling'] });
const sessionId = `test-user-${Math.random().toString(36).substr(2, 9)}`;

socket.on('connect', () => {
  console.log(`Test client connected: ${sessionId}`);
  socket.emit('join', sessionId);
});

socket.on('matched', ({ partnerId, isHuman }) => {
  console.log(`Test client ${sessionId} matched with ${partnerId} (isHuman: ${isHuman})`);
});

socket.on('message', ({ sender, text }) => {
  console.log(`Test client ${sessionId} received from ${sender}: ${text}`);
  socket.emit('message', { sender: sessionId, text: `Echo from ${sessionId}` });
});