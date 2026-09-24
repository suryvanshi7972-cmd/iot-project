require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDB, db } = require('./db');
const { router: authRouter } = require('./auth');
const apiRouter = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for cross-origin requests (useful for local development or remote ESP8266)
app.use(cors({
  origin: true,
  credentials: true
}));

// Middlewares for parsing request bodies & cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend assets from 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Health check endpoint (for Render / uptime monitors)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    project: 'TSS Group 4 IoT Platform',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Fallback to index.html for dashboard navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error occurred',
    error: process.env.NODE_ENV === 'production' ? null : err.message
  });
});

// Start Server after DB initialization
initDB().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🚀 TSS Group 4 IoT Server is running!`);
    console.log(`📡 Local Address: http://localhost:${PORT}`);
    console.log(`🌐 Environment:   ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Timezone:      Asia/Kolkata (+5:30)`);
    console.log('====================================================');
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      db.close((err) => {
        if (err) console.error('Error closing SQLite DB:', err.message);
        else console.log('SQLite database connection closed.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Failed to start server due to database init error:', err);
  process.exit(1);
});
