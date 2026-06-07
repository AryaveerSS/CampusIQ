require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initCronJobs } = require('./config/cron');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — generous in dev, stricter in production.
// Skipped entirely for local development to avoid 429s during hot-reload.
const isProd = process.env.NODE_ENV === 'production';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProd,        // no limiting in development
  message: { error: 'Too many requests, please slow down and try again shortly.' },
});
app.use('/api/', limiter);

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/grades', require('./routes/grades'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/gmail', require('./routes/gmail'));
app.use('/api/email-buckets', require('./routes/emailBuckets'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/notifications', require('./routes/notifications'));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 CampusIQ backend running on port ${PORT}`);
  initCronJobs();  // start timetable-based notification scheduler
});
