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

const mbps = (bytes, ms) => (bytes * 8) / (ms / 1000) / 1e6;
const fmt1 = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: n < 10 ? 1 : 0 });
async function speedTest() {
  const btn = $('sp-run');
  btn.disabled = true;
  ['sp-ping', 'sp-down', 'sp-up'].forEach((id) => ($(id).textContent = '…'));
  try {
    $('sp-note').textContent = 'Misuro la latenza…';
    const pings = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      await fetch(`/api/rete/ping?${Math.random()}`, { cache: 'no-store' });
      pings.push(performance.now() - t);
    }
    pings.sort((a, b) => a - b);
    $('sp-ping').textContent = Math.round(pings[1]); // il secondo migliore: scarta la prima connessione

    $('sp-note').textContent = 'Misuro il download…';
    let t = performance.now();
    const blob = await (await fetch(`/api/rete/download?mb=10&${Math.random()}`, { cache: 'no-store' })).arrayBuffer();
    $('sp-down').textContent = fmt1(mbps(blob.byteLength, performance.now() - t));

    $('sp-note').textContent = "Misuro l'upload…";
    const data = new Uint8Array(4 * 1024 * 1024);
    crypto.getRandomValues(data.subarray(0, 65536)); // abbastanza casuale da non essere compresso
    t = performance.now();
    await fetch('/api/rete/upload', { method: 'POST', body: data });
    $('sp-up').textContent = fmt1(mbps(data.byteLength, performance.now() - t));
    $('sp-note').textContent = `Test completato alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
  } catch {
    $('sp-note').textContent = 'Test non riuscito: il server non risponde.';
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
