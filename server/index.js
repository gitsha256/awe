const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sessions = new Map();
const waiting = [];
const activeChats = new Set();

// Define User schema and model
const userSchema = new mongoose.Schema({
  sessionId: String,
  score: Number,
  badges: [String],
  guesses: [{ partnerId: String, guess: Boolean, correct: Boolean }],
});
const User = mongoose.model('User', userSchema);

// API routes
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

// Socket.IO connections
io.on('connection', (socket) => {
  console.log('Socket.IO client connected:', socket.id);

  socket.on('join', (sessionId) => {
    console.log('Join event received for sessionId:', sessionId);
    sessions.set(sessionId, socket);
    socket.sessionId = sessionId;

    User.findOne({ sessionId }).then((user) => {
      if (!user) {
        new User({ sessionId, score: 0, badges: [], guesses: [] }).save();
      }
    });

    if (waiting.length > 0) {
      const partnerId = waiting.pop();
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket) {
        console.log('Matching', sessionId, 'with', partnerId);
        socket.emit('matched', { partnerId, isHuman: true });
        partnerSocket.emit('matched', { partnerId: sessionId, isHuman: true });
        activeChats.add(sessionId);
        activeChats.add(partnerId);
      } else {
        console.log('No valid partner, adding to waiting:', sessionId);
        waiting.push(sessionId);
      }
    } else {
      console.log('Adding to waiting:', sessionId);
      waiting.push(sessionId);
    }
  });

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
        console.error('OpenAI error:', err.message, err.stack);
        socket.emit('message', { sender: 'AI', text: 'Sorry, I had an error processing that.' });
      }
    } else {
      const partnerSocket = sessions.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('message', { sender: sessionId, text });
      }
    }
  });

  socket.on('guess', async ({ sessionId, partnerId, guess }) => {
    console.log('Guess received:', { sessionId, partnerId, guess });
    const correct = (partnerId !== 'AI') === guess;
    const user = await User.findOne({ sessionId });
    if (user) {
      user.guesses.push({ partnerId, guess, correct });
      if (correct) {
        user.score += 1;
        if (user.guesses.filter((g) => !g.guess && g.correct).length >= 5 && !user.badges.includes('AI Hunter')) {
          user.badges.push('AI Hunter');
        }
      }
      await user.save();
      socket.emit('guessResult', { correct, isHuman: partnerId !== 'AI' });
    }
    activeChats.delete(sessionId);
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO client disconnected:', socket.id);
    sessions.delete(socket.sessionId);
    activeChats.delete(socket.sessionId);
    const index = waiting.indexOf(socket.sessionId);
    if (index !== -1) waiting.splice(index, 1);
  });
});

// Timer to auto end chats
setInterval(() => {
  activeChats.forEach((sessionId) => {
    const socket = sessions.get(sessionId);
    if (socket) {
      console.log('Emitting timeUp for sessionId:', sessionId);
      socket.emit('timeUp');
      activeChats.delete(sessionId);
    }
  });
}, 30000);

// Connect to MongoDB and then start server
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true })
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit the app if MongoDB connection fails
  });
