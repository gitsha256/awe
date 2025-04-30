// config.js
const environment = process.env.NODE_ENV || 'development';

const config = {
  development: {
    server: {
      url: process.env.SERVER_URL || 'http://localhost:4000',
      wsUrl: process.env.SERVER_WS_URL || 'ws://localhost:4000',
      port: process.env.SERVER_PORT || 4000,
    },
    client: {
      url: process.env.CLIENT_URL || 'http://localhost:3000',
    },
    cors: {
      origins: [process.env.CLIENT_URL || 'http://localhost:3000'],
    },
  },
  testing: {
    server: {
      url: process.env.SERVER_URL || 'http://localhost:5000',
      wsUrl: process.env.SERVER_WS_URL || 'ws://localhost:5000',
      port: process.env.SERVER_PORT || 5000,
    },
    client: {
      url: process.env.CLIENT_URL || 'http://localhost:3001',
    },
    cors: {
      origins: [process.env.CLIENT_URL || 'http://localhost:3001'],
    },
  },
  production: {
    server: {
      url: process.env.SERVER_URL || 'https://awe-qztc.onrender.com',
      wsUrl: process.env.SERVER_WS_URL || 'https://awe-qztc.onrender.com',
      port: process.env.SERVER_PORT || 443,
    },
    client: {
      url: process.env.CLIENT_URL || 'https://awe-sand.vercel.app',
    },
    cors: {
      origins: [process.env.CLIENT_URL || 'https://awe-sand.vercel.app'],
    },
  },
};

// Export the config for the current environment
module.exports = config[environment];