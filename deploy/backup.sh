#!/usr/bin/env bash
# Copia de seguridad en el VPS (se ejecuta a diario por cron; ver setup-vps.sh):
#   - base SQLite (copia consistente con VACUUM INTO)
#   - imágenes (tar.gz)
# Conserva las últimas 14 de cada una en /opt/kanban/backups.
set -euo pipefail
cd "${REMOTE_DIR:-/opt/kanban}"
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"

DB_IN_CONTAINER="$(docker compose exec -T api node src/cli.ts backup /data/backups | tail -n 1 | tr -d '\r')"
docker compose cp "api:${DB_IN_CONTAINER}" "backups/kanban-${STAMP}.db"
docker compose exec -T api rm -f "${DB_IN_CONTAINER}"

docker compose exec -T api sh -c 'mkdir -p /data/blobs && tar czf - -C /data blobs' > "backups/blobs-${STAMP}.tgz"
chmod 600 backups/*

for pattern in 'kanban-*.db' 'blobs-*.tgz'; do
  ls -1t backups/$pattern 2>/dev/null | tail -n +15 | xargs -r rm -f
done
echo "Backup OK: backups/kanban-${STAMP}.db  backups/blobs-${STAMP}.tgz"
