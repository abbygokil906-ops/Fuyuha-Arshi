const { COOKIE, redis, getCookie, verifySession, setSessionCookie, requireJson } = require('../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });
  if (!requireJson(req, res)) return;
  try {
    const session = verifySession(getCookie(req, COOKIE));
    if (session && session.jti) await redis('DEL', 'session:' + session.jti); // cabut di server
  } catch (e) { /* tetap hapus cookie di browser */ }
  setSessionCookie(res, '', 0);
  return res.status(200).json({ ok: true });
};
