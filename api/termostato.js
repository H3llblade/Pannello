// Termostato Bosch EasyControl (CT200) letto dal cloud Bosch "Pointt".
// Accesso con l'account SingleKey ID dell'app (OAuth2 + PKCE). Il login ha un captcha, quindi
// si fa una volta a mano: l'utente accede nel browser e incolla l'indirizzo com.bosch.rrc://...
// che Bosch restituisce; da lì in poi il refresh token (che cambia a ogni uso) sta in data/bosch.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_URL = 'https://singlekey-id.com/auth/connect/authorize';
const TOKEN_URL = 'https://singlekey-id.com/auth/connect/token';
const CLIENT_ID = 'BEAE0439-49D3-41B5-83D1-59B0971793F4'; // client dell'app ufficiale Bosch
const REDIRECT_URI = 'com.bosch.rrc://app/oidc_redirect';
const SCOPE = [
  'email', 'profile', 'openid', 'offline_access', 'phone',
  'pointt.gateway.claiming', 'pointt.gateway.removal', 'pointt.gateway.list', 'pointt.gateway.users',
  'pointt.gateway.resource.rrcng.app', 'pointt.castt.flow.token-exchange',
].join(' ');
const API = 'https://pointt-api.bosch-thermotechnology.com/pointt-api/api/v1';

const FILE = path.join(__dirname, '..', 'data', 'bosch.json');
const CACHE_MS = 25 * 1000; // poco meno di WATCH_MS, così ogni controllo periodico legge dati freschi
const WATCH_MS = 30 * 1000; // controllo periodico mentre qualcuno ha il pannello aperto
// EasyControl non ha un vero «spento»: si usa la modalità manuale alla temperatura minima (antigelo)
const OFF_TEMP = 5;
const DEFAULT_COMFORT = 21;

let cache = null;
let lastData = null; // ultima lettura riuscita (per sapere quando cambia lo stato)
let access = null; // { token, expires }
let refreshing = null; // una sola rinnovazione alla volta: il refresh token vale per un solo uso

const b64url = (buf) => buf.toString('base64url');
function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
    signal: AbortSignal.timeout(10000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error_description || out.error || `SingleKey ID ha risposto ${res.status}`);
  return out;
}

function remember(tokens) {
  access = { token: tokens.access_token, expires: Date.now() + (tokens.expires_in - 60) * 1000 };
  if (tokens.refresh_token) save({ ...load(), refreshToken: tokens.refresh_token, pending: undefined });
}

async function accessToken() {
  if (access && Date.now() < access.expires) return access.token;
  if (!refreshing) {
    refreshing = (async () => {
      const { refreshToken } = load();
      if (!refreshToken) throw new Error('Account Bosch non collegato');
      remember(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }));
      return access.token;
    })().finally(() => (refreshing = null));
  }
  return refreshing;
}

