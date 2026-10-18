const cheerio = require('cheerio');

function summarize({ finalUrl, status, headers = {}, body = '', truncated = false }) {
  const $ = cheerio.load(body);
  const pageHost = new URL(finalUrl).hostname;

  const abs = (value) => {
    if (!value) return null;
    try {
      return new URL(value, finalUrl).href;
    } catch {
      return null;
    }
  };

  const scripts = $('script[src]')
    .map((_, el) => abs($(el).attr('src')))
    .get()
    .filter(Boolean);

  const stylesheets = $('link[rel~="stylesheet"]')
    .map((_, el) => abs($(el).attr('href')))
    .get()
    .filter(Boolean);

  const forms = $('form')
    .map((_, el) => ({
      method: ($(el).attr('method') || 'GET').toUpperCase(),
      action: abs($(el).attr('action')) || finalUrl,
    }))
    .get();

  const meta = $('meta')
    .map((_, el) => {
      const name = $(el).attr('name') || $(el).attr('property') || $(el).attr('http-equiv');
      return name ? { name, content: $(el).attr('content') || '' } : null;
    })
    .get()
    .filter(Boolean);

  const externalHosts = [...new Set(
    [...scripts, ...stylesheets]
      .map((u) => new URL(u).hostname)
      .filter((h) => h !== pageHost)
  )];

  // --- FITUR TAMBAHAN: Ekstraksi Token, API Keys, & Endpoint Tersembunyi ---
  const fullText = body;
  
  // 1. Tangkap Firebase API Key / Google API Key
  const firebaseKeys = [...new Set(fullText.match(/AIzaSy[0-9A-Za-z-_]{33}/g) || [])];

  // 2. Tangkap potensi Token JWT / Bearer Token
  const jwtTokens = [...new Set(fullText.match(/eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g) || [])];

  // 3. Tangkap URL Endpoint API / Cloud Functions yang tertulis di dalam script/body
  const rawUrls = [...new Set(fullText.match(/https?:\/\/[^\s"'<>]+(?:\/api\/|\/v[0-9]\/|\.json|cloudfunctions\.net)[^\s"'<>]*/gi) || [])];

  // 4. Ekstraktor khusus parameter magic link / auth jika URL target mengandung parameter tersebut
  let magicLinkParams = null;
  try {
    const targetUrlObj = new URL(finalUrl);
    if (targetUrlObj.searchParams.has('link')) {
      const innerLink = targetUrlObj.searchParams.get('link');
      const innerObj = new URL(innerLink);
      magicLinkParams = {
        oobCode: innerObj.searchParams.get('oobCode'),
        continueUrl: innerObj.searchParams.get('continueUrl')
      };
    } else {
      magicLinkParams = {
        oobCode: targetUrlObj.searchParams.get('oobCode'),
        ui_sid: targetUrlObj.searchParams.get('ui_sid'),
        ui_sd: targetUrlObj.searchParams.get('ui_sd')
      };
    }
  } catch (e) {
    // Abaikan jika bukan format URL auth
  }

  return {
    url: finalUrl,
    status,
    title: $('title').first().text().trim(),
    meta,
    headers: {
      'content-type': headers['content-type'] || null,
      server: headers['server'] || null,
    },
    resources: { scripts, stylesheets, externalHosts },
    forms,
    extractedSecrets: {
      firebaseKeys,
      jwtTokens,
      apiEndpoints: rawUrls,
      magicLinkParams: (magicLinkParams && Object.values(magicLinkParams).some(Boolean)) ? magicLinkParams : null
    },
    truncated,
  };
}

module.exports = { summarize };
