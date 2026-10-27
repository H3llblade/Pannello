// Home: orologio, meteo, scorciatoie, note
const cfg = window.PANNELLO;
const $ = (id) => document.getElementById(id);

// --- Orologio e saluto ---
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  $('date').textContent = date[0].toUpperCase() + date.slice(1);
  const h = d.getHours();
  $('greeting').textContent = h < 6 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  $('seconds').textContent = d.toLocaleDateString('it-IT', { year: 'numeric' }) + ' · settimana ' + week(d);
}
function week(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
tick();
setInterval(tick, 1000);

// --- Meteo (Open-Meteo, nessuna API key) ---
// codice WMO -> [icona, descrizione, tono del riquadro]
function wmo(code, isDay) {
  if (code === 0) return [isDay ? 'sun' : 'moon', 'Sereno', isDay ? 'clear' : 'night'];
  if (code <= 2) return ['cloud', code === 1 ? 'Poco nuvoloso' : 'Parzialmente nuvoloso', isDay ? 'clear' : 'night'];
  if (code === 3) return ['cloud', 'Coperto', 'grey'];
  if (code <= 48) return ['cloud', 'Nebbia', 'grey'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['rain', code <= 57 ? 'Pioviggine' : code >= 80 ? 'Rovesci' : 'Pioggia', 'rain'];
  if (code <= 86) return ['snow', 'Neve', 'grey'];
  return ['storm', 'Temporale', 'rain'];
}
async function weather() {
  $('city').textContent = cfg.city;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day&timezone=auto`;
    const { current: c } = await (await fetch(url)).json();
    const [ic, desc, tone] = wmo(c.weather_code, c.is_day);
    $('weather').dataset.tone = tone;
    $('w-icon').innerHTML = icon(ic);
    $('w-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('w-desc').textContent = desc;
    $('w-hum').innerHTML = `${icon('droplet')}${c.relative_humidity_2m}%`;
    $('w-wind').innerHTML = `${icon('wind')}${Math.round(c.wind_speed_10m)} km/h`;
  } catch {
    $('w-desc').textContent = 'Meteo non disponibile';
  }
}
weather();
setInterval(weather, 15 * 60 * 1000);

// --- Popup meteo con mappa e previsioni di Windy ---
const modal = $('weather-modal');
const windy = $('windy');
let layer = 'radar';

function windyUrl() {
  const q = new URLSearchParams({
    type: 'map', location: 'coordinates', lat: cfg.lat, lon: cfg.lon, zoom: layer === 'radar' ? 9 : 7,
    overlay: layer, product: layer === 'radar' ? 'radar' : 'ecmwf', level: 'surface',
    detailLat: cfg.lat, detailLon: cfg.lon, detail: true, marker: true, message: true,
    metricTemp: '°C', metricWind: 'km/h', metricRain: 'mm',
  });
  return `https://embed.windy.com/embed.html?${q}`;
}
function openWeather() {
  $('modal-title').textContent = cfg.city;
  windy.src = windyUrl();
  modal.showModal();
}
$('modal-close').innerHTML = icon('close');
$('modal-close').addEventListener('click', () => modal.close());
// clic fuori dal riquadro = chiudi
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
// aperto col mouse: alla chiusura niente bordo di focus sul riquadro (con la tastiera resta)
let byKeyboard = false;
$('weather').addEventListener('click', () => { byKeyboard = false; openWeather(); });
modal.addEventListener('close', () => { if (!byKeyboard) $('weather').blur(); });
$('weather').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); byKeyboard = true; openWeather(); }
});
$('layer-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  layer = b.dataset.layer;
  $('layer-seg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b));
  windy.src = windyUrl();
});

// --- Riscaldamento (termostato Bosch letto dalla VPS) ---
// In tempo reale: la pagina resta in ascolto su /api/termostato/eventi e il server manda i dati
// appena cambiano. Se l'ascolto cade, il browser si ricollega da solo; in più un controllo di riserva.
const fmtTemp = (t) => `${(Math.round(t * 10) / 10).toString().replace('.', ',')}°`;
const hhmm = (ts) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
let lastHeat = null;
let pending = false; // comando in corso: l'interruttore non segue gli aggiornamenti

