const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns/promises');
const { isPrivateIP, parseHttpsUrl } = require('./safety');

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024; // 1 MB
const MAX_REDIRECTS = 3;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

async function resolvePublicIP(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) throw new Error('IP privat tidak diizinkan');
    return hostname;
  }
  const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addrs.length) throw new Error('Host tidak ditemukan');
  for (const { address } of addrs) {
    if (isPrivateIP(address)) throw new Error('Host mengarah ke IP privat');
  }
  return addrs[0].address;
}

function requestOnce(url, ip) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(val);
    };

    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'FuyuhaInspector/2.0',
          Accept: 'text/html,*/*;q=0.5',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, opts, cb) => {
          const family = net.isIP(ip);
          if (opts && opts.all) cb(null, [{ address: ip, family }]);
          else cb(null, ip, family);
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        let truncated = false;

        res.on('data', (chunk) => {
          if (truncated) return;
          const room = MAX_BYTES - size;
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room));
            size = MAX_BYTES;
            truncated = true;
            res.destroy();
            return;
          }
          size += chunk.length;
          chunks.push(chunk);
        });

        const finish = () =>
          done(null, {
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
          });

        res.on('end', finish);
        res.on('close', finish);
        res.on('error', (err) => (truncated ? finish() : done(err)));
      }
    );

    const timer = setTimeout(() => {
      req.destroy(new Error('Timeout: halaman terlalu lama merespons'));
    }, TIMEOUT_MS);

    req.on('error', (err) => done(err));
    req.end();
  });
}

async function fetchPage(input) {
  let url = parseHttpsUrl(input);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ip = await resolvePublicIP(url.hostname);
    const res = await requestOnce(url, ip);

    if (REDIRECT_CODES.has(res.status) && res.headers.location) {
      const next = new URL(res.headers.location, url).href;
      url = parseHttpsUrl(next);
      continue;
    }

    return { finalUrl: url.href, ...res };
  }
  throw new Error('Terlalu banyak redirect');
}

module.exports = { fetchPage };
