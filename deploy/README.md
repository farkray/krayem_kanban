# Despliegue en un VPS

Hay dos variantes de `deploy.sh`, según el servidor:

| | `STACK=caddy` (por defecto) | `STACK=traefik` |
|---|---|---|
| Cuándo | VPS limpio, sin proxy | VPS que **ya tiene Traefik** (docker provider, `websecure`, resolver `letsencrypt`) |
| HTTPS | Caddy (incluido en el compose) | El Traefik existente, por etiquetas |
| Carpeta en el VPS | `/opt/kanban` | `/docker/kanban` |
| Prepara el servidor | `setup-vps.sh` | No hace falta: no se toca firewall, Docker ni otros servicios |
| Compose | `docker-compose.yml` | `docker-compose.traefik.yml` |

### Variante Traefik (VPS compartido)

```bash
# 1. En el VPS: /docker/kanban/.env  (DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, ALLOW_SIGNUP=false, TAG=latest)
# 2. Desde tu computadora (construye en el VPS: mucho más rápido si tu Mac es arm64):
STACK=traefik BUILD=remote ./deploy/deploy.sh root@IP
```

Basta con que `DOMAIN` (p. ej. `kanban.midominio.com`) tenga un registro A hacia la IP del servidor.
Los contenedores no publican puertos: Traefik llega a ellos por la red de compose. El volumen se llama `kanban_kanban_data`.
Respaldo manual: `ssh root@IP 'cd /docker/kanban && REMOTE_DIR=/docker/kanban ./backup.sh'` (no hay cron instalado en esta variante; añádelo tú si lo quieres).

---

## Variante Caddy (VPS limpio)

Todo corre en tu VPS, sin servicios externos:

```
Internet ──► Caddy (HTTPS automático) ──► nginx (app + proxy /api) ──► API (Node + SQLite)
                                                                         └─ volumen kanban_data: kanban.db + imágenes
```

No hace falta un registry: las imágenes se construyen en tu computadora y viajan por SSH.
**Lo único que hay que respaldar es el volumen `kanban_data`** (el respaldo diario ya viene configurado).

## Antes de empezar

1. **VPS** con Ubuntu 22.04/24.04 (o Debian 12). Sirve una imagen "Ubuntu + Docker": el script detecta que Docker ya está.
2. **Dominio** (o subdominio) con un registro **A** hacia la IP del VPS (en el panel DNS de tu proveedor). Comprueba: `dig +short kanban.midominio.com`.
3. **Llave SSH** añadida al VPS (en el panel de tu proveedor o con `ssh-copy-id`) para entrar como `root`.
4. Si tu proveedor tiene un **firewall externo**: permite TCP 22, TCP 80, TCP 443 y UDP 443.
5. En tu computadora: Docker con `buildx` (viene con Docker Desktop).

## 1. Preparar el servidor (una sola vez)

```bash
scp deploy/setup-vps.sh root@IP_DEL_VPS:/root/
ssh root@IP_DEL_VPS 'bash /root/setup-vps.sh'
```

Instala Docker (repositorio oficial), abre solo SSH/80/443 con `ufw`, crea el usuario `deploy` (con tu misma llave), `/opt/kanban` y un **cron de respaldo diario (03:30)**.

## 2. Configuración

```bash
scp deploy/.env.example deploy@IP_DEL_VPS:/opt/kanban/.env
ssh deploy@IP_DEL_VPS 'nano /opt/kanban/.env'
```

Rellena `DOMAIN`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` (10+ caracteres). `ALLOW_SIGNUP=false` deja el registro cerrado: solo entran las cuentas que tú crees.
Después del primer arranque puedes borrar `ADMIN_PASSWORD` del `.env` (solo se usa si el usuario aún no existe).

## 3. Desplegar

```bash
./deploy/deploy.sh deploy@IP_DEL_VPS
```

Construye `linux/amd64` (app y API), envía las imágenes, copia `docker-compose.yml`, `Caddyfile` y `backup.sh`, levanta el stack y espera a que quede sano.
**Si no queda sano, vuelve solo a la versión anterior.** Los datos no se tocan. Se conservan las 3 últimas versiones.
Si tu SSH no usa el puerto 22: `SSH_OPTS="-p 2222" ./deploy/deploy.sh deploy@IP`.

La primera vez Caddy tarda unos segundos en obtener el certificado. Abre `https://TU_DOMINIO` e inicia sesión con `ADMIN_EMAIL`.

