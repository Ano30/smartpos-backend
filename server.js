const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// API ROUTES
// ============================================================
// (Your existing API routes stay here — /api/...)
// Example:
// app.use('/api/products', require('./routes/products'));
// app.use('/api/sales', require('./routes/sales'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// SERVE FRONTEND (FIXED PATH)
// ============================================================
// 🔧 CHANGE THIS to match your actual frontend folder name.
// Common options: 'frontend', 'public', 'www', 'dist', 'build'
const FRONTEND_PATH = path.join(__dirname, 'frontend');

app.use(express.static(FRONTEND_PATH));

// ============================================================
// CATCH-ALL ROUTE (MUST come after all API routes)
// ============================================================
app.get('*', (req, res) => {
  // If the request is for an API route that doesn't exist, return JSON 404
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // Otherwise, send index.html (Single Page App fallback)
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📁 Serving frontend from: ${FRONTEND_PATH}`);
});