async function api(p, method = 'GET', body) {
  const res = await fetch(`${API}/${p}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401) access = null;
  if (!res.ok) throw new Error(`Bosch ha risposto ${res.status} per ${p}`);
  return method === 'GET' ? res.json() : null; // le PUT rispondono senza contenuto
}
const resource = async (p) => (await api(`gateways/${load().deviceId}/resource/${p}`)).value;
const writeResource = (p, value) => api(`gateways/${load().deviceId}/resource/${p}`, 'PUT', { value });

// --- Collegamento dell'account ---
function startLogin() {
  const verifier = b64url(crypto.randomBytes(32));
  const state = b64url(crypto.randomBytes(16));
  save({ ...load(), pending: { verifier, state, created: Date.now() } });
  const q = new URLSearchParams({
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    response_type: 'code',
    prompt: 'login',
    state,
    nonce: b64url(crypto.randomBytes(16)),
    scope: SCOPE,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    style_id: 'tt_bsch',
  });
  return `${AUTH_URL}?${q}`;
}

async function finishLogin(pasted) {
  const { pending } = load();
  if (!pending) throw new Error('Premi prima «Apri login Bosch»');
  // accetta l'URL, il solo codice o l'intero messaggio di errore della Console
  const raw = String(pasted || '').trim();
  const text = (raw.match(/com\.bosch\.rrc:\/\/[^\s'"]+/) || [raw])[0];
  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new URLSearchParams(query);
  const code = params.get('code') || (/^[\w-]+$/.test(text) ? text : null);
  if (!code) throw new Error("Nell'indirizzo incollato non c'è il codice (code=...)");
  if (params.get('state') && params.get('state') !== pending.state) {
    throw new Error('Questo indirizzo appartiene a un login precedente: riapri il login Bosch');
  }
  remember(await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: pending.verifier,
  }));
  const gateways = await api('gateways');
  const deviceId = gateways?.[0]?.deviceId;
  if (!deviceId) throw new Error("L'account non ha termostati collegati");
  save({ ...load(), deviceId });
  cache = null;
}

function unlink() {
  save({});
  access = null;
  cache = null;
}

// --- Lettura ---
async function readFromBosch() {
  if (!load().refreshToken) return { connected: false, linkable: true, reason: 'Account Bosch non collegato' };
  const [indoor, target, zones, power, humidity, mode] = await Promise.allSettled([
    resource('zones/zn1/temperatureActual'),
    resource('zones/zn1/temperatureHeatingSetpoint'),
    resource('zones/list'),
    resource('heatingCircuits/hc1/powerSetpoint'),
    resource('system/sensors/humidity/indoor_h1'),
    resource('zones/zn1/userMode'),
  ]);
  if (indoor.status === 'rejected') throw indoor.reason;
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const zone = Array.isArray(val(zones)) ? val(zones)[0] : null;
  const status = zone?.status ?? null; // es. "idle"
  // acceso se la caldaia riceve richiesta di potenza o se la zona non è a riposo
  const heating = Number(val(power)) > 0 || (status != null && !['idle', 'off'].includes(String(status).toLowerCase()));
  return {
    connected: true,
    indoor: Number(val(indoor)),
    target: val(target) != null ? Number(val(target)) : null,
    humidity: val(humidity) != null ? Number(val(humidity)) : null,
    mode: val(mode), // "clock" = programma settimanale, "manual" = manuale
    // «spento» dal pannello = manuale alla temperatura antigelo
    enabled: !(val(mode) === 'manual' && Number(val(target)) <= OFF_TEMP),
    heating,
    status,
    updated: Date.now(),
  };
}

async function termostato() {
  if (cache && Date.now() - cache.time < CACHE_MS) return cache.data;
  let data;
  try {
    data = await readFromBosch();
  } catch (e) {
    data = { connected: false, linkable: true, reason: `Errore dal cloud Bosch: ${e.message}` };
    console.error('termostato:', e.message);
  }
  // ricorda da quando il riscaldamento è nello stato attuale (per «Acceso alle 19:42»)
  const prev = lastData;
  if (data.connected) {
    // l'orario si conosce solo se il cambio avviene mentre il server è acceso
    data.since = prev?.connected ? (prev.heating === data.heating ? prev.since : Date.now()) : null;
    if (prev?.connected && prev.heating !== data.heating) console.log(`termostato: riscaldamento ${data.heating ? 'acceso' : 'spento'}`);
  }
  cache = { time: Date.now(), data };
  if (data.connected) lastData = data;
  return data;
}

// --- Aggiornamenti in tempo reale ---
// Mentre almeno una pagina è in ascolto, il server rilegge il termostato ogni WATCH_MS e avvisa
// le pagine solo quando qualcosa cambia (acceso/spento, temperature, collegamento).
const listeners = new Set();
let watchTimer = null;
const fingerprint = (d) => JSON.stringify([d.connected, d.heating, d.indoor, d.target, d.humidity, d.mode, d.enabled, d.reason]);
let lastSent = null;

async function tick() {
  const data = await termostato();
  const fp = fingerprint(data);
  if (fp !== lastSent) {
    lastSent = fp;
    for (const fn of listeners) fn(data);
  }
}

function subscribe(fn) {
  listeners.add(fn);
  if (!watchTimer) watchTimer = setInterval(() => tick().catch(() => {}), WATCH_MS);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { clearInterval(watchTimer); watchTimer = null; lastSent = null; }
  };
}

// dopo collegamento/scollegamento avvisa subito le pagine aperte
function changed() {
  cache = null;
  tick().catch(() => {});
}

// --- Comandi: accendi / spegni / torna al programma ---
async function command(action) {
  if (!load().refreshToken) throw new Error('Account Bosch non collegato');
  const now = cache?.data?.connected ? cache.data : await readFromBosch();
  if (action === 'spegni') {
    // ricordo la temperatura in uso per la prossima accensione
    if (now.target > OFF_TEMP) save({ ...load(), comfort: now.target });
    await writeResource('zones/zn1/userMode', 'manual');
    await writeResource('zones/zn1/manualTemperatureHeating', OFF_TEMP);
  } else if (action === 'accendi') {
    const comfort = load().comfort || (now.target > OFF_TEMP ? now.target : DEFAULT_COMFORT);
    await writeResource('zones/zn1/userMode', 'manual');
    await writeResource('zones/zn1/manualTemperatureHeating', comfort);
  } else if (action === 'programma') {
    await writeResource('zones/zn1/userMode', 'clock');
  } else {
    throw new Error('Comando non valido');
  }
  console.log(`termostato: comando «${action}»`);
  // il termostato impiega qualche secondo ad applicare il comando: rileggo subito e poco dopo
  changed();
  setTimeout(changed, 5000);
  setTimeout(changed, 15000);
}

module.exports = { termostato, subscribe, startLogin, finishLogin, unlink, changed, command };
