// Helper bersama: sesi bertanda tangan HMAC, hash password scrypt, Redis REST (Upstash), dan utilitas request.
const crypto = require('crypto');

const COOKIE = 'fa_admin';
const SESSION_SECONDS = 8 * 60 * 60; // sesi 8 jam

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error('Environment variable ' + name + ' belum diisi di Vercel');
  return v;
}

// Upstash REST: kirim perintah sebagai array JSON
async function redis(...cmd) {
  const res = await fetch(env('UPSTASH_REDIS_REST_URL'), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env('UPSTASH_REDIS_REST_TOKEN'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error('Redis: ' + data.error);
  return data.result;
}

// ---------- Password (scrypt) ----------
// Format tersimpan: scrypt$<saltHex>$<hashHex>
function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- Sesi (token HMAC) ----------
function signSession(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const payload = { user, jti, exp: Date.now() + SESSION_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env('SESSION_SECRET')).update(body).digest('base64url');
  return { token: body + '.' + sig, jti };
}

function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', env('SESSION_SECRET')).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function setSessionCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}

// Pastikan request membawa sesi admin yang valid. Mengembalikan null dan mengirim 401 jika tidak.
async function requireAdmin(req, res) {
  let session = null;
  try {
    session = verifySession(getCookie(req, COOKIE));
    if (session) {
      const active = await redis('GET', 'session:' + session.jti);
      if (!active) session = null; // sudah logout atau kedaluwarsa di server
    }
  } catch (e) { session = null; }
  if (!session) {
    res.status(401).json({ error: 'Belum login' });
    return null;
  }
  return session;
}

// Tolak request non-JSON. Ini juga menghalangi form lintas-situs (CSRF) karena form biasa tidak bisa kirim JSON.
function requireJson(req, res) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('application/json')) {
    res.status(415).json({ error: 'Gunakan Content-Type application/json' });
    return false;
  }
  return true;
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = {
  COOKIE, SESSION_SECONDS, env, redis, verifyPassword,
  signSession, verifySession, getCookie, setSessionCookie, requireAdmin, requireJson, clientIp,
};
