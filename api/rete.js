// Connessione di chi sta guardando il pannello: rete di provenienza (Starlink o no) e test di velocità.
// La VPS non può interrogare l'antenna Starlink di casa (sta dietro la rete Starlink), quindi qui si
// misura il collegamento tra il dispositivo e il pannello.
const crypto = require('crypto');

const ispCache = new Map(); // ip -> { time, data }
const ISP_TTL = 60 * 60 * 1000;
const CHUNK = crypto.randomBytes(256 * 1024); // dati casuali (non comprimibili) per il download

// nginx passa l'IP reale in X-Real-IP; in locale è l'indirizzo della connessione
function clientIp(req) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
  return ip.replace(/^::ffff:/, '');
}
const isPrivate = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip);

// Provider dell'IP tramite ip-api.com (gratuito, senza chiave). Starlink = AS14593 (SpaceX).
async function isp(ip) {
  if (isPrivate(ip)) return { ip, local: true };
  const hit = ispCache.get(ip);
  if (hit && Date.now() - hit.time < ISP_TTL) return hit.data;
  let data = { ip };
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,isp,org,as,city,country`, { signal: AbortSignal.timeout(5000) });
    const j = await res.json();
    if (j.status === 'success') {
      data = { ip, isp: j.isp, org: j.org, as: j.as, city: j.city, country: j.country };
    }
  } catch {}
  data.starlink = /AS14593\b|SpaceX|Starlink/i.test(`${data.as} ${data.isp} ${data.org}`);
  ispCache.set(ip, { time: Date.now(), data });
  return data;
}

module.exports = function rete(req, res, url, send) {
  if (!url.pathname.startsWith('/api/rete')) return false;
  const noStore = { 'Cache-Control': 'no-store' };

  if (url.pathname === '/api/rete' && req.method === 'GET') {
    isp(clientIp(req)).then((d) => send(res, 200, JSON.stringify(d), 'application/json; charset=utf-8'));
    return true;
  }
  if (url.pathname === '/api/rete/ping') {
    res.writeHead(204, noStore);
    res.end();
    return true;
  }
  if (url.pathname === '/api/rete/download') {
    const mb = Math.min(25, Math.max(1, Number(url.searchParams.get('mb')) || 5));
    let left = mb * 1024 * 1024;
    res.writeHead(200, { ...noStore, 'Content-Type': 'application/octet-stream', 'Content-Length': left });
    const pump = () => {
      while (left > 0) {
        const n = Math.min(left, CHUNK.length);
        left -= n;
        if (!res.write(n === CHUNK.length ? CHUNK : CHUNK.subarray(0, n))) return res.once('drain', pump);
      }
      res.end();
    };
    pump();
    return true;
  }
  if (url.pathname === '/api/rete/upload' && req.method === 'POST') {
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 30 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => send(res, 200, JSON.stringify({ bytes: size }), 'application/json; charset=utf-8'));
    return true;
  }
  return false;
};
