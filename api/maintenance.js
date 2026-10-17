const { redis, requireAdmin, requireJson } = require('../lib/auth');

const KEY = 'maintenance:state';
const DEFAULT_MESSAGE = 'Sedang maintenance. Silakan coba lagi nanti.';

async function readState() {
  const raw = await redis('GET', KEY);
  if (!raw) return { enabled: false, message: DEFAULT_MESSAGE, updatedAt: null };
  try { return JSON.parse(raw); } catch (e) { return { enabled: false, message: DEFAULT_MESSAGE, updatedAt: null }; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // GET publik: dipakai halaman tools untuk cek mode maintenance
    if (req.method === 'GET') {
      return res.status(200).json(await readState());
    }

    // POST: hanya admin
    if (req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      if (!requireJson(req, res)) return;
      const body = req.body || {};
      const state = {
        enabled: body.enabled === true,
        message: (typeof body.message === 'string' && body.message.trim()
          ? body.message.trim().slice(0, 300) : DEFAULT_MESSAGE),
        updatedAt: new Date().toISOString(),
      };
      await redis('SET', KEY, JSON.stringify(state));
      return res.status(200).json(state);
    }

    return res.status(405).json({ error: 'Method tidak diizinkan' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
