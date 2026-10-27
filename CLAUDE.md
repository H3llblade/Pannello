# Pannello — istruzioni per Claude

- Pannello domestico, online su https://pannello.devicloud.me (VPS, cartella `~/Pannello`).
- Nessuna dipendenza npm: `server.js` usa solo moduli built-in; il frontend è HTML/CSS/JS puro.

## Struttura (mantienila pulita)
- `public/pages/` — **solo le pagine HTML**. `/` → `index.html`, `/<nome>` → `<nome>.html`, pagina mancante → `404.html`.
- `public/widgets/` — **moduli del browser**: `style.css`, `theme.js` (nel head), `common.js` (icone, barra, tema, pulsante Home), `config.js`, `charts.js`, e uno script per pagina (`home.js`, `impostazioni.js`, `raccolta-olive.js`). Serviti su `/widgets/<file>`.
- `api/` — moduli del server (`termostato.js`, `raccolti.js`); mai serviti al browser.
- `public/widgets/icons/` — icona del sito (pulcino): favicon, apple-touch-icon, manifest; logo nella barra in alto.
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
- Veicoli: `api/veicoli.js` → `/api/veicoli` (GET/POST, PUT/DELETE `/:id`, POST `/:id/interventi`, DELETE `/:id/interventi/:iid`). Scheda con dati, scadenze (revisione, bollo, assicurazione), tagliando (ultimo + intervalli km/mesi), note e interventi. Un intervento aggiorna la scheda: km (se più alti), revisione → +2 anni a fine mese, tagliando → ultimo tagliando. Le scadenze si calcolano nel browser in `public/widgets/scadenze.js` (stati bad/warn/ok/none, 30 giorni o 1000 km), usato anche dalla Home sotto il riquadro Veicoli.
- `api/store.js`: archivio JSON condiviso (`data/<nome>.json`, scrittura atomica) usato da raccolti e veicoli.
- Termostato Bosch EasyControl: `api/termostato.js` usa il cloud Pointt (`pointt-api.bosch-thermotechnology.com`) con OAuth SingleKey ID + PKCE (client dell'app Bosch). Il login ha un captcha: l'utente lo fa una volta da Impostazioni → Termostato e incolla l'URL `com.bosch.rrc://…?code=`. Refresh token (monouso, ruota) e deviceId in `data/bosch.json`. Lettura (cache 60 s): `zones/zn1/temperatureActual`, `temperatureHeatingSetpoint`, `zones/list` (status), `heatingCircuits/hc1/powerSetpoint` (>0 = acceso), umidità `system/sensors/humidity/indoor_h1`. API: GET `/api/termostato`, POST `/login`, `/collega {url}`, `/scollega`.
- Connessione Starlink: `api/rete.js` — la VPS non può raggiungere l'antenna di casa, quindi mostra la rete del dispositivo che guarda (IP via `X-Real-IP` di nginx, provider da ip-api.com, Starlink = AS14593) e un test latenza/download/upload verso la VPS: metodo principale 6 WebSocket `/api/rete/ws?dir=down|up` (connessioni TCP separate, come Speedtest; nginx ha una location dedicata con Upgrade), ripiego con fetch `/download?mb=` e `/upload` (con HTTP/2 condividono una sola connessione e misurano meno). 8 s per direzione, primi 2 s esclusi.
- `api/body.js`: lettura del corpo JSON condivisa.

## Flusso
- **Dopo ogni modifica fai sempre commit e push su `origin/main`** (messaggi in italiano). L'utente pubblica lanciando `./deploy` **sulla VPS** in `~/Pannello` (`./deploy --setup` se cambia `scripts/setup-vps.sh`).