function showHeating(t) {
  const state = !t.connected ? 'off-line' : t.heating ? 'on' : 'off';
  const tile = $('heat');
  // animazione solo quando lo stato cambia davanti all'utente (non al primo caricamento)
  if (lastHeat && lastHeat !== state && state !== 'off-line') {
    tile.classList.remove('flash');
    void tile.offsetWidth; // riavvia l'animazione
    tile.classList.add('flash');
  }
  lastHeat = state;
  tile.dataset.state = state;
  $('h-icon').innerHTML = icon(t.connected && t.heating ? 'flame' : 'thermo');
  $('h-temp').textContent = t.connected ? fmtTemp(t.indoor) : '--°';
  const since = t.since ? ` alle ${hhmm(t.since)}` : '';
  const enabled = t.enabled !== false;
  $('h-state').textContent = !t.connected ? 'Non collegato'
    : !enabled ? `Spento${since}`
    : t.heating ? `Acceso${since}`
    : 'In attesa · temperatura raggiunta';
  $('h-target').textContent = t.connected && t.target != null && enabled ? `Impostata ${fmtTemp(t.target)}` : '';
  // interruttore e «torna al programma» solo se il termostato è collegato
  const sw = $('h-switch');
  sw.hidden = !t.connected;
  if (!pending) sw.setAttribute('aria-checked', String(t.connected && enabled));
  $('h-program').hidden = !t.connected || t.mode !== 'manual' || !enabled;
}

// --- Comandi: interruttore acceso/spento e ritorno al programma settimanale ---
async function sendCommand(azione, btn) {
  pending = true;
  btn.disabled = true;
  $('h-error').hidden = true;
  try {
    const res = await fetch('/api/termostato/comando', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'comando non riuscito');
  } catch (e) {
    $('h-error').textContent = `Il termostato non ha ricevuto il comando: ${e.message === 'Failed to fetch' ? 'server non raggiungibile' : e.message}.`;
    $('h-error').hidden = false;
    heating(); // rimette l'interruttore nello stato reale
  } finally {
    pending = false;
    btn.disabled = false;
  }
}
$('h-switch').addEventListener('click', (e) => {
  const sw = e.currentTarget;
  const on = sw.getAttribute('aria-checked') !== 'true';
  sw.setAttribute('aria-checked', String(on)); // risposta immediata, poi conferma dal termostato
  sendCommand(on ? 'accendi' : 'spegni', sw);
});
$('h-program').addEventListener('click', (e) => sendCommand('programma', e.currentTarget));

async function heating() {
  try { showHeating(await (await fetch('/api/termostato')).json()); } catch { showHeating({ connected: false }); }
}

let lastEvent = 0;
if ('EventSource' in window) {
  const es = new EventSource('/api/termostato/eventi');
  es.onmessage = (e) => { lastEvent = Date.now(); showHeating(JSON.parse(e.data)); };
} else {
  heating();
}
// riserva: se per 2 minuti non arriva niente, chiedo io
setInterval(() => { if (Date.now() - lastEvent > 120000) heating(); }, 60000);
// tornando sulla scheda dopo un po', aggiornamento immediato
document.addEventListener('visibilitychange', () => { if (!document.hidden) heating(); });

// --- Sezioni (aprono una pagina del pannello) ---
$('sections').innerHTML = cfg.sections
  .map((x) => `
    <a class="tile section-tile" href="${x.href}">
      <span class="dot-icon" style="--c:${x.color}">${icon(x.icon)}</span>
      <span class="section-name">${x.name}</span>
      <span class="section-sub" data-sub="${x.href}"></span>
      <span class="section-go">${icon('chevron')}</span>
    </a>`)
  .join('');

// sotto «Veicoli»: scadenze scadute o in arrivo
async function vehiclesSummary() {
  const el = document.querySelector('[data-sub="/veicoli"]');
  if (!el) return;
  try {
    const list = await (await fetch('/api/veicoli')).json();
    if (!list.length) return (el.textContent = 'Nessun veicolo inserito');
    const { bad, warn } = dueSummary(list);
    el.className = 'section-sub ' + (bad ? 'due-bad' : warn ? 'due-warn' : 'due-ok');
    el.innerHTML = bad || warn
      ? `${icon(bad ? 'alert' : 'clock')}${[bad && `${bad} scadut${bad === 1 ? 'a' : 'e'}`, warn && `${warn} in arrivo`].filter(Boolean).join(' · ')}`
      : `${icon('check')}Tutto in regola`;
  } catch {}
}
vehiclesSummary();

// --- Note (localStorage) ---
$('notes-icon').innerHTML = icon('pencil');
const notes = $('notes');
try { notes.value = localStorage.getItem('pannello-notes') || ''; } catch {}
notes.addEventListener('input', () => {
  try { localStorage.setItem('pannello-notes', notes.value); } catch {}
});
