# Pannello — istruzioni per Claude

- Pannello domestico futuristico, online su https://pannello.devicloud.me (VPS, cartella `~/Pannello`).
- Nessuna dipendenza npm: `server.js` usa solo moduli built-in; il frontend è HTML/CSS/JS puro in `public/`.
- Nuove pagine: `public/<nome>.html` (servita su `/<nome>`), copiando la struttura di `veicoli.html` (`theme.js` nel head, `<header id="topbar">`, `.page-head` con h1, `common.js`). Il pulsante "← Home" viene aggiunto in automatico da `common.js` in ogni pagina tranne la Home. Le sezioni della Home (riquadri che aprono una pagina, stessa scheda) stanno in `sections` di `public/config.js`; la barra in alto (`PAGES` in common.js) contiene solo Home e Impostazioni.
- Stile: incrocio Apple / smart home — riquadri morbidi, font di sistema/Inter, icone SVG in `ICONS` (common.js). Colori solo come token in `:root` di `public/style.css`, con varianti scure (media query + `[data-theme=dark]`). Tema chiaro/scuro salvato in localStorage `pannello-theme`. Testi in italiano.
- La Home non mostra dati del server: quelli stanno in Impostazioni.
- In Impostazioni ogni sezione è una tendina `<details class="group drop">` con `<summary class="row">` (icona + titolo + valore riassuntivo) e contenuto in `.drop-body`.
- Meteo: Galluzzo, Firenze (`public/config.js`).
- **Dopo ogni modifica fai sempre commit e push su `origin/main`** (messaggi di commit in italiano). Per pubblicare, l'utente lancia `./deploy` **sulla VPS** dentro `~/Pannello`: scarica da GitHub e riavvia.
- Termostato Bosch: letto dalla VPS via cloud Bosch in `termostato.js` (cache 60 s), esposto su `/api/termostato` come `{connected, indoor, target, heating, updated}`. Credenziali in `~/Pannello/.env` sulla VPS (gitignored, caricato da systemd con `EnvironmentFile`). Provider ancora da scegliere: manca sapere quale app Bosch usa l'utente.
