const { env, redis, verifyPassword, signSession, setSessionCookie, requireJson, clientIp, SESSION_SECONDS } = require('../lib/auth');

const MAX_FAILS = 5;
const WINDOW_SECONDS = 15 * 60;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });
  if (!requireJson(req, res)) return;

  try {
    const ip = clientIp(req);
    const rlKey = 'rl:login:' + ip;

    // Batasi percobaan gagal per IP
    const fails = Number(await redis('GET', rlKey)) || 0;
    if (fails >= MAX_FAILS) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }

    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const userOk = username.length > 0 && username === env('ADMIN_USER');
    const passOk = verifyPassword(password, env('ADMIN_PASS_HASH'));

    if (!(userOk && passOk)) {
      const n = await redis('INCR', rlKey);
      if (n === 1) await redis('EXPIRE', rlKey, WINDOW_SECONDS);
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    await redis('DEL', rlKey);
    const { token, jti } = signSession(username);
    // Simpan ID sesi di server, supaya logout benar-benar mencabut akses
    await redis('SET', 'session:' + jti, '1', 'EX', SESSION_SECONDS);
    setSessionCookie(res, token, SESSION_SECONDS);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
