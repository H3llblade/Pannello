// Veicoli: schede dei mezzi di casa, scadenze, registro interventi.
const $ = (id) => document.getElementById(id);

let vehicles = [];
let current = null; // id del veicolo aperto nella scheda

const TYPE = {
  auto: { label: 'Auto', icon: 'car', color: '#0a84ff' },
  moto: { label: 'Moto', icon: 'moto', color: '#ff375f' },
  furgone: { label: 'Furgone', icon: 'truck', color: '#5e5ce6' },
  camper: { label: 'Camper', icon: 'truck', color: '#30b0c7' },
  trattore: { label: 'Mezzo agricolo', icon: 'tractor', color: '#34a853' },
  altro: { label: 'Veicolo', icon: 'car', color: '#8e8e93' },
};
const FUEL = { benzina: 'Benzina', diesel: 'Diesel', gpl: 'GPL', metano: 'Metano', ibrida: 'Ibrida', elettrica: 'Elettrica', altro: 'Altro' };
const TIRES = { estive: 'Estive', invernali: 'Invernali', '4stagioni': '4 stagioni' };
const JOB = { tagliando: 'Tagliando', revisione: 'Revisione', gomme: 'Gomme', riparazione: 'Riparazione', carrozzeria: 'Carrozzeria', altro: 'Altro' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kmFmt = (n) => (n == null ? '—' : `${n.toLocaleString('it-IT')} km`);
const eur = (n) => (n == null ? '—' : `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);
const dmy = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT') : '—');
const type = (v) => TYPE[v.type] || TYPE.altro;

// Targa in stile europeo; le targhe italiane AB123CD vengono spaziate «AB 123 CD»
function plate(p) {
  if (!p) return '';
  const it = /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}` : p;
  return `<span class="plate"><i>I</i><b>${esc(it)}</b></span>`;
}

// --- Avvisi ---
let errTimer;
function pageError(msg) {
  $('page-error').textContent = msg;
  $('page-error').hidden = false;
  clearTimeout(errTimer);
  errTimer = setTimeout(() => ($('page-error').hidden = true), 6000);
}

async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  } catch {
    throw new Error('il server non risponde');
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'operazione non riuscita');
  return out;
}

// --- Caricamento e pagina ---
async function load() {
  try {
    vehicles = await api('/api/veicoli');
  } catch (e) {
    pageError(`Impossibile caricare i veicoli: ${e.message}.`);
  }
  render();
  if (current && $('card-modal').open) renderCard();
}

function render() {
  $('empty').hidden = vehicles.length > 0;
  $('content').hidden = vehicles.length === 0;
  renderDue();
  $('vehicles').innerHTML = [...vehicles]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .map((v) => {
      const t = type(v);
      const sub = [v.brand, v.model].filter(Boolean).join(' ') || t.label;
      return `<button class="tile vehicle" type="button" data-open="${v.id}">
        <div class="vehicle-top">
          <span class="dot-icon" style="--c:${t.color}">${icon(t.icon)}</span>
          ${plate(v.plate)}
        </div>
        <div class="vehicle-name">${esc(v.name)}</div>
        <div class="vehicle-sub">${esc(sub)}${v.km != null ? ' · ' + kmFmt(v.km) : ''}</div>
        <div class="vehicle-dues">
          ${deadlines(v).map((d) => `<div class="vehicle-due"><span>${d.label}</span>${duePill(d)}</div>`).join('')}
        </div>
      </button>`;
    })
    .join('');
}

// Elenco delle scadenze scadute o in arrivo di tutti i veicoli, dalla più urgente
function renderDue() {
  const rows = vehicles
    .flatMap((v) => deadlines(v).filter((d) => d.status === 'bad' || d.status === 'warn').map((d) => ({ v, d })))
    .sort((a, b) => (a.d.status === b.d.status ? (a.d.days ?? 0) - (b.d.days ?? 0) : a.d.status === 'bad' ? -1 : 1));
  $('due-box').hidden = rows.length === 0;
  $('due-count').textContent = `${rows.length} da sistemare`;
  $('due-rows').innerHTML = rows
    .map(({ v, d }) => `<button class="row due-row" type="button" data-open="${v.id}">
        <span class="row-label"><span class="dot-icon sm" style="--c:${type(v).color}">${icon(type(v).icon)}</span>${d.label} · ${esc(v.name)}</span>
        ${duePill(d)}
      </button>`)
    .join('');
}

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open && !open.closest('dialog')) openCard(open.dataset.open);
});

// --- Scheda del veicolo ---
const card = $('card-modal');

