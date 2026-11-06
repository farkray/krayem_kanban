# Kanban

Tablero Kanban en español, instalable (PWA), con guardado automático en tu propio servidor y funcionamiento sin conexión.

- **Tableros, columnas (máx. 10) y tarjetas** con arrastrar y soltar (mouse, touch y teclado).
- **Tarjeta:** fechas de inicio/final opcionales, etiquetas de color, lista de tareas opcional, feed de actualizaciones con editor de formato (Markdown) e imágenes (comprimidas en el navegador con WebAssembly).
- **Tipos de columna con límite (WIP):** Estándar (sin límite), Next (máx. 4) y Doing (máx. 2).
- **Tableros privados o compartidos:** por defecto cada tablero es privado; el dueño puede compartirlo por correo con otras cuentas como **Editor** o **Solo lectura**.
- **Búsqueda global** (`/` o `Cmd/Ctrl+K`), deshacer en todos los borrados.
- **Offline-first:** todo se guarda primero en IndexedDB y se sincroniza con tu propio servidor en segundo plano.

Documentación de diseño: [project.md](project.md) (arquitectura y fases) y [tool.md](tool.md) (funcionalidades).

## Desarrollo

```bash
npm ci && npm ci --prefix server
npm run dev        # http://localhost:5173 (modo solo local, sin cuenta)
```

| Comando | Qué hace |
|---|---|
| `npm test` | Unitarias, de componentes y del servidor (Vitest) |
| `npm run e2e` | E2E con Playwright contra el build de producción (usa tu Chrome; en CI, Chromium) |
| `npm run lint` / `npm run format:check` | oxlint / Prettier |
| `npm run build` | Tipos + build de producción (incluye el service worker) |

`E2E_BASE_URL=http://localhost:8080 npm run e2e` prueba contra una instancia ya desplegada. Los E2E de sincronización entre dispositivos necesitan el stack con API y registro abierto:

```bash
ALLOW_SIGNUP=true docker compose up -d --build
E2E_SYNC=1 E2E_BASE_URL=http://localhost:8080 npx playwright test sync
```

## Servidor de sincronización (propio, sin servicios externos)

La carpeta [server/](server/) es una API pequeña (Node 22 + Fastify + SQLite, sin base de datos externa) que corre en cualquier servidor con Docker:

- **Cuentas:** correo + contraseña (scrypt), sesión en cookie HttpOnly de 30 días, límite de intentos de acceso y registro **desactivado** por defecto.
- **Sincronización:** la app envía sus cambios (`POST /api/sync/:tabla`) y descarga por cursor; los demás dispositivos reciben los cambios en vivo por SSE (`/api/events`).
- **Imágenes:** `PUT/GET /api/blobs/:id`; el servidor comprueba la firma del archivo (no confía en el tipo declarado).
- **Compartir:** `board_members` (tablero, dueño, usuario, rol). Las filas se guardan a nombre del dueño y cada una indexa su `board_id`; el servidor decide en cada lectura/escritura quién las ve (`GET/POST /api/sync/*`, `GET /api/shares`, `POST /api/boards/:id/members`, `DELETE /api/boards/:id/members/:userId`) y en las imágenes (`/api/blobs/:id`). Solo el dueño cambia el tablero en sí; un editor escribe lo de dentro; un lector no escribe.
- **Datos:** un solo volumen (`/data`: `kanban.db` + `blobs/`). Respaldo diario incluido en el despliegue.
- **Seguridad:** comprobación de origen (CSRF), sin CORS (todo mismo origen), hash de tokens de sesión en la base.

Sin `API_URL` la app funciona **solo en local**, sin cuenta. Con servidor configurado exige iniciar sesión, y al cerrar sesión borra los datos locales del dispositivo.

```bash
# Probar todo el stack en local (http://localhost:8080, usuario admin@local.test)
ADMIN_PASSWORD=una-contraseña-larga docker compose up --build

# O en desarrollo, sin Docker (dos terminales):
npm ci --prefix server && npm run dev:server        # API en :3000
echo 'VITE_API_URL=/api' > .env.local && npm run dev  # app en :5173 (proxy /api → :3000)
```

Variables del servidor: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (usuario inicial), `ALLOW_SIGNUP` (`false`), `COOKIE_SECURE` (`true`; solo `false` en pruebas por http), `DATA_DIR` (`./data`), `PORT` (`3000`).

**Administrador:** la cuenta de `ADMIN_EMAIL` tiene el rol de administrador (se asigna en cada arranque) y ve en la barra lateral el **Panel de control** (pantalla `/admin`, con botón para volver a los tableros), desde donde crea usuarios (con contraseña propia o una temporal generada que se muestra una sola vez), les pone un **alias** (nombre para mostrar, p. ej. «Jorge Menéndez»), restablece contraseñas y elimina usuarios con todos sus datos. Un admin no puede eliminarse a sí mismo. Se puede dar o quitar el rol por CLI con `set-admin <correo> [--remove]`.

Administrar usuarios por línea de comandos (dentro del contenedor): `docker compose exec api node src/cli.ts create-user ana@correo.com --generate --alias "Ana López"` (también `set-password`, `set-alias`, `set-admin`, `delete-user`, `list-users`, `backup`).

## Docker

- **`Dockerfile`** (raíz): la SPA con nginx. Config en runtime (`/config.js`): `API_URL` (vacío = solo local). Nginx hace de proxy de `/api` hacia el contenedor `api`.
- **`server/Dockerfile`**: la API (usuario sin privilegios, volumen `/data`, healthcheck).
- `GET /healthz` (web) y `GET /api/health` (API).
- Los navegadores exigen **HTTPS** para instalar la PWA: el stack de despliegue incluye Caddy (o etiquetas para Traefik).

### Despliegue en un VPS

Guía completa, con HTTPS automático (Caddy) o detrás de un Traefik existente, despliegue por SSH, copias de seguridad y rollback: [deploy/README.md](deploy/README.md).

## CI/CD

[.github/workflows/ci.yml](.github/workflows/ci.yml): lint, formato, tipos + build, pruebas unitarias y E2E en cada PR; en `main` y tags `v*`
construye y publica las imágenes `kanban-app` y `kanban-api` en GHCR con tags `latest`, `sha-…` y de versión. El despliegue a un servidor propio lo hace `deploy/deploy.sh` (sin registry).

## Límites conocidos

- Conflictos: gana lo local pendiente; después, el último en llegar al servidor (por fila).
- Al eliminar una imagen/tarjeta el archivo queda en `/data/blobs` (el borrado es lógico).
- Dos dispositivos que inician sesión a la vez en una cuenta recién creada pueden crear cada uno su tablero inicial.
- Una imagen subida desde otro dispositivo se ve offline solo después de abrirla una vez con conexión.
