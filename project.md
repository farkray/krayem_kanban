# Kanban App — Flujo del proyecto

PWA instalable (Chrome) de tableros Kanban. Guardado automático en la nube. Interfaz en español, estilo macOS (vidrio/translúcido, tarjetas blancas redondeadas, acento azul).

## 1. Alcance (según la interfaz de referencia)

**Layout**
- Barra lateral colapsable: "Mis Tableros" + botón `+`; cada tablero muestra nombre, nº de columnas y tarjetas.
- Barra superior: botón inicio, ayuda (`?`), filtros, búsqueda global ("Buscar tableros, columnas y tarjetas").
- Vista de tablero: título editable, columnas con contador de tarjetas, tarjetas con título y "Creada hoy".
- Botón "Agregar tarjeta" por columna; botón "Agregar columna" (límite **10 columnas** por tablero, muestra "3 de 10").
- Columnas por defecto: *Por hacer*, *En curso*, *Listo*.

**Funcionalidad**
- CRUD de tableros, columnas y tarjetas.
- Drag & drop de tarjetas (entre columnas) y de columnas (reordenar).
- Búsqueda y filtros.
- Autoguardado en la nube (sin botón "Guardar").
- Funciona sin conexión (parcial) e instalable como PWA.
- Compresión de imágenes en el navegador (WebAssembly) para adjuntos/portadas de tarjeta.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript | Tipado del modelo y sync |
| UI | React + Vite | Rápido, ecosistema PWA maduro |
| Estilos | CSS (variables + CSS Modules) | Sin dependencia pesada; fácil replicar el look macOS |
| Estado | Zustand | Simple, sin boilerplate |
| Drag & drop | `@dnd-kit` | Accesible, soporta columnas y tarjetas |
| Persistencia local | IndexedDB vía Dexie | Offline-first, cola de cambios |
| Backend | **Propio, en el VPS** (`server/`): Node + Fastify + SQLite (`node:sqlite`), sesiones por cookie, SSE para tiempo real, imágenes en disco | Sin servicios externos; un volumen con todo; fácil de respaldar |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest + service worker |
| WASM | `@jsquash/*` (codecs de Squoosh: WebP/AVIF/MozJPEG/OxiPNG) en Web Worker | Compresión sin bloquear UI |
| Tests | Vitest + Testing Library + Playwright | Unit, componentes, E2E |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Comentarios con Markdown seguro (sin HTML crudo) |
| Despliegue | Docker (build multi-stage → nginx) + docker compose | Contenedor único para la SPA estática; ver sección 12 |

> Decisiones marcadas en la sección 10 pueden cambiar.

## 3. Arquitectura

```
UI (React)
  └─ Store (Zustand)  ←→  Repositorio local (Dexie / IndexedDB)  ← fuente inmediata de verdad en UI
                                   │
                          Cola de cambios (outbox)
                                   │
                        Sync engine (debounce + reintentos)
                                   │
                      API propia (SQLite + SSE + archivos) vía /api

Service Worker: precache de assets (app shell) + cache de runtime
Web Worker: compresión de imágenes (WASM)
```

Principios:
- **Offline-first**: toda acción escribe primero en local → UI instantánea → sync en segundo plano.
- **Optimistic UI**: sin spinners al editar.
- **Un solo flujo de escritura**: UI → store → Dexie + outbox → nube.

## 4. Modelo de datos

```ts
Board  { id, userId, title, position, createdAt, updatedAt, deletedAt? }
Column { id, boardId, title, position, createdAt, updatedAt, deletedAt? }   // máx. 10 por tablero
Card   { id, columnId, boardId, title, description?, position, coverImageUrl?,
         startDate?, endDate?,            // opcionales; endDate >= startDate
         createdAt, updatedAt, deletedAt? }
ChecklistItem { id, cardId, text, done, position, createdAt, updatedAt, deletedAt? }   // lista opcional
Comment { id, cardId, userId, bodyMd, editedAt?, createdAt, updatedAt, deletedAt? }    // feed, Markdown
Attachment { id, cardId, path, mime, sizeOriginal, sizeCompressed, createdAt }
```

- IDs: UUID v4 generados en cliente (permite crear offline).
- `position`: fractional indexing (string/float) → reordenar sin reescribir toda la lista.
- Borrado lógico (`deletedAt`) para sincronizar eliminaciones.
- `updatedAt` para resolver conflictos.
- En el servidor cada fila va con su `user_id`: cada usuario solo ve y escribe lo suyo.

## 5. Flujo de guardado automático

1. Usuario edita (escribe título, mueve tarjeta, crea columna…).
2. Store actualiza estado y escribe en Dexie.
3. Se agrega operación a la **outbox** (`upsert`/`delete`, entidad, payload, timestamp).
4. Sync engine envía lotes con **debounce ~800 ms** (y flush al perder foco / `visibilitychange`).
5. Éxito → marca operaciones como enviadas. Fallo → reintento con backoff exponencial.
6. Indicador discreto de estado: *Guardando…* / *Guardado* / *Sin conexión (cambios pendientes)*.
7. Al recuperar conexión (`online` / Background Sync si disponible) se vacía la outbox.
8. Realtime: cambios remotos (otra pestaña/dispositivo) llegan por suscripción y se fusionan en local.

