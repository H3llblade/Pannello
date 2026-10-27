# Pannello

Pannello domestico futuristico → **https://pannello.devicloud.me**

- `server.js` — server Node senza dipendenze
- `public/pages/` — le pagine HTML (`public/pages/xyz.html` è raggiungibile su `/xyz`)
- `public/widgets/` — CSS e JavaScript del browser; `config.js` contiene città del meteo, sezioni della Home e peso specifico dell'olio
- `api/` — moduli del server: stato VPS, termostato, raccolti
- `data/` — dati salvati sulla VPS (non su GitHub)

## Sviluppo locale

```bash
node server.js        # http://127.0.0.1:3000
```

## Deploy (sulla VPS)

Prima volta, nella VPS:

```bash
cd ~/Pannello && git init -q && git remote add origin https://github.com/H3llblade/Pannello.git && git fetch -q origin && git checkout -f -B main origin/main
./deploy     # installa Node, nginx, HTTPS e il servizio
```

Prerequisito per HTTPS: il record DNS `pannello.devicloud.me` deve puntare all'IP della VPS.

Ogni aggiornamento successivo, sempre nella VPS:

```bash
cd ~/Pannello && ./deploy
```

Sulla VPS: `systemctl status pannello`, log con `journalctl -u pannello -f`.
