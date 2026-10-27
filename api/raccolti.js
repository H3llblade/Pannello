// Raccolta olive: archivio degli inserimenti in data/raccolti.json (fuori da git).
// Lettura e scrittura libere: per scelta dell'utente non c'è password.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readBody = require('./body');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'raccolti.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}

// Scrittura atomica: file temporaneo e poi rename, così un crash non lascia il JSON a metà
function save(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FILE);
}

// Controlla e normalizza i campi; lancia un errore con messaggio in italiano
function clean(b) {
  const num = (v, name, { required = false, min = 0 } = {}) => {
    if (v === '' || v == null) {
      if (required) throw new Error(`${name} è obbligatorio`);
      return null;
    }
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < min) throw new Error(`${name} non è un numero valido`);
    return Math.round(n * 100) / 100;
  };

  const year = Number(b.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error("L'anno non è valido");
  const kg = num(b.kg, 'Il peso delle olive', { required: true });
  if (kg <= 0) throw new Error('Il peso delle olive deve essere maggiore di zero');
  const liters = num(b.liters, "L'olio prodotto", { required: true });
  const yieldPct = num(b.yieldPct, 'La resa');
  if (yieldPct != null && yieldPct > 100) throw new Error('La resa non può superare il 100%');

  return { year, kg, cost: num(b.cost, 'Il costo'), yieldPct, liters };
}

// Gestisce /api/raccolti e /api/raccolti/<id>; restituisce true se la richiesta era sua
module.exports = function raccolti(req, res, url, send) {
  const m = url.pathname.match(/^\/api\/raccolti(?:\/([\w-]+))?$/);
  if (!m) return false;
  const id = m[1];
  const json = (code, data) => send(res, code, JSON.stringify(data), 'application/json; charset=utf-8');

  if (req.method === 'GET' && !id) return json(200, load()), true;

  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return json(405, { error: 'Metodo non permesso' }), true;

  (async () => {
    const list = load();
    if (req.method === 'DELETE') {
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return json(404, { error: 'Raccolto non trovato' });
      list.splice(i, 1);
      save(list);
      return json(200, { ok: true });
    }
    const body = clean(await readBody(req));
    if (req.method === 'POST' && !id) {
      const item = { id: crypto.randomUUID(), ...body, created: Date.now() };
      list.push(item);
      save(list);
      return json(201, item);
    }
    if (req.method === 'PUT' && id) {
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return json(404, { error: 'Raccolto non trovato' });
      list[i] = { ...list[i], ...body, updated: Date.now() };
      save(list);
      return json(200, list[i]);
    }
    json(400, { error: 'Richiesta non valida' });
  })().catch((e) => json(400, { error: e.message }));
  return true;
};
