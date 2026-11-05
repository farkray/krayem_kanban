#!/bin/sh
# Se ejecuta al arrancar el contenedor (antes de nginx):
#  1) /config.js con la config pública (API_URL; vacío = la app funciona solo en local)
#  2) cabeceras de seguridad (CSP: solo mismo origen, el API se sirve por /api)
set -eu

# Quita comillas, barras y espacios: el valor se interpola en JS.
clean() { printf '%s' "${1:-}" | tr -d '"\\ \n\r;'; }

API="$(clean "${API_URL:-}")"

cat > /usr/share/nginx/html/config.js <<JS
window.__CONFIG__ = {
  API_URL: "${API}"
};
JS

mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/security-headers.conf <<'CONF'
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
CONF
