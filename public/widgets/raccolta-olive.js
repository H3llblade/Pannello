// Raccolta olive: grafici (ultimo raccolto / tutti), registro e popup «Nuovo raccolto».
// Più inserimenti dello stesso anno vengono sommati in un unico «Raccolto <anno>».
const cfg = window.PANNELLO;
const DENSITY = cfg.oilDensity; // kg/L
const $ = (id) => document.getElementById(id);

let entries = [];
let view = 'latest'; // 'latest' | 'all' | '<anno>'

// --- Numeri in formato italiano ---
const nf = (n, d = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const kgFmt = (n) => `${nf(n)} kg`;
const lFmt = (n) => `${nf(n)} L`;
const pctFmt = (n) => `${nf(n, 1)}%`;
const eurFmt = (n) => `€ ${nf(n, n % 1 ? 2 : 0)}`;
const parse = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
// resa = kg di olio ogni 100 kg di olive
const yieldOf = (kg, liters) => (kg > 0 ? (liters * DENSITY * 100) / kg : 0);

// --- Raggruppamento per anno (dal più recente) ---
function byYear() {
  const map = new Map();
  for (const e of entries) {
    const y = map.get(e.year) || { year: e.year, kg: 0, liters: 0, cost: 0, hasCost: false, entries: [] };
    y.kg += e.kg;
    y.liters += e.liters;
    if (e.cost != null) { y.cost += e.cost; y.hasCost = true; }
    y.entries.push(e);
    map.set(e.year, y);
  }
  const years = [...map.values()].sort((a, b) => b.year - a.year);
  for (const y of years) {
    y.yield = yieldOf(y.kg, y.liters);
    y.entries.sort((a, b) => (b.created || 0) - (a.created || 0));
  }
  return years;
}

// --- Caricamento ---
async function load() {
  try {
    entries = await (await fetch('/api/raccolti')).json();
  } catch {
    entries = [];
  }
  render();
}

function render() {
  const years = byYear();
  $('empty').hidden = years.length > 0;
  $('content').hidden = years.length === 0;
  if (!years.length) return;

  if (view !== 'latest' && view !== 'all' && !years.some((y) => String(y.year) === view)) view = 'latest';
  renderSelect(years);

  const sel = view === 'all' ? null : view === 'latest' ? years[0] : years.find((y) => String(y.year) === view);
  if (sel) renderYear(sel, years);
  else renderAll(years);
  renderRegister(years);
}

function renderSelect(years) {
  const opts = [`<option value="latest">Ultimo raccolto · ${years[0].year}</option>`]
    .concat(years.slice(1).map((y) => `<option value="${y.year}">Raccolto ${y.year}</option>`))
    .concat(`<option value="all">Tutti i raccolti</option>`);
  $('view').innerHTML = opts.join('');
  $('view').value = view;
}

// --- Riquadri numerici ---
function stat(label, value, sub = '') {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-sub">${sub}</span></div>`;
}
function delta(cur, prev, prevYear) {
  if (!prev) return '';
  const d = ((cur - prev) / prev) * 100;
  const arrow = d > 0.05 ? '▲' : d < -0.05 ? '▼' : '=';
  return `${arrow} ${nf(Math.abs(d), 0)}% sul ${prevYear}`;
}

function renderYear(y, years) {
  const prev = years[years.indexOf(y) + 1];
  $('view-sub').textContent = `${y.entries.length} ${y.entries.length === 1 ? 'inserimento' : 'inserimenti'}`;
  $('stats').innerHTML = [
    stat('Olive raccolte', kgFmt(y.kg), prev ? delta(y.kg, prev.kg, prev.year) : ''),
    stat('Olio prodotto', lFmt(y.liters), prev ? delta(y.liters, prev.liters, prev.year) : ''),
    stat('Resa', pctFmt(y.yield), `${nf((y.liters / y.kg) * 100, 1)} L al quintale`),
    stat('Costo', y.hasCost ? eurFmt(y.cost) : '—', y.hasCost && y.liters ? `${eurFmt(y.cost / y.liters)} al litro` : ''),
  ].join('');

  const asc = [...years].reverse();
  renderCharts(asc, asc.indexOf(y), false);
}

function renderAll(years) {
  const kg = years.reduce((s, y) => s + y.kg, 0);
  const liters = years.reduce((s, y) => s + y.liters, 0);
  const cost = years.reduce((s, y) => s + y.cost, 0);
  const hasCost = years.some((y) => y.hasCost);
  $('view-sub').textContent = `${years.length} ${years.length === 1 ? 'anno' : 'anni'} · dal ${years.at(-1).year} al ${years[0].year}`;
  $('stats').innerHTML = [
    stat('Olive raccolte', kgFmt(kg), `media ${kgFmt(kg / years.length)} l'anno`),
    stat('Olio prodotto', lFmt(liters), `media ${lFmt(liters / years.length)} l'anno`),
    stat('Resa media', pctFmt(yieldOf(kg, liters)), `${nf((liters / kg) * 100, 1)} L al quintale`),
    stat('Costo totale', hasCost ? eurFmt(cost) : '—', hasCost && liters ? `${eurFmt(cost / liters)} al litro` : ''),
  ].join('');
  renderCharts([...years].reverse(), null, true);
}

// years in ordine crescente (asse del tempo da sinistra a destra)
function renderCharts(asc, highlight, withYield) {
  const box = $('charts');
  if (asc.length < 2) {
    box.innerHTML = '<p class="chart-empty">I grafici di confronto compaiono quando ci sono almeno due anni di raccolto.</p>';
    return;
  }
  const charts = [
    { title: 'Olive raccolte per anno', unit: 'kg', type: 'bar', values: asc.map((y) => y.kg), fmt: (v) => nf(v) },
    { title: 'Olio prodotto per anno', unit: 'litri', type: 'bar', values: asc.map((y) => y.liters), fmt: (v) => nf(v) },
  ];
  if (withYield) charts.push({ title: 'Resa per anno', unit: '%', type: 'line', values: asc.map((y) => y.yield), fmt: (v) => nf(v, 1) });

  box.innerHTML = charts
    .map((c, i) => `<section class="tile chart-card${charts.length === 3 && i === 2 ? ' full' : ''}">
        <div class="chart-head"><h3>${c.title}</h3><span>${c.unit}</span></div>
        <div id="chart-${i}"></div>
      </section>`)
    .join('');
  const labels = asc.map((y) => String(y.year));
  charts.forEach((c, i) => {
    const opts = { labels, values: c.values, fmt: c.fmt, highlight, label: c.title };
    (c.type === 'bar' ? barChart : lineChart)($(`chart-${i}`), opts);
  });
}

// --- Registro (anche come vista tabellare dei grafici) ---
function renderRegister(years) {
  $('register').innerHTML = years
    .map((y) => `
      <section class="group register-year">
        <div class="row register-head">
          <span class="row-label">Raccolto ${y.year}</span>
          <span class="row-value">${kgFmt(y.kg)} · ${lFmt(y.liters)} · ${pctFmt(y.yield)}</span>
        </div>
        ${y.entries.map((e) => `
          <div class="row entry">
            <div class="entry-main">
              <span class="entry-title">${e.created ? 'Inserito il ' + new Date(e.created).toLocaleDateString('it-IT') : 'Inserimento'}</span>
              <span class="entry-data">${kgFmt(e.kg)} · ${lFmt(e.liters)} · resa ${pctFmt(yieldOf(e.kg, e.liters))}${e.cost != null ? ' · ' + eurFmt(e.cost) : ''}</span>
            </div>
            <div class="entry-actions">
              <button class="icon-btn sm" type="button" data-edit="${e.id}" aria-label="Modifica">${icon('edit')}</button>
              <button class="icon-btn sm danger" type="button" data-del="${e.id}" aria-label="Elimina">${icon('trash')}</button>
            </div>
          </div>`).join('')}
      </section>`)
    .join('');
}

$('register').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openForm(entries.find((x) => x.id === edit.dataset.edit));
  const del = e.target.closest('[data-del]');
  if (!del) return;
  // doppio clic di conferma: il primo arma il pulsante per 3 secondi
  if (!del.classList.contains('armed')) {
    del.classList.add('armed');
    del.innerHTML = 'Elimina?';
    setTimeout(() => { if (del.isConnected) { del.classList.remove('armed'); del.innerHTML = icon('trash'); } }, 3000);
    return;
  }
  await fetch(`/api/raccolti/${del.dataset.del}`, { method: 'DELETE' });
  load();
});

