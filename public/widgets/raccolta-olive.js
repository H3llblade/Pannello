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

// --- Avviso in cima alla pagina (errori di rete o del server) ---
let errTimer;
function pageError(msg) {
  $('page-error').textContent = msg;
  $('page-error').hidden = false;
  clearTimeout(errTimer);
  errTimer = setTimeout(() => ($('page-error').hidden = true), 6000);
}

// --- Caricamento ---
async function load() {
  try {
    const res = await fetch('/api/raccolti');
    if (!res.ok) throw new Error();
    entries = await res.json();
  } catch {
    pageError('Impossibile caricare i raccolti: il server non risponde.');
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
      <section class="group register-year" data-year="${y.year}">
        <button class="row register-head" type="button" data-open="${y.year}" aria-label="Apri il riepilogo del raccolto ${y.year}">
          <span class="row-label">Raccolto ${y.year}</span>
          <span class="row-value">${kgFmt(y.kg)} · ${lFmt(y.liters)} · ${pctFmt(y.yield)}${icon('chevron')}</span>
        </button>
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
  // clic sulla sezione (fuori dai pulsanti modifica/elimina) = riepilogo dell'anno
  if (!e.target.closest('[data-edit], [data-del]')) {
    const sec = e.target.closest('[data-year]');
    if (sec) return openDetail(Number(sec.dataset.year));
  }
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
  try {
    const res = await fetch(`/api/raccolti/${del.dataset.del}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
  } catch (err) {
    // TypeError = rete/server irraggiungibile; altrimenti è il messaggio del server
    pageError(`Eliminazione non riuscita: ${err instanceof TypeError || !err.message ? 'il server non risponde' : err.message}.`);
  }
  load();
});

$('view').addEventListener('change', (e) => { view = e.target.value; render(); });

// --- Riepilogo di un anno: popup + versione per la stampa (PDF) ---
const fullDate = (t) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const dash = (n, f) => (n == null ? '—' : f(n));

function reportHTML(y, years, forPrint) {
  const prev = years[years.indexOf(y) + 1];
  const list = [...y.entries].sort((a, b) => (a.created || 0) - (b.created || 0)); // ordine cronologico
  const perL = y.hasCost && y.liters ? y.cost / y.liters : null;

  const head = forPrint
    ? `<header class="rp-head">
         <div><p class="rp-kicker">Raccolta olive</p><h1>Raccolto ${y.year}</h1></div>
         <div class="rp-meta">Pannello · pannello.devicloud.me<br>Generato il ${fullDate(Date.now())}</div>
       </header>`
    : '';

  const kpi = (label, value, sub = '') => `<div class="rp-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;
  const kpis = `<div class="rp-kpis">
      ${kpi('Olive raccolte', kgFmt(y.kg), `${list.length} ${list.length === 1 ? 'inserimento' : 'inserimenti'}`)}
      ${kpi('Olio prodotto', lFmt(y.liters))}
      ${kpi('Resa', pctFmt(y.yield), `${nf((y.liters / y.kg) * 100, 1)} L al quintale`)}
      ${kpi('Costo', y.hasCost ? eurFmt(y.cost) : '—', perL != null ? `${eurFmt(perL)} al litro` : '')}
    </div>`;

  const rows = list.map((e, i) => `<tr>
      <td>${i + 1}</td>
      <td>${e.created ? new Date(e.created).toLocaleDateString('it-IT') : '—'}</td>
      <td class="num">${kgFmt(e.kg)}</td>
      <td class="num">${pctFmt(yieldOf(e.kg, e.liters))}</td>
      <td class="num">${lFmt(e.liters)}</td>
      <td class="num">${dash(e.cost, eurFmt)}</td>
      <td class="num">${e.cost != null && e.liters ? eurFmt(e.cost / e.liters) : '—'}</td>
    </tr>`).join('');
  const table = `<h3 class="rp-title">Dettaglio inserimenti</h3>
    <div class="rp-table-wrap"><table class="rp-table">
      <thead><tr><th>#</th><th>Data</th><th class="num">Olive</th><th class="num">Resa</th><th class="num">Olio</th><th class="num">Costo</th><th class="num">€/L</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Totale ${y.year}</td><td class="num">${kgFmt(y.kg)}</td><td class="num">${pctFmt(y.yield)}</td><td class="num">${lFmt(y.liters)}</td><td class="num">${y.hasCost ? eurFmt(y.cost) : '—'}</td><td class="num">${dash(perL, eurFmt)}</td></tr></tfoot>
    </table></div>`;

  // confronto con gli anni precedenti (al massimo 4)
  const older = years.slice(years.indexOf(y) + 1, years.indexOf(y) + 5);
  const diff = (cur, old) => {
    if (!old) return '';
    const d = ((cur - old) / old) * 100;
    return `<span class="rp-delta">${d > 0.05 ? '▲' : d < -0.05 ? '▼' : '='} ${nf(Math.abs(d), 0)}%</span>`;
  };
  const compare = older.length
    ? `<h3 class="rp-title">Confronto con gli anni precedenti</h3>
       <div class="rp-table-wrap"><table class="rp-table">
         <thead><tr><th>Anno</th><th class="num">Olive</th><th class="num">Olio</th><th class="num">Resa</th><th class="num">Costo</th></tr></thead>
         <tbody>
           <tr class="rp-current"><td>${y.year}</td><td class="num">${kgFmt(y.kg)}</td><td class="num">${lFmt(y.liters)}</td><td class="num">${pctFmt(y.yield)}</td><td class="num">${y.hasCost ? eurFmt(y.cost) : '—'}</td></tr>
           ${older.map((o) => `<tr><td>${o.year}</td><td class="num">${kgFmt(o.kg)} ${diff(y.kg, o.kg)}</td><td class="num">${lFmt(o.liters)} ${diff(y.liters, o.liters)}</td><td class="num">${pctFmt(o.yield)}</td><td class="num">${o.hasCost ? eurFmt(o.cost) : '—'}</td></tr>`).join('')}
         </tbody>
       </table></div>
       <p class="rp-note">Le frecce indicano la variazione del ${y.year} rispetto a ciascun anno.</p>`
    : '';

  const foot = `<p class="rp-note rp-foot">Resa = kg di olio ogni 100 kg di olive · peso specifico dell'olio ${nf(DENSITY, 3)} kg/L${
    prev ? '' : ' · primo anno registrato'}</p>`;

  return head + kpis + table + compare + foot;
}

const detail = $('detail-modal');
let detailYear = null;

function openDetail(year) {
  const years = byYear();
  const y = years.find((x) => x.year === year);
  if (!y) return;
  detailYear = year;
  $('detail-title').textContent = `Raccolto ${y.year}`;
  $('detail-sub').textContent = `${y.entries.length} ${y.entries.length === 1 ? 'inserimento' : 'inserimenti'} · ${kgFmt(y.kg)} di olive`;
  $('detail-body').innerHTML = reportHTML(y, years, false);
  detail.showModal();
}

function printReport() {
  const years = byYear();
  const y = years.find((x) => x.year === detailYear);
  if (!y) return;
  $('report').innerHTML = reportHTML(y, years, true);
  // il titolo diventa il nome proposto per il file PDF
  const title = document.title;
  document.title = `Raccolto ${y.year} – Raccolta olive`;
  detail.close();
  window.print();
  document.title = title;
}

$('detail-close').innerHTML = icon('close');
$('detail-close').addEventListener('click', () => detail.close());
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });
$('print-btn').innerHTML = `${icon('printer')}Stampa PDF`;
$('print-btn').addEventListener('click', printReport);

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
