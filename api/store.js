// Archivio JSON in data/<nome>.json (fuori da git), condiviso dai moduli che salvano dati.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = function store(name, empty = []) {
  const file = path.join(DATA_DIR, `${name}.json`);
  return {
    load() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return structuredClone(empty); }
    },
    // scrittura atomica: file temporaneo e poi rename, così un crash non lascia il JSON a metà
    save(data) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
      fs.renameSync(file + '.tmp', file);
    },
  };
};