function openCard(id) {
  current = id;
  renderCard();
  card.showModal();
}

function renderCard() {
  const v = vehicles.find((x) => x.id === current);
  if (!v) return card.close();
  const t = type(v);
  $('card-icon').style.setProperty('--c', t.color);
  $('card-icon').innerHTML = icon(t.icon);
  $('card-title').textContent = v.name;
  $('card-sub').innerHTML = `${esc([v.brand, v.model].filter(Boolean).join(' ') || t.label)} ${plate(v.plate)}`;

  const info = (label, value) => (value == null || value === '' || value === '—' ? '' : `<div class="row"><span class="row-label">${label}</span><span class="row-value">${value}</span></div>`);
  const next = nextService(v);
  const dues = deadlines(v);
  const jobs = [...(v.interventi || [])].sort((a, b) => b.date.localeCompare(a.date));

  $('card-body').innerHTML = `
    <h3 class="rp-title">Scadenze</h3>
    <div class="group flat">
      ${dues.map((d) => `<div class="row"><span class="row-label">${d.label}</span>${duePill(d)}</div>`).join('')}
    </div>

    <h3 class="rp-title">Dati del veicolo</h3>
    <div class="group flat">
      ${info('Tipo', t.label)}
      ${info('Targa', esc(v.plate))}
      ${info('Anno', v.year)}
      ${info('Alimentazione', FUEL[v.fuel])}
      ${info('Chilometri', v.km != null ? kmFmt(v.km) : null)}
      ${info('Gomme montate', TIRES[v.tires])}
      ${info('Intestatario', esc(v.owner))}
      ${info('Telaio', esc(v.vin))}
    </div>

    <h3 class="rp-title">Assicurazione</h3>
    <div class="group flat">
      ${info('Compagnia', esc(v.insCompany)) || '<div class="row"><span class="row-note">Nessun dato inserito</span></div>'}
      ${info('Polizza', esc(v.insPolicy))}
      ${info('Scadenza', v.insExpiry ? dmy(v.insExpiry) : null)}
      ${info('Costo annuo', v.insCost != null ? eur(v.insCost) : null)}
    </div>

    <h3 class="rp-title">Tagliando</h3>
    <div class="group flat">
      ${info('Ultimo', v.lastServiceDate ? `${dmy(v.lastServiceDate)}${v.lastServiceKm != null ? ' · ' + kmFmt(v.lastServiceKm) : ''}` : 'Non inserito')}
      ${info('Prossimo', [next.date && `entro il ${dmy(next.date)}`, next.km != null && `o a ${kmFmt(next.km)}`].filter(Boolean).join(' ') || null)}
      ${info('Intervallo', `ogni ${kmFmt(v.serviceKm)} o ${v.serviceMonths} mesi`)}
    </div>

    ${v.notes ? `<h3 class="rp-title">Note</h3><p class="card-notes">${esc(v.notes)}</p>` : ''}

    <h3 class="rp-title">Interventi</h3>
    ${jobs.length ? `<div class="rp-table-wrap"><table class="rp-table">
      <thead><tr><th>Data</th><th>Tipo</th><th class="num">Km</th><th class="num">Costo</th><th>Note</th><th></th></tr></thead>
      <tbody>${jobs.map((j) => `<tr>
        <td>${dmy(j.date)}</td><td>${JOB[j.type]}</td><td class="num">${j.km != null ? kmFmt(j.km) : '—'}</td>
        <td class="num">${eur(j.cost)}</td><td class="wrap">${esc(j.notes)}</td>
        <td class="num"><button class="icon-btn sm danger" type="button" data-deljob="${j.id}" aria-label="Elimina intervento">${icon('trash')}</button></td>
      </tr>`).join('')}</tbody>
      ${jobs.some((j) => j.cost != null) ? `<tfoot><tr><td colspan="3">Totale speso</td><td class="num">${eur(jobs.reduce((s, j) => s + (j.cost || 0), 0))}</td><td colspan="2"></td></tr></tfoot>` : ''}
    </table></div>` : '<p class="rp-note">Nessun intervento registrato: usa «Aggiungi intervento» per tagliandi, revisioni, gomme, riparazioni.</p>'}
  `;
}

// conferma a doppio clic (niente finestre di conferma del browser)
function armed(btn, label) {
  if (btn.classList.contains('armed')) return true;
  const old = btn.innerHTML;
  btn.classList.add('armed');
  btn.textContent = label;
  setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = old; }, 3000);
  return false;
}

