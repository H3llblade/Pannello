const cfg = window.PANNELLO;
const $ = (id) => document.getElementById(id);

// --- Orologio e saluto ---
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const h = d.getHours();
  $('greeting').textContent = h < 6 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}
tick();
setInterval(tick, 1000);

// --- Meteo (Open-Meteo, nessuna API key) ---
const WMO = {
  0: ['☀', 'Sereno'], 1: ['🌤', 'Poco nuvoloso'], 2: ['⛅', 'Parzialmente nuvoloso'], 3: ['☁', 'Coperto'],
  45: ['🌫', 'Nebbia'], 48: ['🌫', 'Nebbia'], 51: ['🌦', 'Pioviggine'], 53: ['🌦', 'Pioviggine'], 55: ['🌦', 'Pioviggine'],
  61: ['🌧', 'Pioggia debole'], 63: ['🌧', 'Pioggia'], 65: ['🌧', 'Pioggia forte'],
  71: ['🌨', 'Neve debole'], 73: ['🌨', 'Neve'], 75: ['🌨', 'Neve forte'],
  80: ['🌦', 'Rovesci'], 81: ['🌧', 'Rovesci'], 82: ['⛈', 'Rovesci forti'], 95: ['⛈', 'Temporale'], 96: ['⛈', 'Temporale'], 99: ['⛈', 'Temporale'],
};
async function weather() {
  $('city').textContent = cfg.city;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
    const { current: c } = await (await fetch(url)).json();
    const [icon, desc] = WMO[c.weather_code] || ['◌', '—'];
    $('w-icon').textContent = icon;
    $('w-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('w-desc').textContent = desc;
    $('w-hum').textContent = `${c.relative_humidity_2m}%`;
    $('w-wind').textContent = `${Math.round(c.wind_speed_10m)} km/h`;
  } catch {
    $('w-desc').textContent = 'Meteo non disponibile';
  }
}
weather();
setInterval(weather, 15 * 60 * 1000);

// --- Statistiche server ---
const CIRC = 2 * Math.PI * 42;
function gauge(id, pct) {
  const el = $(id);
  el.querySelector('.bar').style.strokeDashoffset = CIRC * (1 - pct / 100);
  el.querySelector('b').textContent = `${Math.round(pct)}%`;
  el.classList.toggle('hot', pct >= 85);
}
function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}g ${h}h` : `${h}h ${m}m`;
}
async function stats() {
  try {
    const s = await (await fetch('/api/stats')).json();
    $('host').textContent = s.hostname;
    gauge('g-cpu', s.cpu);
    gauge('g-mem', (s.mem.used / s.mem.total) * 100);
    if (s.disk) gauge('g-disk', (s.disk.used / s.disk.total) * 100);
    $('uptime').textContent = fmtUptime(s.uptime);
    $('load').textContent = s.load.map((l) => l.toFixed(2)).join(' · ');
    $('conn').textContent = 'ONLINE';
    document.body.classList.remove('offline');
  } catch {
    $('conn').textContent = 'OFFLINE';
    document.body.classList.add('offline');
  }
}
stats();
setInterval(stats, 3000);

// --- Scorciatoie ---
$('links').innerHTML = cfg.links
  .map((l) => `<a href="${l.url}" target="_blank" rel="noopener"><span>${l.icon}</span>${l.name}</a>`)
  .join('');

// --- Note (localStorage) ---
const notes = $('notes');
try { notes.value = localStorage.getItem('pannello-notes') || ''; } catch {}
notes.addEventListener('input', () => {
  try { localStorage.setItem('pannello-notes', notes.value); } catch {}
});
