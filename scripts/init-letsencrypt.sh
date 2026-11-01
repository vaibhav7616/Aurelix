#!/usr/bin/env sh
# First-time HTTPS certificate for production. Run ONCE on the server, after DNS for $DOMAIN
# points at it and ports 80/443 are open:
#
#   sh scripts/init-letsencrypt.sh
#
# nginx cannot start its https server without a certificate, so this creates a short-lived
# placeholder, starts nginx, asks Let's Encrypt for the real certificate over http, then reloads.
set -eu
ENV_FILE=${ENV_FILE:-.env.production}
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
DOMAIN=$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)
EMAIL=$(grep -E '^LETSENCRYPT_EMAIL=' "$ENV_FILE" | cut -d= -f2-)
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || { echo "set DOMAIN and LETSENCRYPT_EMAIL in $ENV_FILE"; exit 1; }
DC="docker compose --env-file $ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml"

echo "› placeholder certificate for $DOMAIN"
$DC run --rm --entrypoint sh certbot -c "mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=localhost \
  -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem"

echo "› starting the stack"
$DC up -d --build

echo "› requesting the real certificate"
$DC run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"
$DC run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email --rsa-key-size 4096

echo "› reloading nginx"
$DC exec nginx nginx -s reload
echo "done — https://$DOMAIN"
