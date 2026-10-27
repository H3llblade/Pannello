// Lettura del termostato di casa dal cloud Bosch.
// Le credenziali stanno in ~/Pannello/.env sulla VPS (mai su GitHub), caricato dal servizio systemd.
// Il collegamento vero va aggiunto quando sappiamo quale app Bosch è in uso
// (Bosch Smart Home, EasyControl o HomeCom Easy): finché manca, risponde "non collegato".

const CACHE_MS = 60 * 1000; // il cloud Bosch non va interrogato più di una volta al minuto
let cache = null;

async function readFromBosch() {
  // Formato atteso:
  // { connected: true, indoor: 20.5, target: 21, heating: true, updated: Date.now() }
  return { connected: false, reason: 'Termostato non ancora collegato' };
}

module.exports = async function termostato() {
  if (cache && Date.now() - cache.time < CACHE_MS) return cache.data;
  let data;
  try {
    data = await readFromBosch();
  } catch (e) {
    data = { connected: false, reason: 'Errore nella lettura dal cloud Bosch' };
    console.error('termostato:', e.message);
  }
  cache = { time: Date.now(), data };
  return data;
};