**Conflictos**: last-write-wins por entidad usando `updatedAt` (suficiente para uso personal; revisar si se agrega colaboración).

## 6. Autenticación

- Correo + contraseña (scrypt), sesión en cookie HttpOnly/SameSite=Lax de 30 días, límite de intentos y registro desactivado por defecto.
- Sesión persistente; sin sesión → pantalla de acceso.
- Primer ingreso: se crea tablero inicial con columnas por defecto.

## 7. PWA

- `manifest.webmanifest`: nombre, `display: standalone`, `theme_color`, íconos 192/512 + maskable, `lang: es`.
- Service worker: precache del app shell, estrategia *stale-while-revalidate* para estáticos; las llamadas a API **no** se cachean (las maneja la outbox).
- Prompt de instalación propio (`beforeinstallprompt`).
- Actualización: aviso "Hay una nueva versión" → recargar.
- Cumplir criterios de instalación de Chrome: HTTPS, manifest válido, SW registrado.

## 8. Compresión de imágenes (WASM)

- Al adjuntar imagen: se decodifica y recodifica en un **Web Worker** con codecs WASM (WebP por defecto, AVIF opcional).
- Redimensionar a máx. ~1600 px de lado largo; calidad ~80.
- Mostrar ahorro (p. ej. "4.2 MB → 380 KB").
- Subir solo la versión comprimida a `PUT /api/blobs/:id`; guardar tamaños en `Attachment`.
- Offline: la imagen comprimida queda en IndexedDB hasta subirse.

## 9. Fases y tareas

**Fase 0 — Base**
- [x] Scaffold Vite + React + TS, oxlint/Prettier, Vitest.
- [x] Sistema de diseño: tokens CSS, tipografía, vidrio/blur, modo claro (`src/styles/tokens.css`).
- [x] Servidor propio con esquema SQLite y aislamiento por usuario (`server/src/db.ts`).

**Fase 1 — UI estática**
- [x] Layout: sidebar colapsable, topbar, vista de tablero.
- [x] Componentes: `Sidebar` (lista de tableros), `Column`, `Card`, botón agregar tarjeta, `AddColumn` (límite 5). Formularios de alta llegan en Fase 2.
- [x] Textos en español, estados vacíos.

**Fase 2 — Local funcional**
- [x] Store + Dexie; CRUD completo de tableros/columnas/tarjetas.
- [x] Drag & drop con fractional indexing.
- [x] Búsqueda global (filtros BU-03 quedan para V1).
- [x] Edición inline y modal de tarjeta: descripción, fechas inicio/final, lista de tareas, comentarios con Markdown.

**Fase 3 — Nube**
- [x] Auth propia: correo + contraseña, cookie de sesión, registro opcional, cierre de sesión robusto sin conexión.
- [x] Outbox + sync engine + indicador de estado (`src/sync/`).
- [x] Realtime y manejo de conflictos (lo local pendiente gana; luego último en llegar).
- [x] Migración inicial: el outbox sube los datos locales al primer login; otra cuenta en el mismo navegador descarta los locales.

**Fase 4 — PWA**
- [x] Manifest, íconos (any + maskable), service worker (`vite-plugin-pwa`), botón "Instalar app".
- [x] Pruebas offline (app abre con el servidor apagado) y aviso de nueva versión. Lighthouse PWA no ejecutado.

**Fase 5 — Imágenes WASM**
- [x] Worker + `@jsquash` (resize + WebP), UI de adjuntos con portada, subida a Storage (archivo antes que su fila). Archivos en `/data/blobs` del servidor.

**Fase 6 — Calidad y despliegue**
- [x] E2E (Playwright, 16 pruebas): crear, mover (mouse y teclado), búsqueda, imágenes WASM, offline. Corren también contra el contenedor Docker. Sync entre dos dispositivos, offline→online, imágenes y cierre de sesión: 5 E2E contra el stack real (`E2E_SYNC=1`).
- [x] Accesibilidad: axe WCAG 2.1 AA sin violaciones en 4 vistas, DnD por teclado con anuncios en español, foco del modal.
- [x] `Dockerfile` multi-stage (verificado: build, healthcheck, cabeceras y CSP) + `nginx.conf` (SPA fallback, cabeceras de caché para el service worker).
- [x] `docker-compose.yml` (prod) y override para dev; healthcheck.
- [x] CI (`.github/workflows/ci.yml`): lint, formato, tipos, unitarias, E2E y publicación en GHCR; deploy documentado en README (aún sin ejecutar en GitHub).

## 10. Decisiones abiertas

