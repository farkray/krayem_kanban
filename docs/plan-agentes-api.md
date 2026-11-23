# Plan: acceso por API con token para agentes

## Aclaración de alcance

**Los agentes no se crean ni viven dentro de la herramienta.** Son externos (por ejemplo **Hermes** o **Claude**) y se conectan
por API. La herramienta solo deja **todo listo para esa conexión**: una **conexión con token**, los **tableros autorizados**,
una **API documentada** (OpenAPI) y un **servidor MCP** para Claude. En la interfaz se habla de **«Conexiones de agentes»**
(no de crear agentes): se registra *a qué agente externo* se da acceso y a qué tableros.

## Para qué

Que un agente externo (Hermes, Claude, n8n, un script) pueda **leer los tableros que se le autoricen**, **responder preguntas** sobre ellos y
**avisar a quienes tienen tareas pendientes** (aviso en la app y, por los canales que cada persona eligió, correo o
WhatsApp). Debe poder **autorizarse por tablero** y **revocarse** en cualquier momento.

## Lo que ya existe y se reutiliza

- **Avisos:** centro de notificaciones y cola de envío (`outbox`) que entrega por **webhook a n8n** (correo/WhatsApp) según lo
  que cada persona activó. El servidor **no envía correos por sí mismo**.
- **Resumen «Hoy»:** `GET /api/integrations/digest` con un secreto Bearer (lo usa n8n cada mañana).
- **Permisos:** dueño / editor / lector por tablero, workspaces y aislamiento entre usuarios.

## Modelo

**Conexión de agente** = una credencial de servicio (no puede iniciar sesión) que identifica a un agente externo con:
- nombre del agente externo (p. ej. «Hermes») y descripción, **dueño** (la persona que lo creó), fecha de caducidad opcional;
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

## Listo para conectar (lo que se entrega para el lado del agente)

- **Especificación OpenAPI** pública del contrato (`/api/agent/v1/openapi.json`): sirve para que Hermes u otro agente con
  herramientas/funciones genere sus llamadas sin escribir nada a mano.
- **Servidor MCP** (paquete pequeño en `agent-mcp/`, que habla con la API usando el token) con herramientas como
  `listar_tableros`, `tareas_pendientes`, `buscar`, `ver_tarjeta`, `avisar`: se registra en Claude con una línea de configuración.
- **Guía de conexión** dentro de la app (pantalla de la conexión) con el token, la URL base, un `curl` de prueba, la
  configuración de MCP lista para copiar y un **texto de instrucciones** para pegar en el agente (qué puede y qué no puede
  hacer, tono, que los textos de las tarjetas son datos y no órdenes).
- **Prueba de conexión:** botón «Probar» que llama a `/me` y muestra qué ve el agente.

## Interfaz

- Sección **Conexiones de agentes** en el menú de cuenta (visible según la decisión sobre quién puede crearlos): lista con último uso, estado
  y caducidad; **Nuevo agente** (nombre, caducidad, permisos, tableros con su nivel); el token aparece una vez con botón
  Copiar; **Regenerar**, **Revocar**, **Editar tableros** y **Actividad**.
- En **Compartir** de cada tablero, lista «Agentes con acceso» (transparencia para quien comparte).
- Documentación integrada: ejemplo `curl` y descripción de cada ruta.

## Entrega por fases

1. Datos y servidor: tablas `agents`, `agent_boards`, `agent_log`; autenticación Bearer; `/me`, `/boards`, `/tasks`, `/search`, OpenAPI.
2. Interfaz de gestión (registrar conexión, token una vez, revocar, tableros, actividad, guía y prueba de conexión).
3. **Avisos** (`/notify`) con límites y, si se decide, escritura de tarjetas y comentarios.
4. **Servidor MCP** y guía para Hermes/Claude.

## Pruebas

Servidor: token inválido/revocado/caducado, aislamiento por tablero y workspace, pérdida de acceso del dueño, límites de
tasa, nivel leer vs escribir, `/notify` solo a personas del tablero. Interfaz: crear, token visible una sola vez, revocar.
E2E: agente lee un tablero autorizado y recibe 404 en uno no autorizado.

## Decisiones tomadas

- **Solo el administrador genera las conexiones (tokens).** El administrador puede **compartirlas con usuarios**: la persona
  ve en «Mis conexiones» las que se le compartieron y puede **ver su guía de conexión, los tableros que cubre y su actividad**
  (ver «Compartir una conexión» abajo).
- **Permisos del agente (todos):** leer, responder preguntas (búsqueda), **crear y editar tarjetas**, **poner actualizaciones
  (comentarios de estado)** y **avisar** a personas del tablero. Cada conexión activa solo los permisos que el administrador
  marque, y solo sobre los **tableros autorizados**.
- **Correos: los gestiona el propio agente.** La herramienta **no envía correos ni usa SMTP**: solo da la información por **API y
  MCP** (qué tareas hay, de quién, con qué fechas, correos de contacto si el permiso «Ver contactos» está activo). `/notify`
  crea únicamente el **aviso dentro de la app** (la campana), marcado como enviado por el agente, y **no** pasa por la cola de
  n8n, para que no se dupliquen avisos si el agente ya escribe a la persona por su cuenta.
- Clientes: **Hermes y Claude** → se entrega OpenAPI y servidor MCP.

## Compartir una conexión (interpretación a confirmar)

- El administrador crea la conexión y elige **a nombre de quién actúa** (por defecto, el suyo) y los tableros autorizados; el
  alcance real es *lo concedido ∩ lo que esa persona ve*.
- **Compartirla con un usuario** = ese usuario la ve en su lista, puede **copiar la guía/URL de conexión**, ver su actividad y
  pedir **un token nuevo** (se le muestra una vez; el anterior queda revocado). El token no se muestra a quien no lo regeneró.
  Así cada usuario puede entregar su propio token a su agente sin que el administrador tenga que pasárselo.

## Preguntas abiertas

1. **Compartir tokens:** ¿basta con la interpretación de arriba (el usuario obtiene su propio token regenerándolo) o el
   administrador quiere simplemente **copiar el token y dárselo** a la persona fuera de la app?
2. «Poner actualizaciones sobre tarjetas de los status»: entiendo **actualizaciones (comentarios de estado) en tarjetas, y
   mover tarjetas entre columnas de estado**. ¿Es así?
