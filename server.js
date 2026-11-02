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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 👇 ADD THIS: Fetch Companies for the dropdown
app.get('/api/companies', (req, res) => {
  // Returning a dummy company so your frontend dropdown loads
  res.json([
    { id: 1, name: "My Test Company" }
  ]);
});

// 👇 ADD THIS: Mock Login Route (so you can get past the login screen)
app.post('/api/auth/login', (req, res) => {
  const { username, password, role } = req.body;
  
  // Accept ANY username/password for now so you can test the app
  res.json({
    success: true,
    token: "fake-jwt-token-12345",
    user: {
      id: 1,
      username: username || "owner",
      role: role || "owner",
      companyId: 1,
      companyName: "My Test Company"
    }
  });
});

// ============================================================
// SERVE FRONTEND (FIXED PATH)
// ============================================================
const FRONTEND_PATH = path.join(__dirname, 'frontend');

app.use(express.static(FRONTEND_PATH));

// ============================================================
// CATCH-ALL ROUTE (MUST come after all API routes)
// ============================================================
app.get('*', (req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
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
