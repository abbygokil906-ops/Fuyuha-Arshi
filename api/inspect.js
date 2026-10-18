const { fetchPage } = require('../lib/fetcher');
const { summarize } = require('../lib/summarize');

export default async function handler(req, res) {
  // Set header keamanan & CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Parameter url wajib diisi' });
  }

  try {
    const page = await fetchPage(target);
    const data = summarize(page);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
