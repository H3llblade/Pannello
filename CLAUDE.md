# Pannello — istruzioni per Claude

- Pannello domestico, online su https://pannello.devicloud.me (VPS, cartella `~/Pannello`).
- Nessuna dipendenza npm: `server.js` usa solo moduli built-in; il frontend è HTML/CSS/JS puro.

## Struttura (mantienila pulita)
- `public/pages/` — **solo le pagine HTML**. `/` → `index.html`, `/<nome>` → `<nome>.html`, pagina mancante → `404.html`.
- `public/widgets/` — **moduli del browser**: `style.css`, `theme.js` (nel head), `common.js` (icone, barra, tema, pulsante Home), `config.js`, `charts.js`, e uno script per pagina (`home.js`, `impostazioni.js`, `raccolta-olive.js`). Serviti su `/widgets/<file>`.
- `api/` — moduli del server (`termostato.js`, `raccolti.js`); mai serviti al browser.
- `data/` — dati salvati sulla VPS (es. `raccolti.json`), fuori da git; `.env` per le credenziali, fuori da git.

## Pagine e stile
- Nuova pagina: `public/pages/<nome>.html` copiando la struttura di `veicoli.html` (`/widgets/theme.js` nel head, `<header id="topbar">`, `.page-head` con h1, `/widgets/common.js`); il suo script va in `public/widgets/<nome>.js`. Il pulsante "← Home" lo aggiunge `common.js` in ogni pagina tranne la Home.
- Sezioni della Home (riquadri che aprono una pagina, stessa scheda): `sections` in `public/widgets/config.js`. La barra in alto (`PAGES` in common.js) contiene solo Home e Impostazioni.
- Stile: incrocio Apple / smart home — riquadri morbidi, font di sistema/Inter, icone SVG in `ICONS` (common.js). Colori solo come token in `:root` di `style.css`, con varianti scure (media query + `[data-theme=dark]`). Testi in italiano, numeri in formato it-IT.
- La Home non mostra dati del server: quelli stanno in Impostazioni, dove ogni sezione è una tendina `<details class="group drop">`.
- Popup: `<dialog class="modal">`; niente `alert/confirm` (conferme a doppio clic).
- PDF: si genera con `window.print()` da un `<div class="report">` visibile solo in `@media print` (A4, sempre chiaro, classi `rp-*` condivise con il popup); `document.title` diventa il nome del file.
- Grafici: `charts.js` (`barChart`, `lineChart`), una serie per grafico in `--series-1`, evidenziazione con `--series-muted`, mai doppio asse.

## Dati
- Meteo: Galluzzo, Firenze (`config.js`); popup con mappa Windy.
- Raccolta olive: `/api/raccolti` (GET/POST, PUT/DELETE `/:id`), campi `{year, kg, cost, yieldPct, liters}`. Inserimenti dello stesso anno si sommano; anni dal più recente. Resa % = litri × `oilDensity` (0,916 kg/L) ÷ kg × 100. **Nessuna password** per scrivere: scelta esplicita dell'utente.
- Termostato Bosch: `api/termostato.js` (cache 60 s) → `/api/termostato` `{connected, indoor, target, heating, updated}`. Da collegare al cloud Bosch quando l'utente dice quale app usa; credenziali in `.env`.

## Flusso
- **Dopo ogni modifica fai sempre commit e push su `origin/main`** (messaggi in italiano). L'utente pubblica lanciando `./deploy` **sulla VPS** in `~/Pannello` (`./deploy --setup` se cambia `scripts/setup-vps.sh`).
