// Impostazioni del pannello: città del meteo e sezioni della Home.
// Sezioni: href = pagina in public/ (es. /veicoli -> public/veicoli.html), icon = nome in ICONS (common.js)
window.PANNELLO = {
  city: 'Galluzzo, Firenze',
  lat: 43.738,
  lon: 11.229,
  // peso specifico dell'olio d'oliva (kg/L): converte resa % <-> litri nella Raccolta olive
  oilDensity: 0.916,
  sections: [
    { name: 'Veicoli', href: '/veicoli', icon: 'car', color: '#0a84ff' },
    { name: 'Raccolta olive', href: '/raccolta-olive', icon: 'leaf', color: '#34a853' },
  ],
};
