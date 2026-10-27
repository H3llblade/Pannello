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

// --- WebSocket per il test di velocità: ogni socket è una connessione TCP separata
// (con HTTP/2 il browser farebbe passare tutto in una sola connessione) ---
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_MAX_MS = 20000;
const PAYLOAD = CHUNK.subarray(0, 60000);
const DOWN_FRAME = Buffer.concat([Buffer.from([0x82, 126, PAYLOAD.length >> 8, PAYLOAD.length & 255]), PAYLOAD]);
const textFrame = (s) => {
  const b = Buffer.from(s);
  return Buffer.concat([Buffer.from([0x81, b.length]), b]); // messaggi brevi (< 126 byte)
};

// Legge i frame che arrivano dal browser: conta i byte di dati e segnala la chiusura (opcode 8).
// Tiene in memoria solo l'intestazione del frame in corso, il contenuto viene saltato.
function frameReader(onData, onClose) {
  let head = Buffer.alloc(0);
  let skip = 0;
  return (chunk) => {
    while (chunk.length) {
      if (skip) {
        const n = Math.min(skip, chunk.length);
        skip -= n;
        onData(n);
        chunk = chunk.subarray(n);
        continue;
      }
      head = Buffer.concat([head, chunk]);
      chunk = Buffer.alloc(0);
      if (head.length < 2) return;
      const op = head[0] & 0x0f;
      let len = head[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (head.length < 4) return; len = head.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (head.length < 10) return; len = Number(head.readBigUInt64BE(2)); off = 10; }
      if (head[1] & 0x80) off += 4; // maschera del browser
      if (head.length < off) return;
      if (op === 8) return onClose();
      chunk = head.subarray(off);
      head = Buffer.alloc(0);
      skip = len;
      if (!len) continue;
    }
  };
}

function upgrade(req, socket) {
  const url = new URL(req.url, 'http://localhost');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/api/rete/ws' || !key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const stop = setTimeout(() => socket.destroy(), WS_MAX_MS);
  socket.on('close', () => clearTimeout(stop));
  socket.on('error', () => {});

  const close = () => { socket.end(Buffer.from([0x88, 0])); socket.destroySoon?.(); setTimeout(() => socket.destroy(), 500); };

  if (url.searchParams.get('dir') === 'up') {
    // conta i byte di dati ricevuti e li comunica al browser 4 volte al secondo
    let bytes = 0;
    socket.on('data', frameReader((n) => (bytes += n), close));
    const tick = setInterval(() => socket.writable && socket.write(textFrame(String(bytes))), 250);
    socket.on('close', () => clearInterval(tick));
    return;
  }
  // download: frame binari finché il browser non chiude
  let closed = false;
  socket.on('data', frameReader(() => {}, () => { closed = true; close(); }));
  const pump = () => {
    while (socket.writable && !closed) {
      if (!socket.write(DOWN_FRAME)) return socket.once('drain', pump);
    }
  };
  pump();
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
    const mb = Math.min(200, Math.max(1, Number(url.searchParams.get('mb')) || 5));
    let left = mb * 1024 * 1024;
    res.writeHead(200, { ...noStore, 'Content-Type': 'application/octet-stream', 'Content-Length': left, 'X-Accel-Buffering': 'no' });
    req.on('close', () => (left = 0)); // il browser interrompe il download allo scadere del tempo
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
      if (size > 32 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => send(res, 200, JSON.stringify({ bytes: size }), 'application/json; charset=utf-8'));
    return true;
  }
  return false;
};
module.exports.upgrade = upgrade;
