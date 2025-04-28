const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);

// Define allowed origins based on environment
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://awe-sand.vercel.app']
  : ['http://localhost:3000', 'https://awe-sand.vercel.app'];

// CORS configuration for Express
app.use(cors({
  origin: (origin, callback) => {
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Handle preflight requests explicitly
app.options('*', cors());

// Socket.IO CORS configuration
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`Socket.IO CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});

// PeerJS server setup (temporarily disabled for testing)
// const peerServer = ExpressPeerServer(server, {
//   debug: true,
//   path: '/peerjs',
// });
// app.use('/peerjs', peerServer);

app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Server running', uptime: process.uptime() });
});

// Debug route for waiting users
app.get('/debug/waiting', (req, res) => {
  res.json({ waiting: waiting.length, sessionIds: waiting });
});

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

// Route to get badges of a user by sessionId
app.get('/badges/:sessionId', async (req, res) => {
  try {
    const user = await User.findOne({ sessionId: req.params.sessionId });
    res.json({ badges: user ? user.badges : [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Route to get leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find().sort({ score: -1 }).limit(10);
    res.json(users.map((u, i) => ({ rank: i + 1, player: u.sessionId.slice(0, 8), score: u.score })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Session management
const sessions = new Map();
const waiting = [];
const activeChats = new Set();
const partners = new Map();

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}, Handshake:`, socket.handshake);

  socket.on('error', (err) => {
    console.error(`Socket error for ${socket.id}:`, err.message);
  });

  socket.on('connect_error', (err) => {
    console.error(`Socket connect error for ${socket.id}:`, err.message);
  });

  // User joins the server
  socket.on('join', (sessionId) => {
    console.log(`User ${sessionId} joined, socket: ${socket.id}`);
    // Prevent overwriting existing session
    if (sessions.has(sessionId)) {
      console.log(`Session ${sessionId} already exists, updating socket`);
      const oldSocket = sessions.get(sessionId);
      oldSocket.disconnect(); // Disconnect old socket
    }
    sessions.set(sessionId, socket);
    socket.sessionId = sessionId;

    // Create a new user in the database if doesn't exist
    User.findOne({ sessionId }).then((user) => {
      if (!user) {
        new User({ sessionId, score: 0, badges: [], guesses: [] }).save();
        console.log(`Created new user: ${sessionId}`);
      }
    });

    // Clean up disconnected users from waiting
    for (let i = waiting.length - 1; i >= 0; i--) {
      const waitingId = waiting[i];
      if (!sessions.get(waitingId) || !sessions.get(waitingId).connected) {
        waiting.splice(i, 1);
        console.log(`Removed disconnected user ${waitingId} from waiting`);
      }
    }

    // Check if user is already in waiting or activeChats to prevent duplicates
    if (waiting.includes(sessionId) || activeChats.has(sessionId)) {
      console.log(`User ${sessionId} already in waiting or active chat, ignoring join`);
      return;
    }

    // If there's a match in the waiting queue, pair them
    if (waiting.length > 0) {
      const partnerId = waiting.pop();
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        console.log(`Matched ${sessionId} with human ${partnerId}`);
        socket.emit('matched', { partnerId, isHuman: true });
        partnerSocket.emit('matched', { partnerId: sessionId, isHuman: true });
        activeChats.add(sessionId);
        activeChats.add(partnerId);
        partners.set(sessionId, partnerId);
        partners.set(partnerId, sessionId);
        console.log(`Partner mapping: ${sessionId} <-> ${partnerId}`);
        console.log(`Sessions map: ${[...sessions.keys()]}`);
      } else {
        console.log(`Partner ${partnerId} disconnected, adding ${sessionId} to waiting`);
        waiting.push(sessionId);
      }
    } else {
      console.log(`No waiting users, adding ${sessionId} to waiting`);
      waiting.push(sessionId);
    }

    // If no match after 10 seconds, match with AI
    setTimeout(() => {
      if (waiting.includes(sessionId) && sessions.get(sessionId) && sessions.get(sessionId).connected) {
        waiting.splice(waiting.indexOf(sessionId), 1);
        console.log(`No human match for ${sessionId}, matching with AI`);
        socket.emit('matched', { partnerId: 'AI', isHuman: false });
        activeChats.add(sessionId);
        partners.set(sessionId, 'AI');
        console.log(`Partner mapping: ${sessionId} -> AI`);
      }
    }, 300000);
  });

  // Message handling
  socket.on('message', async ({ sessionId, text }) => {
    const socket = sessions.get(sessionId);
    if (!socket) {
      console.error(`No socket found for sessionId: ${sessionId}`);
      return;
    }
    const partnerId = partners.get(sessionId);
    if (!partnerId) {
      console.error(`No partner found for ${sessionId}`);
      socket.emit('message', { sender: 'System', text: 'No partner assigned. Please rejoin.' });
      return;
    }
    console.log(`Message from ${sessionId} to ${partnerId}: ${text}`);
    console.log(`Current sessions: ${[...sessions.keys()]}, partners: ${[...partners.entries()]}`);
    if (partnerId === 'AI') {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: text }],
        });
        socket.emit('message', { sender: 'AI', text: response.choices[0].message.content });
        console.log(`AI response to ${sessionId}: ${response.choices[0].message.content}`);
      } catch (err) {
        socket.emit('message', { sender: 'AI', text: 'Sorry, I had an error processing that.' });
        console.error(`AI error for ${sessionId}:`, err.message);
      }
    } else {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket) {
        if (partnerSocket.connected) {
          socket.emit('message', { sender: sessionId, text }); // Send to self
          partnerSocket.emit('message', { sender: sessionId, text }); // Send to partner
          console.log(`Message sent from ${sessionId} to ${partnerId} (socket: ${partnerSocket.id})`);
        } else {
          console.error(`Partner ${partnerId} socket not connected (socket: ${partnerSocket.id})`);
          socket.emit('partnerDisconnected');
          partners.delete(sessionId);
          partners.delete(partnerId);
        }
      } else {
        console.error(`No socket found for partner ${partnerId}`);
        socket.emit('partnerDisconnected');
        partners.delete(sessionId);
        partners.delete(partnerId);
      }
    }
  });

  // Guess handling
  socket.on('guess', async ({ sessionId, partnerId, guess }) => {
    const correct = partnerId !== 'AI' === guess;
    const user = await User.findOne({ sessionId });
    user.guesses.push({ partnerId, guess, correct });
    if (correct) {
      user.score += 1;
    }
    await user.save();
    socket.emit('guessResult', { correct, isHuman: partnerId !== 'AI' });
    activeChats.delete(sessionId);
    partners.delete(sessionId);
    partners.delete(partnerId);
    console.log(`Guess by ${sessionId} for ${partnerId}: ${guess}, Correct: ${correct}`);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}, sessionId: ${socket.sessionId}`);
    const sessionId = socket.sessionId;
    const partnerId = partners.get(sessionId);
    if (partnerId && partnerId !== 'AI') {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('partnerDisconnected');
        console.log(`Notified ${partnerId} of ${sessionId} disconnection`);
      }
    }
    sessions.delete(sessionId);
    activeChats.delete(sessionId);
    partners.delete(sessionId);
    partners.delete(partnerId);
    const index = waiting.indexOf(sessionId);
    if (index !== -1) {
      waiting.splice(index, 1);
      console.log(`Removed ${sessionId} from waiting on disconnect`);
    }
  });
});

// Time-out handling every 2 minutes for active chats
setInterval(() => {
  activeChats.forEach((sessionId) => {
    const socket = sessions.get(sessionId);
    if (socket && socket.connected) {
      socket.emit('timeUp');
      activeChats.delete(sessionId);
      partners.delete(sessionId);
      partners.delete(partners.get(sessionId));
      console.log(`Time up for ${sessionId}, sent timeUp event`);
    }
  });
}, 120000);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
