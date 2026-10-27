// Impostazioni: scelta del tema e stato del server
const $ = (id) => document.getElementById(id);

// --- Tema ---
const THEME_NAMES = { light: 'Chiaro', dark: 'Scuro', auto: 'Automatico' };
const seg = $('theme-seg');
$('look-icon').innerHTML = icon('sun');
function paintSeg() {
  const mode = themeMode();
  seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === mode));
  $('theme-summary').textContent = THEME_NAMES[mode];
}
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setTheme(b.dataset.mode);
});
document.addEventListener('themechange', paintSeg);
paintSeg();

// --- Termostato ---
$('th-icon').innerHTML = icon('thermo');
$('th-open').innerHTML = `${icon('link')}Apri login Bosch`;
const deg = (t) => (t == null ? '—' : `${String(Math.round(t * 10) / 10).replace('.', ',')} °C`);

async function thermostat() {
  let t;
  try { t = await (await fetch('/api/termostato')).json(); } catch { t = { connected: false, reason: 'Server non raggiungibile' }; }
  $('th-status').textContent = t.connected ? (t.heating ? 'Acceso' : 'Collegato') : 'Non collegato';
  $('th-status').className = 'row-value' + (t.connected ? ' ok' : '');
  $('th-data').hidden = !t.connected;
  $('th-link').hidden = t.connected || !t.linkable;
  $('th-reason').textContent = t.reason || '';
  if (!t.connected) return;
  $('th-indoor').textContent = deg(t.indoor);
  $('th-target').textContent = deg(t.target);
  $('th-hum').textContent = t.humidity == null ? '—' : `${String(Math.round(t.humidity)).replace('.', ',')}%`;
  $('th-heating').textContent = t.heating ? 'Acceso' : 'Spento';
  $('th-updated').textContent = new Date(t.updated).toLocaleTimeString('it-IT');
}

const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Operazione non riuscita');
  return out;
};
function thError(msg) {
  $('th-error').textContent = msg;
  $('th-error').hidden = !msg;
}
$('th-open').addEventListener('click', async () => {
  // la scheda va aperta subito (dentro il clic), poi le si dà l'indirizzo
  const tab = window.open('about:blank', '_blank');
  try {
    const { url } = await post('/api/termostato/login');
    if (tab) tab.location = url; else location.href = url;
    thError('');
  } catch (e) {
    tab?.close();
    thError(e.message);
  }
});
$('th-connect').addEventListener('click', async () => {
  const btn = $('th-connect');
  btn.disabled = true;
  btn.textContent = 'Collegamento…';
  try {
    await post('/api/termostato/collega', { url: $('th-url').value });
    $('th-url').value = '';
    thError('');
    await thermostat();
  } catch (e) {
    thError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Collega';
  }
});
// conferma con doppio clic, come nel registro olive
$('th-unlink').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')) {
    b.classList.add('armed');
    b.textContent = 'Sicuro?';
    setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Scollega'; }, 3000);
    return;
  }
  await post('/api/termostato/scollega').catch(() => {});
  thermostat();
});
thermostat();
setInterval(thermostat, 60 * 1000);

// --- Connessione Starlink ---
$('net-icon').innerHTML = icon('wifi');
async function network() {
  try {
    const n = await (await fetch('/api/rete')).json();
    const where = n.local ? 'Rete locale' : n.starlink ? 'Starlink' : n.isp || 'Sconosciuta';
    $('net-status').textContent = n.local ? 'Rete locale' : n.starlink ? 'Connesso via Starlink' : 'Non su Starlink';
    $('net-status').className = 'row-value' + (n.starlink ? ' ok' : '');
    $('net-isp').textContent = n.starlink && n.isp ? `${where} · ${n.isp}` : where;
    $('net-ip').textContent = n.ip || '—';
    $('net-city').textContent = [n.city, n.country].filter(Boolean).join(', ') || '—';
  } catch {
    $('net-status').textContent = 'Non disponibile';
  }
}
network();

