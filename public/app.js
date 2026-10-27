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

// --- Scorciatoie ---
$('links').innerHTML = cfg.links
  .map((l) => `
    <a class="tile link-tile" href="${l.url}" target="_blank" rel="noopener">
      <span class="dot-icon" style="--c:${l.color || '#8e8e93'}">${icon(l.icon)}</span>
      <span class="link-name">${l.name}</span>
      <span class="link-host">${new URL(l.url).hostname.replace(/^www\./, '')}</span>
    </a>`)
  .join('');

// --- Note (localStorage) ---
$('notes-icon').innerHTML = icon('pencil');
const notes = $('notes');
try { notes.value = localStorage.getItem('pannello-notes') || ''; } catch {}
notes.addEventListener('input', () => {
  try { localStorage.setItem('pannello-notes', notes.value); } catch {}
});
