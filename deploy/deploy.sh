#!/usr/bin/env bash
# Despliega la app en el VPS sin necesitar un registry: construye las imágenes aquí (linux/amd64: app y API),
# las envía por SSH y levanta el stack con Caddy (HTTPS). Si el nuevo contenedor no queda sano,
# vuelve solo a la versión anterior. Los datos (volumen kanban_data) no se tocan.
#
#   ./deploy/deploy.sh deploy@IP                    # despliega (TAG = fecha y hora)
#   ./deploy/deploy.sh deploy@IP --rollback TAG     # vuelve a una versión ya instalada
#   ./deploy/deploy.sh deploy@IP --list             # versiones disponibles en el VPS
#
# Variables:
#   STACK=caddy|traefik   caddy (por defecto): Caddy trae su propio HTTPS (VPS limpio, ver setup-vps.sh).
#                         traefik: el VPS ya tiene Traefik; se enruta por etiquetas (REMOTE_DIR=/docker/kanban).
#   BUILD=local|remote    local (por defecto): construye aquí (PLATFORM=linux/amd64) y envía las imágenes.
#                         remote: envía el código (rsync) y construye en el VPS (rápido si tu Mac es arm64).
#   REMOTE_DIR            carpeta en el VPS (caddy: /opt/kanban; traefik: /docker/kanban)
#   SSH_OPTS              p. ej. "-p 2222 -i ~/.ssh/mi_llave"
set -euo pipefail

HOST="${1:?Uso: deploy.sh usuario@host [--rollback TAG | --list]}"
shift || true
PLATFORM="${PLATFORM:-linux/amd64}"
STACK="${STACK:-caddy}"
BUILD="${BUILD:-local}"
case "$STACK" in
  caddy) REMOTE_DIR="${REMOTE_DIR:-/opt/kanban}"; COMPOSE_SRC=docker-compose.yml ;;
  traefik) REMOTE_DIR="${REMOTE_DIR:-/docker/kanban}"; COMPOSE_SRC=docker-compose.traefik.yml ;;
  *) echo "STACK debe ser caddy o traefik." >&2; exit 2 ;;
esac
# shellcheck disable=SC2206
SSH=(ssh ${SSH_OPTS:-} "$HOST")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_IMAGE=kanban-app
API_IMAGE=kanban-api

remote() { "${SSH[@]}" "cd $REMOTE_DIR && $*"; }

compose_up() { # $1 = TAG
  remote "sed -i 's/^TAG=.*/TAG=$1/' .env && grep -q '^TAG=' .env || echo 'TAG=$1' >> .env"
  remote "docker compose up -d --remove-orphans"
}

wait_healthy() { # 0 si el contenedor web queda sano en 90 s
  for _ in $(seq 1 30); do
    status="$(remote "docker inspect --format '{{.State.Health.Status}}' \$(docker compose ps -q web) 2>/dev/null" || true)"
    [ "$status" = "healthy" ] && return 0
    sleep 3
  done
  return 1
}

case "${1:-}" in
  --list)
    remote "docker images $WEB_IMAGE --format '{{.Tag}}\t{{.CreatedSince}}'; echo; echo -n 'En uso: '; grep '^TAG=' .env"
    exit 0
    ;;
  --rollback)
    TAG="${2:?Indica el TAG (ver --list)}"
    remote "docker image inspect $WEB_IMAGE:$TAG $API_IMAGE:$TAG >/dev/null" || { echo "No existen las imágenes $TAG en el VPS." >&2; exit 1; }
    compose_up "$TAG"
    wait_healthy && echo "Rollback a $TAG: OK" || { echo "El contenedor no quedó sano." >&2; exit 1; }
    exit 0
    ;;
esac

TAG="$(date +%Y%m%d-%H%M%S)"

echo "==> Comprobando el VPS"
remote "test -f .env" || { echo "Falta $REMOTE_DIR/.env en el VPS (copia deploy/.env.example y rellénalo)." >&2; exit 1; }
PREVIOUS="$(remote "grep '^TAG=' .env | cut -d= -f2" || true)"

if [ "$BUILD" = remote ]; then
  echo "==> Enviando el código y construyendo en el VPS ($WEB_IMAGE:$TAG y $API_IMAGE:$TAG)"
  rsync -az --delete -e "ssh ${SSH_OPTS:-}" \
    --exclude node_modules --exclude dist --exclude .git --exclude e2e --exclude test-results \
    --exclude playwright-report --exclude 'server/data' --exclude deploy --exclude '*.md' --exclude '.env*' \
    "$ROOT/" "$HOST:$REMOTE_DIR/src/"
  remote "docker build -q -t $WEB_IMAGE:$TAG src && docker build -q -t $API_IMAGE:$TAG src/server"
else
  echo "==> Construyendo $WEB_IMAGE:$TAG y $API_IMAGE:$TAG ($PLATFORM)"
  docker buildx build --platform "$PLATFORM" -t "$WEB_IMAGE:$TAG" --load "$ROOT"
  docker buildx build --platform "$PLATFORM" -t "$API_IMAGE:$TAG" --load "$ROOT/server"
  echo "==> Enviando las imágenes"
  docker save "$WEB_IMAGE:$TAG" "$API_IMAGE:$TAG" | gzip | "${SSH[@]}" "gunzip | docker load"
fi

echo "==> Copiando compose y backup.sh"
scp ${SSH_OPTS:-} "$ROOT/deploy/$COMPOSE_SRC" "$HOST:$REMOTE_DIR/docker-compose.yml"
scp ${SSH_OPTS:-} "$ROOT/deploy/backup.sh" "$HOST:$REMOTE_DIR/"
[ "$STACK" = caddy ] && scp ${SSH_OPTS:-} "$ROOT/deploy/Caddyfile" "$HOST:$REMOTE_DIR/"
true

echo "==> Levantando"
compose_up "$TAG"

if wait_healthy; then
  echo "==> Sano. Limpiando versiones antiguas (se conservan las 3 últimas)"
  for img in $WEB_IMAGE $API_IMAGE; do
    remote "docker images $img --format '{{.Tag}}' | sort -r | tail -n +4 | xargs -r -I{} docker rmi $img:{} || true"
  done
  DOMAIN="$(remote "grep '^DOMAIN=' .env | cut -d= -f2" || true)"
  [ -n "$DOMAIN" ] && echo "Desplegado: https://$DOMAIN  (versión $TAG)"
else
  echo "!! El contenedor no quedó sano." >&2
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "latest" ]; then
    echo "!! Volviendo a $PREVIOUS" >&2
    compose_up "$PREVIOUS"
  fi
  remote "docker compose logs --tail=40 web" >&2 || true
  exit 1
fi
