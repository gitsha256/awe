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

// PeerJS Server
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Server running', uptime: process.uptime() });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  sessionId: String,
  score: Number,
  badges: [String],
  guesses: [{ partnerId: String, guess: Boolean, correct: Boolean }],
});
const User = mongoose.model('User', userSchema);

app.get('/badges/:sessionId', async (req, res) => {
  try {
    console.log('Fetching badges for sessionId:', req.params.sessionId);
    const user = await User.findOne({ sessionId: req.params.sessionId });
    res.json({ badges: user ? user.badges : [] });
  } catch (err) {
    console.error('Error fetching badges:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    console.log('Fetching leaderboard');
    const users = await User.find().sort({ score: -1 }).limit(10);
    res.json(users.map((u, i) => ({ rank: i + 1, player: u.sessionId.slice(0, 8), score: u.score })));
  } catch (err) {
    console.error('Error fetching leaderboard:', err.message, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

const sessions = new Map();
const waiting = [];
const activeChats = new Set();

io.on('connection', (socket) => {
  console.log('Socket.IO client connected:', socket.id);

  socket.on('join', (sessionId) => {
    console.log(`Join event received for sessionId: ${sessionId}, waiting list: ${waiting.length}`);
    sessions.set(sessionId, socket);
    socket.sessionId = sessionId;

    User.findOne({ sessionId }).then((user) => {
      if (!user) {
        new User({ sessionId, score: 0, badges: [], guesses: [] }).save();
        console.log(`Created new user for sessionId: ${sessionId}`);
      }
    });

    // Clean up waiting list (remove disconnected sockets)
    for (let i = waiting.length - 1; i >= 0; i--) {
      const waitingId = waiting[i];
      if (!sessions.get(waitingId) || !sessions.get(waitingId).connected) {
        console.log(`Removing disconnected sessionId from waiting: ${waitingId}`);
        waiting.splice(i, 1);
      }
    }

    // Match with another player or AI
    if (waiting.length > 0) {
      const partnerId = waiting.pop();
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        console.log(`Matching ${sessionId} with ${partnerId}`);
        socket.emit('matched', { partnerId, isHuman: true });
        partnerSocket.emit('matched', { partnerId: sessionId, isHuman: true });
        activeChats.add(sessionId);
        activeChats.add(partnerId);
      } else {
        console.log(`Partner ${partnerId} disconnected, adding ${sessionId} to waiting`);
        waiting.push(sessionId);
      }
    } else {
      console.log(`No partners available, adding ${sessionId} to waiting`);
      waiting.push(sessionId);
    }

    // Fallback: Match with AI after 10 seconds if still waiting
    setTimeout(() => {
      if (waiting.includes(sessionId) && sessions.get(sessionId)) {
        console.log(`No human match for ${sessionId}, matching with AI`);
        waiting.splice(waiting.indexOf(sessionId), 1);
        socket.emit('matched', { partnerId: 'AI', isHuman: false });
        activeChats.add(sessionId);
      }
    }, 10000);
  });

  socket.on('message', async ({ sessionId, text }) => {
    console.log(`Message from ${sessionId}: ${text}`);
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
        console.error('OpenAI error:', err.message, err.stack);
        socket.emit('message', { sender: 'AI', text: 'Sorry, I had an error processing that.' });
      }
    } else {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        partnerSocket.emit('message', { sender: sessionId, text });
      } else {
        console.log(`Partner ${partnerId} disconnected, notifying ${sessionId}`);
        socket.emit('partnerDisconnected');
      }
    }
  });

  socket.on('guess', async ({ sessionId, partnerId, guess }) => {
    console.log(`Guess received: ${sessionId} guessed ${guess} for ${partnerId}`);
    const correct = partnerId !== 'AI' === guess;
    const user = await User.findOne({ sessionId });
    user.guesses.push({ partnerId, guess, correct });
    if (correct) {
      user.score += 1;
      if (user.guesses.filter((g) => !g.guess && g.correct).length >= 5) {
        user.badges.push('AI Hunter');
      }
    }
    await user.save();
    socket.emit('guessResult', { correct, isHuman: partnerId !== 'AI' });
    activeChats.delete(sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`Socket.IO client disconnected: ${socket.id}, sessionId: ${socket.sessionId}`);
    sessions.delete(socket.sessionId);
    activeChats.delete(socket.sessionId);
    const index = waiting.indexOf(socket.sessionId);
    if (index !== -1) {
      console.log(`Removing ${socket.sessionId} from waiting list`);
      waiting.splice(index, 1);
    }
  });
});

setInterval(() => {
  activeChats.forEach((sessionId) => {
    const socket = sessions.get(sessionId);
    if (socket && socket.connected) {
      console.log(`Emitting timeUp for sessionId: ${sessionId}`);
      socket.emit('timeUp');
      activeChats.delete(sessionId);
    }
  });
}, 120000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));