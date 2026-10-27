# Pannello — istruzioni per Claude

- Pannello domestico futuristico, online su https://pannello.devicloud.me (VPS, cartella `~/Pannello`).
- Nessuna dipendenza npm: `server.js` usa solo moduli built-in; il frontend è HTML/CSS/JS puro in `public/`.
- Nuove pagine: `public/<nome>.html` (servita su `/<nome>`), con la stessa topbar di `index.html`; aggiungi il link nella `<nav>` di tutte le pagine.
- Stile: palette e token in `:root` di `public/style.css` (ciano/magenta neon, card in vetro, font Orbitron/Rajdhani). Testi in italiano.
- **Dopo ogni modifica fai sempre commit e push su `origin/main`** (messaggi di commit in italiano). Per pubblicare sulla VPS l'utente lancia `./deploy` (se `deploy.env` esiste puoi lanciarlo tu).
