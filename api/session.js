const { COOKIE, redis, getCookie, verifySession } = require('../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let authenticated = false;
  try {
    const session = verifySession(getCookie(req, COOKIE));
    if (session) authenticated = !!(await redis('GET', 'session:' + session.jti));
  } catch (e) { authenticated = false; }
  return res.status(200).json({ authenticated });
};