$('card-body').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-deljob]');
  if (!del || !armed(del, 'Elimina?')) return;
  try {
    await api(`/api/veicoli/${current}/interventi/${del.dataset.deljob}`, 'DELETE');
  } catch (err) {
    pageError(`Eliminazione non riuscita: ${err.message}.`);
  }
  load();
});

$('card-delete').addEventListener('click', async (e) => {
  if (!armed(e.currentTarget, 'Sicuro? Clicca ancora')) return;
  try {
    await api(`/api/veicoli/${current}`, 'DELETE');
    card.close();
  } catch (err) {
    pageError(`Eliminazione non riuscita: ${err.message}.`);
  }
  load();
});

$('card-edit').addEventListener('click', () => openForm(vehicles.find((x) => x.id === current)));
$('card-job').innerHTML = `${icon('plus')}Aggiungi intervento`;
$('card-job').addEventListener('click', openJob);
$('card-close').innerHTML = icon('close');
$('card-close').addEventListener('click', () => card.close());
card.addEventListener('click', (e) => { if (e.target === card) card.close(); });

// --- Popup veicolo ---
const modal = $('form-modal');
const form = $('form');
let editing = null;

function openForm(v = null) {
  editing = v;
  form.reset();
  $('form-error').hidden = true;
  $('form-title').textContent = v ? `Modifica ${v.name}` : 'Nuovo veicolo';
  for (const el of form.elements) {
    if (!el.name) continue;
    const val = v ? v[el.name] : null;
    el.value = val == null ? '' : el.name.endsWith('Km') || el.name === 'km' ? val.toLocaleString('it-IT') : String(val).replace('.', ',');
  }
  if (!v) { form.elements.type.value = 'auto'; form.elements.serviceKm.value = '15.000'; form.elements.serviceMonths.value = '12'; }
  if (v) form.elements.year.value = v.year ?? '';
  if (card.open) card.close();
  modal.showModal();
  form.elements.name.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el.value]));
  if (!body.name.trim()) {
    $('form-error').textContent = 'Dai un nome al veicolo (es. «Panda di casa»)';
    $('form-error').hidden = false;
    return;
  }
  $('form-submit').disabled = true;
  try {
    const saved = await api(editing ? `/api/veicoli/${editing.id}` : '/api/veicoli', editing ? 'PUT' : 'POST', body);
    modal.close();
    await load();
    openCard(saved.id);
  } catch (err) {
    $('form-error').textContent = err.message;
    $('form-error').hidden = false;
  } finally {
    $('form-submit').disabled = false;
  }
});

$('new-btn').innerHTML = `${icon('plus')}Nuovo veicolo`;
$('new-btn').addEventListener('click', () => openForm());
$('form-close').innerHTML = icon('close');
$('form-close').addEventListener('click', () => modal.close());
$('form-cancel').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

// --- Popup intervento ---
const jobModal = $('job-modal');
const jobForm = $('job-form');
const JOB_HINT = {
  revisione: 'La prossima revisione verrà spostata di 2 anni da questa data.',
  tagliando: 'Diventa l\'ultimo tagliando: il prossimo si calcola con gli intervalli del veicolo.',
};
const jobHint = () => ($('job-hint').textContent = JOB_HINT[jobForm.elements.type.value] || 'I km del veicolo si aggiornano se quelli inseriti sono più alti.');

function openJob() {
  const v = vehicles.find((x) => x.id === current);
  jobForm.reset();
  $('job-error').hidden = true;
  $('job-sub').textContent = v.name;
  jobForm.elements.date.value = new Date().toISOString().slice(0, 10);
  if (v.km != null) jobForm.elements.km.placeholder = v.km.toLocaleString('it-IT');
  jobHint();
  card.close();
  jobModal.showModal();
}
jobForm.elements.type.addEventListener('change', jobHint);

jobForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries([...jobForm.elements].filter((el) => el.name).map((el) => [el.name, el.value]));
  $('job-submit').disabled = true;
  try {
    await api(`/api/veicoli/${current}/interventi`, 'POST', body);
    jobModal.close();
    await load();
    openCard(current);
  } catch (err) {
    $('job-error').textContent = err.message;
    $('job-error').hidden = false;
  } finally {
    $('job-submit').disabled = false;
  }
});
const closeJob = () => { jobModal.close(); openCard(current); };
$('job-close').innerHTML = icon('close');
$('job-close').addEventListener('click', closeJob);
$('job-cancel').addEventListener('click', closeJob);
jobModal.addEventListener('click', (e) => { if (e.target === jobModal) closeJob(); });

$('empty-icon').innerHTML = icon('car');
load();
