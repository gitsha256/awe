const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://awe-sand.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
});
app.use('/peerjs', peerServer);

app.use(cors({
  origin: ['https://awe-sand.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
}));
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

// Socket.IO connection
io.on('connection', (socket) => {
  // User joins the server
  socket.on('join', (sessionId) => {
    sessions.set(sessionId, socket);
    socket.sessionId = sessionId;

    // Create a new user in the database if doesn't exist
    User.findOne({ sessionId }).then((user) => {
      if (!user) {
        new User({ sessionId, score: 0, badges: [], guesses: [] }).save();
      }
    });

    // Clean up disconnected users from waiting
    for (let i = waiting.length - 1; i >= 0; i--) {
      const waitingId = waiting[i];
      if (!sessions.get(waitingId) || !sessions.get(waitingId).connected) {
        waiting.splice(i, 1);
      }
    }

    // If there's a match in the waiting queue, match them
    if (waiting.length > 0) {
      const partnerId = waiting.pop();
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        socket.emit('matched', { partnerId, isHuman: true });
        partnerSocket.emit('matched', { partnerId: sessionId, isHuman: true });
        activeChats.add(sessionId);
        activeChats.add(partnerId);
      } else {
        waiting.push(sessionId);
      }
    } else {
      waiting.push(sessionId);
    }

    // If no match after 10 seconds, match with AI
    setTimeout(() => {
      if (waiting.includes(sessionId) && sessions.get(sessionId)) {
        waiting.splice(waiting.indexOf(sessionId), 1);
        socket.emit('matched', { partnerId: 'AI', isHuman: false });
        activeChats.add(sessionId);
      }
    }, 10000);
  });

  // Message handling
  socket.on('message', async ({ sessionId, text }) => {
    const socket = sessions.get(sessionId);
    const partnerId = [...sessions].find(([k, v]) => v === socket)?.[0] || 'AI';
    if (partnerId === 'AI') {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: text }],
        });
        socket.emit('message', { sender: 'AI', text: response.choices[0].message.content });
      } catch (err) {
        socket.emit('message', { sender: 'AI', text: 'Sorry, I had an error processing that.' });
      }
    } else {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('message', { sender: sessionId, text });
      } else {
        socket.emit('partnerDisconnected');
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
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    sessions.delete(socket.sessionId);
    activeChats.delete(socket.sessionId);
    const index = waiting.indexOf(socket.sessionId);
    if (index !== -1) {
      waiting.splice(index, 1);
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
    }
  });
}, 120000);

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
