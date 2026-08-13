const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Credentials are on because the session travels in a cookie, and that forbids
// a wildcard origin — the list has to be explicit.
const cors = {
  origin: (origin, callback) => {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
};

module.exports = { cors, origins };