$('view').addEventListener('change', (e) => { view = e.target.value; render(); });

// --- Popup «Nuovo raccolto» ---
const modal = $('form-modal');
const form = $('form');
const f = form.elements;
let editing = null;
let source = 'yieldPct'; // ultimo campo scritto tra resa e litri: l'altro si calcola

$('density-note').textContent = `Peso specifico dell'olio: ${nf(DENSITY, 3)} kg/L`;

function recalc() {
  const kg = parse(f.kg.value);
  if (!(kg > 0)) return;
  if (source === 'yieldPct') {
    const y = parse(f.yieldPct.value);
    f.liters.value = y >= 0 && y !== null ? nf((kg * y) / 100 / DENSITY, 1).replace(/\./g, '') : '';
  } else {
    const l = parse(f.liters.value);
    f.yieldPct.value = l >= 0 && l !== null ? nf(yieldOf(kg, l), 1).replace(/\./g, '') : '';
  }
}
f.kg.addEventListener('input', recalc);
f.yieldPct.addEventListener('input', () => { source = 'yieldPct'; recalc(); });
f.liters.addEventListener('input', () => { source = 'liters'; recalc(); });

const toInput = (n, d) => (n == null ? '' : nf(n, d).replace(/\./g, ''));

function openForm(entry = null) {
  editing = entry;
  form.reset();
  $('form-error').hidden = true;
  $('form-title').textContent = entry ? `Modifica raccolto ${entry.year}` : 'Nuovo raccolto';
  f.year.value = entry ? entry.year : new Date().getFullYear();
  if (entry) {
    f.kg.value = toInput(entry.kg, entry.kg % 1 ? 2 : 0);
    f.cost.value = toInput(entry.cost, entry.cost % 1 ? 2 : 0);
    f.liters.value = toInput(entry.liters, entry.liters % 1 ? 1 : 0);
    f.yieldPct.value = toInput(yieldOf(entry.kg, entry.liters), 1);
    source = 'liters';
  } else {
    source = 'yieldPct';
  }
  modal.showModal();
  f.kg.focus();
}

