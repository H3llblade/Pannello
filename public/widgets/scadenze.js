// Scadenze dei veicoli (revisione, bollo, assicurazione, tagliando): usato dalla pagina Veicoli e dalla Home.
const DUE_WARN_DAYS = 30; // entro quanti giorni una scadenza diventa «in arrivo»
const DUE_WARN_KM = 1000;

function daysTo(iso) {
  const t = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 864e5);
}

function addMonths(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Prossimo tagliando: per data (ultimo + mesi) e per km (ultimo + intervallo), vale il primo che arriva
function nextService(v) {
  return {
    date: v.lastServiceDate && v.serviceMonths ? addMonths(v.lastServiceDate, v.serviceMonths) : null,
    km: v.lastServiceKm != null && v.serviceKm ? v.lastServiceKm + v.serviceKm : null,
  };
}

// Elenco delle scadenze di un veicolo con stato: 'bad' (scaduta), 'warn' (in arrivo), 'ok', 'none' (non inserita)
function deadlines(v) {
  const byDate = (key, label, date) => {
    if (!date) return { key, label, date: null, days: null, status: 'none' };
    const days = daysTo(date);
    return { key, label, date, days, status: days < 0 ? 'bad' : days <= DUE_WARN_DAYS ? 'warn' : 'ok' };
  };
  const out = [
    byDate('revisione', 'Revisione', v.revisione),
    byDate('bollo', 'Bollo', v.bollo),
    byDate('assicurazione', 'Assicurazione', v.insExpiry),
  ];
  const next = nextService(v);
  const service = byDate('tagliando', 'Tagliando', next.date);
  if (next.km != null && v.km != null) {
    service.kmLeft = next.km - v.km;
    service.nextKm = next.km;
    const kmStatus = service.kmLeft < 0 ? 'bad' : service.kmLeft <= DUE_WARN_KM ? 'warn' : 'ok';
    const rank = { none: 0, ok: 1, warn: 2, bad: 3 };
    if (rank[kmStatus] > rank[service.status]) service.status = kmStatus;
  }
  out.push(service);
  return out;
}

// Testo breve dello stato, es. «Scaduta da 3 giorni», «Tra 12 giorni», «12/05/2027»
function dueText(d) {
  if (d.status === 'none') return 'Non inserita';
  const parts = [];
  if (d.date) {
    const n = Math.abs(d.days);
    if (d.days < 0) parts.push(`Scaduta da ${n} ${n === 1 ? 'giorno' : 'giorni'}`);
    else if (d.days === 0) parts.push('Scade oggi');
    else if (d.days <= DUE_WARN_DAYS) parts.push(`Tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`);
    else parts.push(new Date(d.date + 'T00:00:00').toLocaleDateString('it-IT'));
  }
  if (d.kmLeft != null && (d.status !== 'ok' || !d.date)) {
    const km = Math.abs(d.kmLeft).toLocaleString('it-IT');
    parts.push(d.kmLeft < 0 ? `superato di ${km} km` : `tra ${km} km`);
  }
  return parts.join(' · ');
}

const DUE_ICON = { bad: 'alert', warn: 'clock', ok: 'check', none: 'minus' };
// pillola con icona + testo (lo stato non è mai indicato solo dal colore)
function duePill(d) {
  return `<span class="due due-${d.status}">${icon(DUE_ICON[d.status])}${dueText(d)}</span>`;
}

// Riepilogo per tutti i veicoli: { bad, warn } conteggi
function dueSummary(list) {
  const all = list.flatMap((v) => deadlines(v));
  return { bad: all.filter((d) => d.status === 'bad').length, warn: all.filter((d) => d.status === 'warn').length };
}
