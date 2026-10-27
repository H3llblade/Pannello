// Veicoli di casa: schede con scadenze (revisione, bollo, assicurazione, tagliando) e registro interventi.
// Archivio in data/veicoli.json. Come per i raccolti, nessuna password per scelta dell'utente.
//   GET    /api/veicoli                      elenco
//   POST   /api/veicoli                      nuovo veicolo
//   PUT    /api/veicoli/<id>                 modifica
//   DELETE /api/veicoli/<id>                 elimina
//   POST   /api/veicoli/<id>/interventi      nuovo intervento (aggiorna km, revisione, tagliando)
//   DELETE /api/veicoli/<id>/interventi/<iid>
const crypto = require('crypto');
const readBody = require('./body');
const { load, save } = require('./store')('veicoli');

const TYPES = ['auto', 'moto', 'furgone', 'camper', 'trattore', 'altro'];
const FUELS = ['', 'benzina', 'diesel', 'gpl', 'metano', 'ibrida', 'elettrica', 'altro'];
const TIRES = ['', 'estive', 'invernali', '4stagioni'];
const JOBS = ['tagliando', 'revisione', 'gomme', 'riparazione', 'carrozzeria', 'altro'];

// --- Validazione (messaggi in italiano) ---
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const oneOf = (v, list, name) => {
  const x = text(v, 20).toLowerCase();
  if (!list.includes(x)) throw new Error(`${name} non valido`);
  return x;
};
function num(v, name, { int = false, max = 1e9 } = {}) {
  if (v === '' || v == null) return null;
  // per i numeri interi (km, anni) il punto è il separatore delle migliaia: «85.000» = 85000
  const raw = String(v).trim();
  const n = Number(int ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${name} non è un numero valido`);
  return int ? Math.round(n) : Math.round(n * 100) / 100;
}
function date(v, name) {
  const s = text(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error(`${name}: data non valida`);
  return s;
}

function cleanVehicle(b) {
  const name = text(b.name, 40);
  if (!name) throw new Error('Dai un nome al veicolo (es. «Panda di casa»)');
  const year = num(b.year, "L'anno", { int: true, max: 2100 });
  if (year != null && year < 1900) throw new Error("L'anno non è valido");
  return {
    type: oneOf(b.type || 'auto', TYPES, 'Il tipo'),
    name,
    brand: text(b.brand, 40),
    model: text(b.model, 40),
    plate: text(b.plate, 12).toUpperCase().replace(/\s+/g, ''),
    year,
    fuel: oneOf(b.fuel || '', FUELS, "L'alimentazione"),
    km: num(b.km, 'I km', { int: true }),
    owner: text(b.owner, 60),
    vin: text(b.vin, 17).toUpperCase(),
    revisione: date(b.revisione, 'Scadenza revisione'),
    bollo: date(b.bollo, 'Scadenza bollo'),
    insCompany: text(b.insCompany, 60),
    insPolicy: text(b.insPolicy, 40),
    insExpiry: date(b.insExpiry, 'Scadenza assicurazione'),
    insCost: num(b.insCost, "Il costo dell'assicurazione"),
    lastServiceDate: date(b.lastServiceDate, 'Ultimo tagliando'),
    lastServiceKm: num(b.lastServiceKm, 'I km dell\'ultimo tagliando', { int: true }),
    serviceKm: num(b.serviceKm, "L'intervallo in km", { int: true }) ?? 15000,
    serviceMonths: num(b.serviceMonths, "L'intervallo in mesi", { int: true, max: 120 }) ?? 12,
    tires: oneOf(b.tires || '', TIRES, 'Il tipo di gomme'),
    notes: text(b.notes, 1000),
  };
}

function cleanJob(b) {
  const d = date(b.date, "Data dell'intervento");
  if (!d) throw new Error("Inserisci la data dell'intervento");
  return {
    date: d,
    type: oneOf(b.type || 'altro', JOBS, "Il tipo d'intervento"),
    km: num(b.km, 'I km', { int: true }),
    cost: num(b.cost, 'Il costo'),
    notes: text(b.notes, 300),
  };
}

// revisione: la successiva scade dopo 2 anni, a fine mese
function plusYearsEndOfMonth(iso, years) {
  const d = new Date(iso + 'T12:00:00Z');
  const end = new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

// Un intervento aggiorna la scheda: km, scadenza revisione, ultimo tagliando
function applyJob(v, job) {
  if (job.km != null && (v.km == null || job.km > v.km)) v.km = job.km;
  if (job.type === 'revisione') {
    const next = plusYearsEndOfMonth(job.date, 2);
    if (!v.revisione || next > v.revisione) v.revisione = next;
  }
  if (job.type === 'tagliando' && (!v.lastServiceDate || job.date >= v.lastServiceDate)) {
    v.lastServiceDate = job.date;
    if (job.km != null) v.lastServiceKm = job.km;
  }
}

module.exports = function veicoli(req, res, url, send) {
  const m = url.pathname.match(/^\/api\/veicoli(?:\/([\w-]+))?(?:\/interventi(?:\/([\w-]+))?)?$/);
  if (!m) return false;
  const [, id, jobId] = m;
  const isJobs = url.pathname.includes('/interventi');
  const json = (code, data) => send(res, code, JSON.stringify(data), 'application/json; charset=utf-8');

  if (req.method === 'GET' && !id) return json(200, load()), true;

  (async () => {
    const list = load();
    const v = id ? list.find((x) => x.id === id) : null;
    if (id && !v) return json(404, { error: 'Veicolo non trovato' });

    if (isJobs) {
      if (req.method === 'POST' && !jobId) {
        const job = { id: crypto.randomUUID(), ...cleanJob(await readBody(req)) };
        v.interventi = [...(v.interventi || []), job];
        applyJob(v, job);
        save(list);
        return json(201, v);
      }
      if (req.method === 'DELETE' && jobId) {
        v.interventi = (v.interventi || []).filter((j) => j.id !== jobId);
        save(list);
        return json(200, v);
      }
      return json(405, { error: 'Metodo non permesso' });
    }

    if (req.method === 'POST' && !id) {
      const item = { id: crypto.randomUUID(), ...cleanVehicle(await readBody(req)), interventi: [], created: Date.now() };
      list.push(item);
      save(list);
      return json(201, item);
    }
    if (req.method === 'PUT' && v) {
      Object.assign(v, cleanVehicle(await readBody(req)), { updated: Date.now() });
      save(list);
      return json(200, v);
    }
    if (req.method === 'DELETE' && v) {
      list.splice(list.indexOf(v), 1);
      save(list);
      return json(200, { ok: true });
    }
    json(405, { error: 'Metodo non permesso' });
  })().catch((e) => json(400, { error: e.message }));
  return true;
};
