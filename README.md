# Pannello

Pannello domestico futuristico → **https://pannello.devicloud.me**

- `server.js` — server Node senza dipendenze: serve `public/` e l'API `/api/stats` (CPU, RAM, disco, uptime della VPS)
- `public/` — le pagine. Una nuova pagina `public/xyz.html` è raggiungibile su `/xyz`
- `public/config.js` — città del meteo e scorciatoie

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
