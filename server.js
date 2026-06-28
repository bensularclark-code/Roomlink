require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// SECURITY MIDDLEWARE
// =============================================
app.use(helmet({ contentSecurityPolicy: false })); // CSP off so frontend scripts work
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
  credentials: true
}));

// Rate limiting — prevents abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts. Wait 15 minutes.' }
});

// =============================================
// BODY PARSING
// =============================================
// Webhook needs raw body — must come before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================
// STATIC FILES (frontend)
// =============================================
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// API ROUTES
// =============================================
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/listings', apiLimiter, require('./routes/listings'));
app.use('/api/payments', apiLimiter, require('./routes/payments'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// =============================================
// SERVE FRONTEND for all non-API routes (SPA)
// =============================================
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// =============================================
// ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║         ROOMLINK SERVER LIVE         ║
  ╠══════════════════════════════════════╣
  ║  Local:   http://localhost:${PORT}       ║
  ║  API:     http://localhost:${PORT}/api   ║
  ║  Mode:    ${process.env.NODE_ENV || 'development'}                 ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
