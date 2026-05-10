const express = require('express');
const crypto  = require('crypto');
const app     = express();

app.use(express.json());

// ─── CORS: allow your GitHub Pages / any frontend to call this API ───────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── ENVIRONMENT VARIABLES (set these in Vercel dashboard) ───────────────────
// LUMA_KEYS   = comma-separated list of valid access keys  e.g. "luma26,sesathr,key3"
// ADMIN_TOKEN = a secret string only YOU know, used to manage keys via API
// TOKEN_SECRET= random string used to sign session tokens
const ADMIN_TOKEN   = process.env.ADMIN_TOKEN   || 'change-me-in-vercel';
const TOKEN_SECRET  = process.env.TOKEN_SECRET  || 'lumastream-secret-2026';

// ─── KEYS STORE ───────────────────────────────────────────────────────────────
// In production, keys live in the LUMA_KEYS env var (set in Vercel).
// Format: "key1,key2,key3"   — just a comma-separated list.
function getKeys() {
  const raw = process.env.LUMA_KEYS || 'luma26,sesathr';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────
// Simple HMAC-based session token: base64(payload).signature
// No database needed — the token itself is self-verifying.
function makeToken(key) {
  const payload = Buffer.from(JSON.stringify({
    key,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000  // 7 days
  })).toString('base64url');

  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payload)
      .digest('base64url');
    if (sig !== expected) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > data.exp) return null;   // expired
    if (!getKeys().includes(data.key)) return null;  // key revoked
    return data;
  } catch(e) { return null; }
}

// ─── MIDDLEWARE: verify session token ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const data  = verifyToken(token);
  if (!data) return res.status(401).json({ error: 'Unauthorized' });
  req.tokenData = data;
  next();
}

// ─── MIDDLEWARE: verify admin token ───────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/health  — basic ping
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/login
// Body: { key: "luma26" }
// Returns: { token: "..." } on success
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'No key provided' });

  const keys = getKeys();
  if (!keys.includes(key.trim())) {
    // Short delay to slow brute-force attempts
    return setTimeout(() => {
      res.status(401).json({ error: 'Invalid Luma Key' });
    }, 500);
  }

  const token = makeToken(key.trim());
  res.json({ token, expiresIn: '7 days' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verify
// Header: Authorization: Bearer <token>
// Returns: { valid: true, key: "...", exp: ... }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/verify', requireAuth, (req, res) => {
  res.json({ valid: true, key: req.tokenData.key, exp: req.tokenData.exp });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES — require the ADMIN_TOKEN header
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/keys — list all current keys
app.get('/api/admin/keys', requireAdmin, (req, res) => {
  res.json({ keys: getKeys() });
});

// POST /api/admin/keys — add a new key
// Body: { key: "newkey123" }
// NOTE: Because keys live in env vars, this returns instructions.
//       To truly add a key, update LUMA_KEYS in Vercel and redeploy.
app.post('/api/admin/keys', requireAdmin, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'No key provided' });

  const current = getKeys();
  if (current.includes(key)) {
    return res.status(409).json({ error: 'Key already exists' });
  }

  const newList = [...current, key].join(',');
  res.json({
    message: `Key "${key}" added to list. Update your LUMA_KEYS env var in Vercel to: ${newList}`,
    newKeys: [...current, key],
    envVar: newList
  });
});

// DELETE /api/admin/keys/:key — remove a key
app.delete('/api/admin/keys/:key', requireAdmin, (req, res) => {
  const key     = req.params.key;
  const current = getKeys();
  const newList = current.filter(k => k !== key);

  if (newList.length === current.length) {
    return res.status(404).json({ error: 'Key not found' });
  }

  res.json({
    message: `Key "${key}" removed. Update LUMA_KEYS in Vercel to: ${newList.join(',')}`,
    newKeys: newList,
    envVar:  newList.join(',')
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Catch-all 404
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