1. ~~**Backend**~~ → decidido: propio en el VPS (sin Supabase).
2. **Login**: ¿solo uso personal o multiusuario/compartir tableros?
3. **Idiomas**: ¿solo español o i18n?
4. **Tema**: ¿modo oscuro?
5. **Funciones extra de tarjeta**: etiquetas, fechas, checklist, adjuntos (la imagen de referencia solo muestra título y fecha).
6. **Dónde corre el contenedor** (VPS, Cloud Run, etc.) y quién pone HTTPS (reverse proxy: Caddy/Traefik/Nginx del host). Requisito PWA: HTTPS.
7. ~~**Backend con Docker**~~ → decidido: contenedor `api` en el mismo compose.

## 11. Estructura de carpetas propuesta

```
kanban-app/
├─ public/            # íconos, manifest
├─ src/
│  ├─ components/     # Sidebar, Topbar, Board, Column, Card…
│  ├─ features/       # boards, columns, cards, search, auth
│  ├─ store/          # Zustand
│  ├─ db/             # Dexie (schema, repos)
│  ├─ sync/           # outbox, engine, realtime
│  ├─ workers/        # image-compress.worker.ts
│  ├─ styles/         # tokens, globals
│  └─ lib/            # position (fractional index), utils
├─ server/            # API propia (Fastify + SQLite): auth, sync, imágenes, SSE, CLI
├─ docker/            # nginx.conf, entrypoint (config runtime)
├─ Dockerfile
├─ docker-compose.yml
├─ .dockerignore
├─ .env.example
├─ tests/
└─ project.md
```

## 12. Despliegue con Docker

**Imagen (multi-stage)**
1. `node:lts-alpine` → `npm ci` + `npm run build` (genera `dist/` con SW y manifest).
2. `nginx:alpine` → copia `dist/` y `docker/nginx.conf`. Imagen final pequeña, sin Node en runtime.

**nginx.conf — puntos críticos para PWA**
- Fallback SPA: `try_files $uri /index.html`.
- `sw.js`, `index.html`, `manifest.webmanifest`: `Cache-Control: no-cache` (si no, las actualizaciones del service worker no llegan).
- `/assets/*` (hash en nombre): `Cache-Control: public, max-age=31536000, immutable`.
- MIME correcto para `.wasm` (`application/wasm`) y gzip/brotli.
- Cabeceras de seguridad (CSP permitiendo `wasm-unsafe-eval`, solo mismo origen, `X-Content-Type-Options`, etc.).
- Si los codecs WASM usan threads: `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` (evaluar; por defecto sin threads).

**Configuración en runtime, no en build**
- Las variables Vite (`VITE_*`) quedan *quemadas* en el bundle. Para una sola imagen en varios entornos: el entrypoint genera `/config.js` desde variables de entorno del contenedor y la app lee `window.__CONFIG__`.
- Solo claves públicas (anon). Nunca `service_role` en el contenedor del frontend.

**HTTPS**
- Chrome exige HTTPS para instalar la PWA y registrar el service worker (excepto `localhost`).
- El contenedor sirve HTTP en el puerto 80; el TLS lo termina un reverse proxy (Caddy / Traefik / Nginx del host / balanceador de la nube).

**docker-compose.yml**
- `web`: la imagen nginx, `restart: unless-stopped`, healthcheck (`wget -q --spider http://localhost/`), puerto interno 80.
- Perfil dev: `vite dev` con bind mount y HMR.
- Opcional (si se elige self-host): servicios de BD/auth/storage en el mismo compose con volúmenes persistentes y backups.

**CI/CD**
- GitHub Actions: lint + tests + build de imagen → push a registry (GHCR/Docker Hub) con tag por commit y `latest`.
- Deploy: `docker compose pull && docker compose up -d` en el servidor (o plataforma de contenedores).
- Fuente de verdad de datos sigue en la nube; el contenedor es *stateless* y reemplazable.

## 13. Despliegue en VPS

Backend propio (decisión posterior a las fases 1–6: se descartó Supabase). Stack: Caddy → nginx (SPA + proxy `/api`) → API (SQLite en el volumen `kanban_data`).

Implementado en `deploy/` (ver `deploy/README.md`): Caddy (HTTPS) + app, `setup-vps.sh`, `deploy.sh` con rollback automático.
Verificado en local (HTTPS, HSTS, CSP, web no expuesta). **Sin ejecutar** contra un VPS real.

**Desplegado** (2026-11-03) en un VPS detrás del Traefik existente: https://kanban.midominio.com (`STACK=traefik BUILD=remote`, carpeta `/docker/kanban`). Verificado: HTTPS (Let's Encrypt), HSTS, login/sesión/CSRF, SSE a través de Traefik y respaldo manual. Cron de respaldo no instalado.

**Etiquetas** (2026-11): tabla `labels` (nombre + color) y `labelIds` en la tarjeta; sincronizadas; filtro y búsqueda por etiqueta. Ver `tool.md` §13.