function fail(msg) {
  $('form-error').textContent = msg;
  $('form-error').hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const kg = parse(f.kg.value);
  const liters = parse(f.liters.value);
  const yieldPct = parse(f.yieldPct.value);
  const cost = parse(f.cost.value);
  if (!(Number(f.year.value) >= 1950)) return fail("Inserisci l'anno del raccolto");
  if (!(kg > 0)) return fail('Inserisci il peso delle olive in kg');
  if (liters == null || Number.isNaN(liters)) return fail('Inserisci la resa oppure i litri di olio');
  if ([cost, yieldPct].some(Number.isNaN)) return fail('Controlla i numeri inseriti');

  const body = { year: Number(f.year.value), kg, liters, yieldPct, cost };
  $('form-submit').disabled = true;
  try {
    const res = await fetch(editing ? `/api/raccolti/${editing.id}` : '/api/raccolti', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) return fail(out.error || 'Salvataggio non riuscito');
    modal.close();
    load();
  } catch {
    fail('Server non raggiungibile');
  } finally {
    $('form-submit').disabled = false;
  }
});

$('new-btn').innerHTML = `${icon('plus')}Nuovo raccolto`;
$('new-btn').addEventListener('click', () => openForm());
$('form-close').innerHTML = icon('close');
$('form-close').addEventListener('click', () => modal.close());
$('form-cancel').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
$('empty-icon').innerHTML = icon('leaf');

load();
