// Parti comuni a tutte le pagine: icone, barra in alto, tema chiaro/scuro.

// Pagine del menu: per aggiungerne una crea public/<file>.html e aggiungila qui
const PAGES = [
  { href: '/', name: 'Home', icon: 'home' },
  { href: '/impostazioni', name: 'Impostazioni', icon: 'sliders' },
];

const ICONS = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  rain: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24M16 14v6M8 14v6M12 16v6"/>',
  snow: '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
  storm: '<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97M13 11l-4 6h6l-4 6"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  pencil: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4M9 18c-4.51 2-5-2-7-2"/>',
  play: '<path d="M6 3l14 9-14 9z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.link}</svg>`;
}

// --- Tema ---
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// mode: 'light' | 'dark' | 'auto'
function setTheme(mode) {
  try {
    if (mode === 'auto') localStorage.removeItem('pannello-theme');
    else localStorage.setItem('pannello-theme', mode);
  } catch {}
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  document.dispatchEvent(new CustomEvent('themechange'));
}

function themeMode() {
  return document.documentElement.dataset.theme || 'auto';
}

// --- Barra in alto ---
function renderTopbar() {
  const here = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const nav = PAGES.map(
    (p) => `<a href="${p.href}" class="${p.href === here ? 'active' : ''}">${icon(p.icon)}<span>${p.name}</span></a>`
  ).join('');
  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="/"><span class="brand-mark">${icon('home')}</span>Pannello</a>
    <nav>${nav}</nav>
    <button class="icon-btn" id="theme-toggle" type="button"></button>`;

  const btn = document.getElementById('theme-toggle');
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    btn.title = btn.ariaLabel = dark ? 'Passa al tema chiaro' : 'Passa al tema scuro';
  };
  btn.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  document.addEventListener('themechange', paint);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  paint();
}

renderTopbar();
