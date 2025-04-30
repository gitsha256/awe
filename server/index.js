const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
require('dotenv').config();
const config = require('./config');

// Enable Socket.IO and PeerJS debugging
process.env.DEBUG = 'socket.io:*,peer:*,engine.io:*';

const app = express();
const server = require('http').createServer(app);

// CORS configuration for Express
app.use(cors({
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use((req, res, next) => {
  console.log(`CORS request: ${req.method} ${req.url}, Origin: ${req.headers.origin}`);
  next();
});
app.options('*', cors());

// Socket.IO CORS configuration
const io = new Server(server, {
  cors: {
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
});

// PeerJS server setup
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true,
});
app.use('/peerjs', (req, res, next) => {
  console.log(`PeerJS request: ${req.method} ${req.url}`);
  next();
}, peerServer);

app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Server running', uptime: process.uptime() });
});

// Debug routes
app.get('/debug/waiting', (req, res) => {
  res.json({ waiting: waiting.length, sessionIds: waiting });
});
app.get('/debug/state', (req, res) => {
  res.json({
    waiting,
    activeChats: [...activeChats],
    sessions: [...sessions.keys()],
    partners: [...partners.entries()],
    peerIds: [...peerIds.entries()],
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/awe-game')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// MongoDB user schema
const userSchema = new mongoose.Schema({
  sessionId: String,
  score: Number,
  badges: [String],
  guesses: [{ partnerId: String, guess: Boolean, correct: Boolean }],
});
const User = mongoose.model('User', userSchema);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Session management
const sessions = new Map();
const waiting = [];
const activeChats = new Set();
const partners = new Map();
const videoChatSessions = new Set();
const peerIds = new Map();

// Generate AI partner ID
const generateAIPartnerId = () => `AI-${Math.random().toString(36).substr(2, 9)}`;

// Handle AI responses
async function generateAIResponse(message) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a conversational AI pretending to be a human in a chat game. Respond naturally and casually.' },
        { role: 'user', content: message },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return 'Sorry, I had an issue processing that. Try again!';
  }
}

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}, Handshake:`, socket.handshake);

  // Clean up stale sessions
  const cleanupStaleSessions = () => {
    console.log('Cleaning up stale sessions');
    for (const [sessionId, storedSocket] of sessions.entries()) {
      if (!storedSocket.connected) {
        console.log(`Removing stale session: ${sessionId}`);
        sessions.delete(sessionId);
        activeChats.delete(sessionId);
        videoChatSessions.delete(sessionId);
        partners.delete(sessionId);
        peerIds.delete(sessionId);
        const index = waiting.indexOf(sessionId);
        if (index !== -1) {
          waiting.splice(index, 1);
        }
      }
    }
  };

  const joinTimeout = setTimeout(() => {
    if (!socket.sessionId) {
      console.warn(`No join event received for socket ${socket.id} after 15s`);
      socket.emit('error', { message: 'No join event received. Please refresh.' });
      socket.disconnect(true);
    }
  }, 15000);

  socket.on('error', (err) => {
    console.error(`Socket error for ${socket.id}:`, err.message, err.stack);
    clearTimeout(joinTimeout);
  });

  socket.on('connect_error', (err) => {
    console.error(`Socket connect error for ${socket.id}:`, err.message, err.stack);
    clearTimeout(joinTimeout);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id}, Reason: ${reason}, SessionId: ${socket.sessionId || 'undefined'}`);
    clearTimeout(joinTimeout);
    const sessionId = socket.sessionId;
    if (sessionId) {
      const partnerId = partners.get(sessionId);
      if (partnerId && partnerId !== 'AI') {
        const partnerSocket = sessions.get(partnerId);
        if (partnerSocket && partnerSocket.connected) {
          partnerSocket.emit('partnerDisconnected');
          console.log(`Notified ${partnerId} of ${sessionId} disconnection`);
          partners.delete(partnerId);
        }
      }
      sessions.delete(sessionId);
      activeChats.delete(sessionId);
      videoChatSessions.delete(sessionId);
      partners.delete(sessionId);
      peerIds.delete(sessionId);
      const index = waiting.indexOf(sessionId);
      if (index !== -1) {
        waiting.splice(index, 1);
        console.log(`Removed ${sessionId} from waiting on disconnect`);
      }
    }
  });

  socket.on('leave', (sessionId) => {
    console.log(`Leave requested: sessionId=${sessionId}`);
    const partnerId = partners.get(sessionId);
    if (partnerId && partnerId !== 'AI') {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('partnerDisconnected');
        console.log(`Notified ${partnerId} of ${sessionId} leave`);
        partners.delete(partnerId);
      }
    }
    sessions.delete(sessionId);
    activeChats.delete(sessionId);
    videoChatSessions.delete(sessionId);
    partners.delete(sessionId);
    peerIds.delete(sessionId);
    const index = waiting.indexOf(sessionId);
    if (index !== -1) {
      waiting.splice(index, 1);
      console.log(`Removed ${sessionId} from waiting on leave`);
    }
    socket.emit('left', { sessionId });
  });

  socket.on('join', async (sessionId) => {
    console.log(`Join requested: sessionId=${sessionId}, socket=${socket.id}`);
    clearTimeout(joinTimeout);
    cleanupStaleSessions();

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      console.error(`Invalid sessionId: ${sessionId}`);
      socket.emit('error', { message: 'Invalid session ID. Please refresh.' });
      socket.disconnect(true);
      return;
    }

    const existingSocket = sessions.get(sessionId);
    if (existingSocket && existingSocket.connected && existingSocket.id !== socket.id) {
      console.log(`Duplicate sessionId detected: ${sessionId}, notifying existing socket`);
      existingSocket.emit('error', { message: 'Session ID already in use. Generating new ID.' });
      existingSocket.disconnect(true);
      sessions.delete(sessionId);
    }

    sessions.set(sessionId, socket);
    socket.sessionId = sessionId;

    // Check if a human is waiting
    if (waiting.length > 0) {
      const partnerId = waiting.shift();
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        console.log(`Matched ${sessionId} with human ${partnerId}`);
        socket.emit('matched', { partnerId, isHuman: true });
        partnerSocket.emit('matched', { partnerId: sessionId, isHuman: true });
        activeChats.add(sessionId);
        activeChats.add(partnerId);
        partners.set(sessionId, partnerId);
        partners.set(partnerId, sessionId);
      } else {
        console.log(`Partner ${partnerId} disconnected, assigning AI to ${sessionId}`);
        const aiPartnerId = generateAIPartnerId();
        socket.emit('matched', { partnerId: aiPartnerId, isHuman: false });
        activeChats.add(sessionId);
        partners.set(sessionId, aiPartnerId);
      }
    } else {
      const shouldMatchWithAI = Math.random() < 0.5;
      console.log(`Matching decision for ${sessionId}: shouldMatchWithAI=${shouldMatchWithAI}, waiting=${waiting.length}`);
      if (shouldMatchWithAI) {
        console.log(`Assigning AI to ${sessionId}`);
        const aiPartnerId = generateAIPartnerId();
        socket.emit('matched', { partnerId: aiPartnerId, isHuman: false });
        activeChats.add(sessionId);
        partners.set(sessionId, aiPartnerId);
      } else {
        console.log(`No human partner available, adding ${sessionId} to waiting list`);
        waiting.push(sessionId);
      }
    }

    // Set 2-minute timer for timeUp
    setTimeout(() => {
      if (sessions.get(sessionId)) {
        socket.emit('timeUp');
        const partnerId = partners.get(sessionId);
        if (partnerId && partnerId !== 'AI') {
          const partnerSocket = sessions.get(partnerId);
          if (partnerSocket) partnerSocket.emit('timeUp');
        }
      }
    }, 120000); // 2 minutes
  });

  socket.on('message', async ({ sender, text }) => {
    console.log(`Message received from ${sender}: ${text}`);
    const partnerId = partners.get(sender);

    if (!partnerId) {
      console.error(`No partner found for sender: ${sender}`);
      socket.emit('error', { message: 'No partner assigned. Please refresh.' });
      return;
    }

    if (partnerId.startsWith('AI')) {
      const aiResponse = await generateAIResponse(text);
      socket.emit('message', { sender: partnerId, text: aiResponse });
      console.log(`AI response sent to ${sender}: ${aiResponse}`);
    } else {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('message', { sender, text });
        console.log(`Relayed message to ${partnerId}: ${text}`);
      } else {
        console.error(`Partner ${partnerId} not connected`);
        socket.emit('partnerDisconnected');
      }
    }
  });

  socket.on('peerId', ({ sessionId, peerId, partnerId }) => {
    console.log(`Received peerId from ${sessionId}: ${peerId} for partner ${partnerId}`);
    peerIds.set(sessionId, peerId);
    if (partnerId && !partnerId.startsWith('AI')) {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('receivePeerId', { peerId, fromSessionId: sessionId });
        console.log(`Sent peerId ${peerId} to partner ${partnerId}`);
      }
    }
  });

  socket.on('guess', async ({ sessionId, partnerId, guess }) => {
    console.log(`Guess received from ${sessionId}: partner=${partnerId}, guess=${guess ? 'human' : 'AI'}`);
    const currentPartnerId = partners.get(sessionId);
    if (!currentPartnerId || currentPartnerId !== partnerId) {
      console.error(`Invalid guess: sessionId=${sessionId}, partnerId=${partnerId}, currentPartnerId=${currentPartnerId}`);
      socket.emit.Print('error', { message: 'Invalid partner. Please refresh.' });
      return;
    }

    const isPartnerHuman = !partnerId.startsWith('AI');
    const isGuessCorrect = guess === isPartnerHuman;

    // Store guess in MongoDB
    try {
      await User.updateOne(
        { sessionId },
        { $push: { guesses: { partnerId, guess, correct: isGuessCorrect } } },
        { upsert: true }
      );
      console.log(`Stored guess for ${sessionId}: correct=${isGuessCorrect}`);
    } catch (err) {
      console.error('MongoDB error storing guess:', err);
    }

    // Notify the guessing client of the result
    socket.emit('guessResult', { partnerId, isCorrect: isGuessCorrect, isPartnerHuman });

    // If guess is correct and partner is human, unlock video chat
    if (isGuessCorrect && isPartnerHuman) {
      console.log(`Correct human guess by ${sessionId}, unlocking video chat with ${partnerId}`);
      socket.emit('unlockVideoChat', { partnerId });
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('unlockVideoChat', { partnerId: sessionId });
        console.log(`Notified ${partnerId} to unlock video chat`);
      }
    }
  });
});

// Start the server
server.listen(config.server.port, () => {
  console.log(`Server running on ${config.server.url}`);
});