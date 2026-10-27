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