## Usuarios

```bash
ssh deploy@IP 'cd /opt/kanban && docker compose exec api node src/cli.ts create-user ana@correo.com --generate --alias "Ana López"'
# también: set-alias <email> "Nombre" | set-password <email> | set-admin <email> [--remove] | delete-user <email> | list-users
```

El administrador (`ADMIN_EMAIL`) también puede crear y eliminar usuarios desde la app (botón **Usuarios**).

`--generate` crea una contraseña aleatoria y la muestra una vez. `set-password` cierra las sesiones de ese usuario.

## Copias de seguridad y restauración

- Diario, automático: `/opt/kanban/backups/kanban-FECHA.db` (SQLite consistente) y `blobs-FECHA.tgz` (imágenes). Se conservan 14. Registro en `backups/backup.log`.
- Manual: `ssh deploy@IP 'cd /opt/kanban && ./backup.sh'`.
- **Cópialas fuera del VPS** de vez en cuando (si el VPS se pierde, se pierden también): `scp 'deploy@IP:/opt/kanban/backups/*' ./respaldo/`.

Restaurar en un servidor nuevo (tras `setup-vps.sh` y un primer `deploy.sh`):

```bash
ssh deploy@IP 'cd /opt/kanban && docker compose stop api'
scp kanban-FECHA.db deploy@IP:/opt/kanban/backups/
ssh deploy@IP 'cd /opt/kanban &&
  docker run --rm -v kanban_data:/data -v $PWD/backups:/b alpine sh -c "rm -f /data/kanban.db-wal /data/kanban.db-shm && cp /b/kanban-FECHA.db /data/kanban.db && chown 1000:1000 /data/kanban.db"
  docker run --rm -v kanban_data:/data -v $PWD/backups:/b alpine sh -c "tar xzf /b/blobs-FECHA.tgz -C /data && chown -R 1000:1000 /data/blobs"
  docker compose start api'
```

(El nombre del volumen lleva el prefijo del proyecto de compose; compruébalo con `docker volume ls | grep kanban_data`.)

## Operación

```bash
./deploy/deploy.sh deploy@IP --list                 # versiones y cuál está en uso
./deploy/deploy.sh deploy@IP --rollback 20261103-101500
ssh deploy@IP 'cd /opt/kanban && docker compose logs -f --tail=100'
ssh deploy@IP 'cd /opt/kanban && docker compose ps'
```

Cambiar la config: edita `.env` y `ssh deploy@IP 'cd /opt/kanban && docker compose up -d'`.

## Verificación tras el despliegue

- `https://TU_DOMINIO/healthz` → `ok` y `https://TU_DOMINIO/api/health` → `{"ok":true}`.
- Candado válido y `http://` redirige a `https://`.
- Inicias sesión, creas una tarjeta, abres la app en otro dispositivo (o ventana privada) y aparece en vivo.
- Chrome ofrece "Instalar app".
- Alternativa automática (con `ALLOW_SIGNUP=true` temporalmente): `E2E_SYNC=1 E2E_BASE_URL=https://TU_DOMINIO npx playwright test sync` — crea cuentas de prueba (`e2e-…@prueba.test`); bórralas después con `delete-user`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Caddy no obtiene certificado | El DNS aún no apunta al VPS, o 80/443 bloqueados (ufw o el firewall del proveedor). Mira `docker compose logs caddy`. |
| "Correo o contraseña incorrectos" con los datos buenos | `ADMIN_PASSWORD` cambió después del primer arranque (no actualiza el usuario existente): usa `set-password`. |
| "Demasiados intentos" | 5 fallos seguidos bloquean 15 minutos ese correo (reinicia `api` para limpiarlo). |
| Entra pero no sincroniza | `docker compose logs api`. Las peticiones deben llegar por el mismo dominio (la API comprueba el origen). |
| "exec format error" | Arquitectura distinta: `PLATFORM=linux/arm64 ./deploy/deploy.sh …`. |
| Let's Encrypt "too many certificates" | No borres el volumen `caddy_data`; al probar usa un subdominio de pruebas. |
