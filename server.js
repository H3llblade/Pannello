// Pannello — server HTTP senza dipendenze.
//   /                -> public/pages/index.html
//   /<nome>          -> public/pages/<nome>.html
//   /widgets/<file>  -> public/widgets/<file>  (css e js del browser)
//   /api/...         -> moduli in api/
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const termostato = require('./api/termostato');
const raccolti = require('./api/raccolti');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PAGES_DIR = path.join(__dirname, 'public', 'pages');
const WIDGETS_DIR = path.join(__dirname, 'public', 'widgets');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// Campiona i tempi CPU per calcolare l'utilizzo tra due chiamate
let lastCpu = cpuTimes();
function cpuTimes() {
  return os.cpus().reduce(
    (acc, c) => {
      const t = c.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 }
  );
}

function stats() {
  const now = cpuTimes();
  const dTotal = now.total - lastCpu.total;
  const dIdle = now.idle - lastCpu.idle;
  lastCpu = now;
  const cpu = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;

  let disk = null;
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    disk = { total, used: total - free };
  } catch {}

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptime: os.uptime(),
    cpu,
    cores: os.cpus().length,
    load: os.loadavg(),
    mem: { total: os.totalmem(), used: os.totalmem() - os.freemem() },
    disk,
    time: Date.now(),
  };
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/stats') {
    return send(res, 200, JSON.stringify(stats()), MIME['.json']);
  }
  if (url.pathname === '/api/termostato') {
    termostato().then((d) => send(res, 200, JSON.stringify(d), MIME['.json']));
    return;
  }
  if (raccolti(req, res, url, send)) return;

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }

  let file;
  if (rel.startsWith('/widgets/')) {
    // resta dentro WIDGETS_DIR (blocca path traversal)
    file = path.normalize(path.join(WIDGETS_DIR, rel.slice('/widgets/'.length)));
    if (!file.startsWith(WIDGETS_DIR + path.sep)) return send(res, 403, 'Forbidden');
  } else {
    // pagine: solo nomi semplici, es. /raccolta-olive
    const name = rel === '/' ? 'index' : rel.slice(1).replace(/\.html$/, '');
    file = /^[a-z0-9-]+$/.test(name) ? path.join(PAGES_DIR, name + '.html') : null;
  }

  const notFound = () =>
    fs.readFile(path.join(PAGES_DIR, '404.html'), (e, d) => send(res, 404, e ? 'Not found' : d, MIME['.html']));
  if (!file) return notFound();
  fs.readFile(file, (err, data) => {
    if (err) return notFound();
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, HOST, () => console.log(`Pannello in ascolto su http://${HOST}:${PORT}`));
