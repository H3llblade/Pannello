#!/usr/bin/env bash
# Installazione sulla VPS (Ubuntu/Debian). Lanciato da ./deploy come root.
# Variabili: APP_DIR (cartella del repo), RUN_USER (utente del servizio), EMAIL (opzionale, per Let's Encrypt)
set -euo pipefail
DOMAIN="${DOMAIN:-pannello.devicloud.me}"
PORT="${PORT:-3087}"   # porta interna: la 3000 sulla VPS è già occupata da un'altra app
export DEBIAN_FRONTEND=noninteractive

echo "▸ Pacchetti di sistema"
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "▸ Installo Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

echo "▸ Cartella dati"
# data/ (raccolti, ecc.) e .env restano fuori da git: deploy non li tocca
mkdir -p "$APP_DIR/data"
chown "$RUN_USER": "$APP_DIR/data"

echo "▸ Servizio systemd"
cat > /etc/systemd/system/pannello.service <<EOF
[Unit]
Description=Pannello domestico
After=network.target

[Service]
ExecStart=$(command -v node) $APP_DIR/server.js
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT HOST=127.0.0.1
# credenziali (es. termostato): file opzionale, fuori da git
EnvironmentFile=-$APP_DIR/.env
Restart=always
User=$RUN_USER
ProtectSystem=strict
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q --now pannello
systemctl restart pannello

echo "▸ Nginx per $DOMAIN"
cat > /etc/nginx/sites-available/pannello <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    # test di velocità: blocchi di upload fino a 32 MB (il default di nginx è 1 MB)
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/pannello /etc/nginx/sites-enabled/pannello
nginx -t -q
systemctl reload nginx

echo "▸ Certificato HTTPS"
if [ -n "${EMAIL:-}" ]; then MAIL=(-m "$EMAIL"); else MAIL=(--register-unsafely-without-email); fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${MAIL[@]}" \
  || echo "⚠ Certbot non riuscito: verifica che il DNS di $DOMAIN punti a questa VPS, poi rilancia ./deploy --setup"

echo "✓ Pannello installato"
