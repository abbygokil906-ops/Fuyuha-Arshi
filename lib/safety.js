const net = require('node:net');

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true;
}

function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  const first = lower.split(':')[0] || '0';
  const value = parseInt(first, 16);
  if (Number.isNaN(value)) return true;
  if ((value & 0xfe00) === 0xfc00) return true;
  if ((value & 0xffc0) === 0xfe80) return true;
  if ((value & 0xff00) === 0xff00) return true;
  return false;
}

function parseHttpsUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Format URL tidak valid');
  }
  if (url.protocol !== 'https:') throw new Error('Hanya https yang diizinkan');
  if (url.username || url.password) throw new Error('URL tidak boleh berisi kredensial');
  if (url.port && url.port !== '443') throw new Error('Hanya port 443 yang diizinkan');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new Error('Host lokal tidak diizinkan');
  }
  return url;
}

module.exports = { isPrivateIP, parseHttpsUrl };
