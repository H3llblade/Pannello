// Grafici SVG senza librerie: barre e linea, con tooltip al passaggio del mouse.
// Colori dai token CSS (--series-1, --series-muted, --border, --text-2), quindi seguono il tema.

const SVG_NS = 'http://www.w3.org/2000/svg';

function niceStep(raw) {
  const e = 10 ** Math.floor(Math.log10(raw));
  const f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

// Scala da 0 a un massimo "tondo" con ~4 righe di griglia
function scale(max) {
  const step = niceStep((max || 1) / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// Barra con angoli superiori arrotondati (4px), appoggiata alla base
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function setupChart(host, opts, draw) {
  host.classList.add('chart');
  host.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.appendChild(tip);

  const render = () => {
    host.querySelector('svg')?.remove();
    const W = host.clientWidth || 300;
    const H = opts.height || 220;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': opts.label || '' });
    host.insertBefore(svg, tip);
    draw(svg, W, H, tip);
  };
  render();
  new ResizeObserver(() => render()).observe(host);
}

function showTip(host, tip, x, y, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const max = host.clientWidth - tip.offsetWidth - 4;
  tip.style.left = `${Math.max(4, Math.min(max, x - tip.offsetWidth / 2))}px`;
  tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
}

function axes(svg, W, H, pad, sc, fmt) {
  const ih = H - pad.t - pad.b;
  for (const v of sc.ticks) {
    const y = pad.t + ih - (v / sc.top) * ih;
    el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: v === 0 ? 'axis' : 'grid' }, svg);
    el('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = fmt(v);
  }
}

/**
 * barChart(host, { labels, values, highlight, fmt, label })
 * highlight: indice della barra da evidenziare (le altre in grigio); se assente tutte colorate.
 */
function barChart(host, opts) {
  const { labels, values, fmt = String, highlight } = opts;
  setupChart(host, opts, (svg, W, H, tip) => {
    const pad = { t: 24, r: 8, b: 28, l: 52 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const sc = scale(Math.max(...values));
    axes(svg, W, H, pad, sc, fmt);

    const band = iw / values.length;
    const bw = Math.min(56, band - 2, band * 0.6);
    values.forEach((v, i) => {
      const h = (v / sc.top) * ih;
      const x = pad.l + band * i + (band - bw) / 2;
      const y = pad.t + ih - h;
      const muted = highlight != null && i !== highlight;
      el('path', { d: barPath(x, y, bw, h), class: muted ? 'bar muted' : 'bar' }, svg);
      el('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = labels[i];
      // etichetta diretta solo sulla barra evidenziata (o sull'ultima)
      if (i === (highlight ?? values.length - 1)) {
        el('text', { x: x + bw / 2, y: y - 8, 'text-anchor': 'middle', class: 'value' }, svg).textContent = fmt(v);
      }
      // area sensibile più grande della barra
      const hit = el('rect', { x: pad.l + band * i, y: pad.t, width: band, height: ih, class: 'hit' }, svg);
      hit.addEventListener('mouseenter', () => showTip(host, tip, x + bw / 2, y, `<b>${labels[i]}</b>${fmt(v)}`));
      hit.addEventListener('mouseleave', () => (tip.hidden = true));
    });
  });
}

/** lineChart(host, { labels, values, fmt, label }) */
function lineChart(host, opts) {
  const { labels, values, fmt = String } = opts;
  setupChart(host, opts, (svg, W, H, tip) => {
    const pad = { t: 24, r: 24, b: 28, l: 52 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const sc = scale(Math.max(...values));
    axes(svg, W, H, pad, sc, fmt);

    const pts = values.map((v, i) => [
      pad.l + (values.length === 1 ? iw / 2 : (iw * i) / (values.length - 1)),
      pad.t + ih - (v / sc.top) * ih,
    ]);
    labels.forEach((l, i) => {
      el('text', { x: pts[i][0], y: H - 8, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = l;
    });
    el('path', { d: 'M' + pts.map((p) => p.join(',')).join('L'), class: 'line' }, svg);
    const cross = el('line', { y1: pad.t, y2: pad.t + ih, class: 'cross', visibility: 'hidden' }, svg);
    pts.forEach(([x, y], i) => {
      el('circle', { cx: x, cy: y, r: 4, class: 'dot' }, svg);
      if (i === pts.length - 1) {
        el('text', { x, y: y - 12, 'text-anchor': 'middle', class: 'value' }, svg).textContent = fmt(values[i]);
      }
    });
    // crosshair: il punto più vicino al cursore
    const hit = el('rect', { x: pad.l - 12, y: pad.t, width: iw + 24, height: ih, class: 'hit' }, svg);
    hit.addEventListener('mousemove', (e) => {
      const box = svg.getBoundingClientRect();
      const mx = ((e.clientX - box.left) / box.width) * W;
      let i = 0;
      pts.forEach((p, j) => { if (Math.abs(p[0] - mx) < Math.abs(pts[i][0] - mx)) i = j; });
      cross.setAttribute('x1', pts[i][0]);
      cross.setAttribute('x2', pts[i][0]);
      cross.setAttribute('visibility', 'visible');
      showTip(host, tip, pts[i][0], pts[i][1], `<b>${labels[i]}</b>${fmt(values[i])}`);
    });
    hit.addEventListener('mouseleave', () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
    });
  });
}
