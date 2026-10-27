# Pannello

Pannello domestico futuristico → **https://pannello.devicloud.me**

- `server.js` — server Node senza dipendenze: serve `public/` e l'API `/api/stats` (CPU, RAM, disco, uptime della VPS)
- `public/` — le pagine. Una nuova pagina `public/xyz.html` è raggiungibile su `/xyz`
- `public/config.js` — città del meteo e scorciatoie

## Sviluppo locale

```bash
node server.js        # http://127.0.0.1:3000
```

## Deploy

Prima volta:

```bash
cp deploy.env.example deploy.env   # inserisci IP/utente della VPS
./deploy --setup                   # installa Node, nginx, HTTPS e il servizio in ~/Pannello
```

Prerequisito: il record DNS `pannello.devicloud.me` deve puntare all'IP della VPS.

Ogni aggiornamento successivo:

```bash
./deploy                 # commit + push + aggiornamento VPS
./deploy "messaggio"     # con messaggio di commit
```

Sulla VPS: `systemctl status pannello`, log con `journalctl -u pannello -f`.
