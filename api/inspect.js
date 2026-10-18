const { isSafeUrl } = require('../lib/safety');
const { safeFetch } = require('../lib/fetcher');
const { extractSecretsAndSummary } = require('../lib/summarize');

module.exports = async (req, res) => {
  // Set CORS Header biar frontend bisa ngobrol lancar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url || (req.body && req.body.url);

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL target tidak boleh kosong.' });
  }

  try {
    // Validasi SSRF
    const safeCheck = await isSafeUrl(targetUrl);
    if (!safeCheck.safe) {
      return res.status(400).json({ error: `URL ditolak (SSRF Protection): ${safeCheck.reason}` });
    }

    // Fetch Konten Target
    const fetchResult = await safeFetch(targetUrl);
    if (!fetchResult.ok) {
      return res.status(502).json({ error: `Gagal mengambil URL target (Status: ${fetchResult.status})` });
    }

    // Extraction / Parsing Cheerio
    const summary = await extractSecretsAndSummary(fetchResult.html, fetchResult.finalUrl);

    return res.status(200).json({
      success: true,
      url: fetchResult.finalUrl,
      status: fetchResult.status,
      ...summary
    });
  } catch (err) {
    console.error('Inspector Backend Error:', err);
    return res.status(500).json({ 
      error: 'Internal Server Error pada Backend Inspector',
      details: err.message 
    });
  }
};
