# Pannello — istruzioni per Claude

- Pannello domestico futuristico, online su https://pannello.devicloud.me (VPS, cartella `~/Pannello`).
- Nessuna dipendenza npm: `server.js` usa solo moduli built-in; il frontend è HTML/CSS/JS puro in `public/`.
- Nuove pagine: `public/<nome>.html` (servita su `/<nome>`), copiando la struttura di `impostazioni.html` (`theme.js` nel head, `<header id="topbar">`, `common.js`); aggiungi la pagina all'array `PAGES` in `public/common.js`.
- Stile: incrocio Apple / smart home — riquadri morbidi, font di sistema/Inter, icone SVG in `ICONS` (common.js). Colori solo come token in `:root` di `public/style.css`, con varianti scure (media query + `[data-theme=dark]`). Tema chiaro/scuro salvato in localStorage `pannello-theme`. Testi in italiano.
- La Home non mostra dati del server: quelli stanno in Impostazioni.
- In Impostazioni ogni sezione è una tendina `<details class="group drop">` con `<summary class="row">` (icona + titolo + valore riassuntivo) e contenuto in `.drop-body`.
- Meteo: Galluzzo, Firenze (`public/config.js`).
- **Dopo ogni modifica fai sempre commit e push su `origin/main`** (messaggi di commit in italiano). Per pubblicare, l'utente lancia `./deploy` **sulla VPS** dentro `~/Pannello`: scarica da GitHub e riavvia.
