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
const CACHE_MS = 60 * 1000; // il cloud Bosch non va interrogato più di una volta al minuto

let cache = null;
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

async function api(p) {
  const res = await fetch(`${API}/${p}`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401) access = null;
  if (!res.ok) throw new Error(`Bosch ha risposto ${res.status} per ${p}`);
  return res.json();
}
const resource = async (p) => (await api(`gateways/${load().deviceId}/resource/${p}`)).value;

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
  const [indoor, target, zones, power, humidity] = await Promise.allSettled([
    resource('zones/zn1/temperatureActual'),
    resource('zones/zn1/temperatureHeatingSetpoint'),
    resource('zones/list'),
    resource('heatingCircuits/hc1/powerSetpoint'),
    resource('system/sensors/humidity/indoor_h1'),
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
  cache = { time: Date.now(), data };
  return data;
}

module.exports = { termostato, startLogin, finishLogin, unlink };
