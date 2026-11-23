# Plan: acceso por API con token para agentes

## Para qué

Que un agente (n8n, Claude, un script) pueda **leer los tableros que se le autoricen**, **responder preguntas** sobre ellos y
**avisar a quienes tienen tareas pendientes** (aviso en la app y, por los canales que cada persona eligió, correo o
WhatsApp). Debe poder **autorizarse por tablero** y **revocarse** en cualquier momento.

## Lo que ya existe y se reutiliza

- **Avisos:** centro de notificaciones y cola de envío (`outbox`) que entrega por **webhook a n8n** (correo/WhatsApp) según lo
  que cada persona activó. El servidor **no envía correos por sí mismo**.
- **Resumen «Hoy»:** `GET /api/integrations/digest` con un secreto Bearer (lo usa n8n cada mañana).
- **Permisos:** dueño / editor / lector por tablero, workspaces y aislamiento entre usuarios.

## Modelo

**Agente** = una credencial de servicio (no puede iniciar sesión) con:
- nombre y descripción, **dueño** (la persona que lo creó), fecha de caducidad opcional;
- **token** `kbn_…` aleatorio (256 bits): se **muestra una sola vez**; en la base solo se guarda su huella SHA-256 y los
  primeros caracteres para reconocerlo;
- **permisos (scopes)** y **tableros autorizados**, cada uno con su nivel.

**Acceso efectivo = lo concedido ∩ lo que su dueño puede ver hoy.** Si el dueño pierde un tablero (o deja el workspace), el
agente lo pierde también. Un subtablero hereda del tablero padre. Nunca ve tableros de otros workspaces ni usuarios fuera de
los tableros que tiene.

Niveles por tablero: **Leer** · **Leer y escribir** (crear/editar/mover tarjetas, comentar). Permiso aparte: **Avisar**
(enviar avisos a personas de esos tableros).

## API (`/api/agent/v1`, `Authorization: Bearer kbn_…`)

Lectura
- `GET /me` – quién es el agente, sus permisos y tableros.
- `GET /boards` y `GET /boards/:id` – columnas, tarjetas, etiquetas, asignados, fechas, listas de tareas, actualizaciones.
- `GET /tasks?pending=1&assignee=&due=overdue|today|week&board=` – **tareas pendientes** (excluye columnas «Done»), con
  responsable y fechas; es la base para «recordar a quienes tienen pendientes».
- `GET /search?q=` – búsqueda de texto en los tableros autorizados (para responder preguntas).
- `GET /people?board=` – participantes del tablero (nombre y, si el agente tiene el permiso, correo).

Escritura (solo con «Leer y escribir»)
- `POST /cards`, `PATCH /cards/:id` (título, columna, fechas, asignado, etiquetas), `POST /cards/:id/comments`.

Avisos (solo con el permiso «Avisar»)
- `POST /notify` `{ to: <persona del tablero>, cardId?, message }` → crea el **aviso en la app** y lo encola para **correo /
  WhatsApp** por el flujo de n8n y las preferencias de la persona. Solo a personas que ya comparten el tablero.

Todo lo escrito por un agente queda marcado como **«Agente <nombre> (de <dueño>)»** en comentarios, avisos y registro.

## Seguridad

- Token con huella SHA-256, comparación a tiempo constante, caducidad opcional, **revocación inmediata** y **rotación**.
- **Límites** por token (p. ej. 60 peticiones/min y tope de avisos por hora y por persona) para evitar abuso o bucles.
- **Registro de actividad** por agente (fecha, ruta, tablero, resultado, último uso) visible para su dueño y el admin.
- El agente **no** puede: gestionar usuarios, workspaces, compartir tableros, crear otros agentes ni ver correos si no tiene
  el permiso. Los textos de tarjetas son datos, no instrucciones para el agente (se documenta como riesgo de inyección).
- Solo HTTPS (ya lo exige Traefik); el token nunca se escribe en registros ni en la URL.

## Interfaz

- Sección **Agentes** en el menú de cuenta (visible según la decisión sobre quién puede crearlos): lista con último uso, estado
  y caducidad; **Nuevo agente** (nombre, caducidad, permisos, tableros con su nivel); el token aparece una vez con botón
  Copiar; **Regenerar**, **Revocar**, **Editar tableros** y **Actividad**.
- En **Compartir** de cada tablero, lista «Agentes con acceso» (transparencia para quien comparte).
- Documentación integrada: ejemplo `curl` y descripción de cada ruta.

## Entrega por fases

1. Datos y servidor: tablas `agents`, `agent_boards`, `agent_log`; autenticación Bearer; `/me`, `/boards`, `/tasks`, `/search`.
2. Interfaz de gestión (crear, token una vez, revocar, tableros, actividad).
3. Escritura (tarjetas y comentarios) y **avisos** (`/notify`) con límites.
4. Documentación y, si se quiere, un **servidor MCP** pequeño que expone estas rutas como herramientas para Claude.

## Pruebas

Servidor: token inválido/revocado/caducado, aislamiento por tablero y workspace, pérdida de acceso del dueño, límites de
tasa, nivel leer vs escribir, `/notify` solo a personas del tablero. Interfaz: crear, token visible una sola vez, revocar.
E2E: agente lee un tablero autorizado y recibe 404 en uno no autorizado.

## Preguntas abiertas

1. ¿Quién puede crear agentes: **cada usuario para sus tableros** o **solo el administrador**?
2. ¿Qué puede hacer: **solo leer y avisar**, o también **crear/editar tarjetas y comentar**?
3. **Correo:** ¿vía el flujo de n8n ya existente (según los canales de cada persona) o envío directo por SMTP?
4. ¿Con qué se va a conectar (n8n, Claude u otro)? Un servidor MCP sería la vía directa para Claude.