// Test di velocità verso la VPS, sul modello degli speedtest: più connessioni in parallelo,
// durata a tempo, e i primi istanti (avvio delle connessioni) esclusi dal calcolo.
// Metodo principale: WebSocket (ognuno è una connessione TCP separata, come fa Speedtest).
// Ripiego: fetch, che con HTTP/2 condivide un'unica connessione e quindi misura di meno.
const WS_STREAMS = 6;
const STREAMS = 4;
const TEST_MS = 8000;
const WARMUP_MS = 2000;
const fmt1 = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: n < 10 ? 1 : 0 });

// conta i byte nel tempo e restituisce i Mbps misurati dopo il riscaldamento
function rateMeter() {
  const t0 = performance.now();
  let total = 0, atWarm = null, tWarm = null;
  return {
    add(n) {
      total += n;
      const now = performance.now();
      if (atWarm === null && now - t0 >= WARMUP_MS) { atWarm = total; tWarm = now; }
    },
    mbps() {
      const now = performance.now();
      const [bytes, ms] = atWarm === null ? [total, now - t0] : [total - atWarm, now - tWarm];
      return ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0;
    },
  };
}

const wsUrl = (dir) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rete/ws?dir=${dir}&${Math.random()}`;

// apre n WebSocket; rifiuta se non si aprono entro 4 secondi (es. proxy senza WebSocket)
function openSockets(dir, n) {
  return Promise.all(Array.from({ length: n }, () => new Promise((ok, ko) => {
    const ws = new WebSocket(wsUrl(dir));
    ws.binaryType = 'arraybuffer';
    const t = setTimeout(() => { ws.close(); ko(new Error('WebSocket non disponibile')); }, 4000);
    ws.onopen = () => { clearTimeout(t); ok(ws); };
    ws.onerror = () => { clearTimeout(t); ko(new Error('WebSocket non disponibile')); };
  })));
}

async function wsDownload(show) {
  const socks = await openSockets('down', WS_STREAMS);
  const m = rateMeter();
  socks.forEach((ws) => (ws.onmessage = (e) => m.add(e.data.byteLength)));
  const live = setInterval(() => show(m.mbps()), 300);
  await new Promise((r) => setTimeout(r, TEST_MS));
  clearInterval(live);
  const result = m.mbps();
  socks.forEach((ws) => ws.close());
  return result;
}

async function wsUpload(show) {
  const socks = await openSockets('up', WS_STREAMS);
  const chunk = new Uint8Array(64 * 1024);
  for (let i = 0; i < chunk.length; i += 65536) crypto.getRandomValues(chunk.subarray(i, i + 65536));
  // il server comunica quanti byte ha ricevuto: contano solo quelli
  const got = socks.map(() => 0);
  socks.forEach((ws, i) => (ws.onmessage = (e) => (got[i] = Number(e.data))));
  const total = () => got.reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  let warm = null;
  const rate = () => {
    if (!warm) return 0;
    const ms = performance.now() - warm.t;
    return ms > 0 ? ((total() - warm.bytes) * 8) / (ms / 1000) / 1e6 : 0;
  };
  // tiene pieno il buffer di invio di ogni socket
  const feed = setInterval(() => {
    for (const ws of socks) while (ws.readyState === 1 && ws.bufferedAmount < 2 * 1024 * 1024) ws.send(chunk);
    if (!warm && performance.now() - t0 >= WARMUP_MS) warm = { t: performance.now(), bytes: total() };
    show(rate());
  }, 20);
  await new Promise((r) => setTimeout(r, TEST_MS));
  clearInterval(feed);
  const result = rate();
  socks.forEach((ws) => ws.close());
  return result;
}

async function measureDownload(show) {
  const m = rateMeter();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TEST_MS);
  const live = setInterval(() => show(m.mbps()), 300);
  const stream = async () => {
    while (!stop.signal.aborted) {
      const res = await fetch(`/api/rete/download?mb=100&${Math.random()}`, { cache: 'no-store', signal: stop.signal });
      if (!res.ok) throw new Error(`download ${res.status}`);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        m.add(value.byteLength);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: STREAMS }, () => stream().catch((e) => { if (e.name !== 'AbortError') throw e; })));
  } finally {
    clearTimeout(timer);
    clearInterval(live);
  }
  return m.mbps();
}

// upload: blocchi piccoli; contano solo quelli partiti dopo il riscaldamento,
// sul tempo che va dalla fine del riscaldamento all'ultima conferma del server
async function measureUpload(show) {
  const chunk = new Uint8Array(256 * 1024);
  for (let i = 0; i < chunk.length; i += 65536) crypto.getRandomValues(chunk.subarray(i, i + 65536)); // non comprimibile
  const t0 = performance.now();
  const end = t0 + TEST_MS;
  let bytes = 0, last = t0;
  const rate = () => (last > t0 + WARMUP_MS ? (bytes * 8) / ((last - t0 - WARMUP_MS) / 1000) / 1e6 : 0);
  const live = setInterval(() => show(rate()), 300);
  const stream = async () => {
    while (performance.now() < end) {
      const started = performance.now();
      const res = await fetch('/api/rete/upload', { method: 'POST', body: chunk, cache: 'no-store' });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      const got = (await res.json()).bytes; // byte che il server conferma di aver ricevuto
      if (started >= t0 + WARMUP_MS) {
        bytes += got;
        last = performance.now();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: STREAMS }, stream));
  } finally {
    clearInterval(live);
  }
  return rate();
}

async function speedTest() {
  const btn = $('sp-run');
  btn.disabled = true;
  ['sp-ping', 'sp-down', 'sp-up'].forEach((id) => ($(id).textContent = '…'));
  try {
    $('sp-note').textContent = 'Misuro la latenza…';
    const pings = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      await fetch(`/api/rete/ping?${Math.random()}`, { cache: 'no-store' });
      pings.push(performance.now() - t);
    }
    pings.sort((a, b) => a - b);
    $('sp-ping').textContent = Math.round(pings[Math.floor(pings.length / 2)]); // mediana

    const showDown = (v) => ($('sp-down').textContent = fmt1(v));
    const showUp = (v) => ($('sp-up').textContent = fmt1(v));
    let useWs = true;
    $('sp-note').textContent = 'Misuro il download (8 secondi)…';
    let down;
    try { down = await wsDownload(showDown); } catch { useWs = false; down = await measureDownload(showDown); }
    showDown(down);

    $('sp-note').textContent = "Misuro l'upload (8 secondi)…";
    showUp(useWs ? await wsUpload(showUp) : await measureUpload(showUp));
    const at = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    $('sp-note').textContent = `Test verso il server del pannello completato alle ${at}${useWs ? '' : ' (metodo semplificato: i valori possono essere più bassi)'}.`;
  } catch (e) {
    $('sp-note').textContent = `Test non riuscito (${e.message || 'il server non risponde'}).`;
  } finally {
    btn.disabled = false;
  }
}
$('sp-run').addEventListener('click', speedTest);

// --- Server ---
$('srv-icon').innerHTML = icon('server');

const GB = 1024 ** 3;
const gb = (b) => (b / GB).toFixed(1).replace('.', ',') + ' GB';
function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} giorni, ${h} ore` : `${h} ore, ${m} min`;
}
function meter(name, pct, text) {
  const bar = $(`${name}-bar`);
  bar.style.width = `${pct}%`;
  bar.classList.toggle('warn', pct >= 70 && pct < 90);
  bar.classList.toggle('hot', pct >= 90);
  $(`${name}-val`).textContent = text;
}

async function stats() {
  try {
    const s = await (await fetch('/api/stats')).json();
    // il Codespace non è la VPS: lo segnalo per non confondere i dati
    $('srv-status').textContent = s.hostname.startsWith('codespaces-') ? 'Online · anteprima locale' : 'Online';
    $('srv-status').className = 'row-value ok';
    $('host').textContent = s.hostname;
    $('platform').textContent = s.platform;
    $('uptime').textContent = fmtUptime(s.uptime);
    $('load').textContent = s.load.map((l) => l.toFixed(2).replace('.', ',')).join('  ·  ');
    meter('cpu', s.cpu, `${s.cpu}% · ${s.cores} core`);
    const memPct = (s.mem.used / s.mem.total) * 100;
    meter('mem', memPct, `${gb(s.mem.used)} di ${gb(s.mem.total)}`);
    if (s.disk) meter('disk', (s.disk.used / s.disk.total) * 100, `${gb(s.disk.used)} di ${gb(s.disk.total)}`);
  } catch {
    $('srv-status').textContent = 'Non raggiungibile';
    $('srv-status').className = 'row-value bad';
  }
}
stats();
setInterval(stats, 3000);
