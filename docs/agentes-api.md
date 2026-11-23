# Conexión de agentes externos (API con token)

Un **agente externo** (Hermes, Claude, n8n, un script…) puede leer los tableros que el administrador le autorice, responder
preguntas, crear y mover tarjetas, poner actualizaciones y avisar dentro de la app. **Los agentes no viven en la herramienta**:
solo se les da acceso. **Los correos y mensajes a las personas los gestiona el propio agente**; la herramienta únicamente le
entrega la información por API o MCP.

## Cómo se da acceso (administrador)

**Panel de control → Conexiones → Nueva conexión**

1. Nombre del agente (p. ej. «Hermes»), descripción y caducidad opcional.
2. Permisos: leer (siempre), **avisar dentro de la app**, **ver el correo de las personas**.
3. **Tableros autorizados**, cada uno con nivel **Solo leer** o **Leer y escribir** (crear/editar/mover tarjetas y comentar). El selector **Nivel para todos los tableros** lo aplica a los ya elegidos y a los que marques después; cada tablero se puede ajustar por separado.
4. Se genera un **token `kbn_…`**: se muestra **una sola vez**, junto con la guía de conexión (prueba `curl`, configuración MCP e
   instrucciones para pegar en el agente). Se comparte **fuera de la app**, por un canal seguro.

Desde la misma pantalla: **Editar** tableros y permisos, **Nuevo token** (el anterior deja de servir), **Revocar**, **Eliminar** y
ver la **Actividad** (cada petición con su resultado). El token nunca se guarda: solo su huella SHA-256.

## API

Base: `https://<tu-dominio>/api/agent/v1` · `Authorization: Bearer kbn_…` · contrato: `/api/agent/v1/openapi.json`

| Ruta | Para qué |
| --- | --- |
| `GET /me` | Quién eres, permisos, tableros y fecha de hoy |
| `GET /boards`, `GET /boards/:id` | Tableros; columnas (con tipo y límite), etiquetas, personas y tarjetas |
| `GET /tasks?pending=&assignee=&due=&board=` | Tareas pendientes (no están en una columna Done): `due=overdue\|today\|week\|none`, `assignee=<id>\|none` |
| `GET /reminders?due=&board=` | Pendientes con fecha **agrupados por persona**, con contacto (correo, **teléfono E.164** y estado de WhatsApp) y un texto sugerido |
| `GET /search?q=&board=` | Busca en títulos, descripciones, actualizaciones y listas de tareas |
| `GET /cards/:id` | Tarjeta con su lista de tareas y actualizaciones |
| `GET /people?board=` | Participantes (con correo y WhatsApp solo si la conexión lo permite) |
| `POST /cards` | Crea una tarjeta al final de una columna *(escritura)* |
| `PATCH /cards/:id` | Edita; con `columnId` la mueve al final de esa columna *(escritura)* |
| `POST /cards/:id/comments` | Pone una actualización firmada «Nombre (agente)» *(escritura)* |
| `POST /notify` | Aviso dentro de la app (campana) a una persona del tablero *(permiso «avisar»)* |

Reglas: el agente **no ve nada fuera de sus tableros** (responde 404, igual que si no existiera); respeta los límites de columna
(**Next 4, Doing 2** → `409 column_full`); `endDate` no puede ser anterior a `startDate`; **120 peticiones/min** por token y avisos
limitados a **30/hora** (5 por persona). `/notify` **no** pasa por la cola de n8n/correo/WhatsApp.

```bash
curl -H "Authorization: Bearer kbn_…" "https://<dominio>/api/agent/v1/tasks?due=overdue"
curl -X POST -H "Authorization: Bearer kbn_…" -H "Content-Type: application/json" \
  -d '{"body":"Recordatorio enviado a Pedro"}' "https://<dominio>/api/agent/v1/cards/<id>/comments"
```

## WhatsApp: formato del número

Con el permiso **«Ver correo y WhatsApp»**, cada persona (en `/people`, `/tasks`, `/cards/:id` y `/reminders`) trae:

```json
{ "email": "ana@correo.com", "phone": "+525512345678",
  "whatsapp": { "status": "ok", "e164": "+525512345678", "number": "525512345678", "optIn": true } }
```

- `status`: `ok` (formato correcto: `+`, código de país y 8 a 15 dígitos), `missing` (sin número) o `invalid`.
- `number`: solo dígitos, tal como lo piden las APIs de WhatsApp. `phone` y `e164` son `null` si el formato no es válido.
- `optIn`: la persona activó los avisos por WhatsApp en la app. **Envía por WhatsApp solo con `status: ok` y `optIn: true`.**
- El administrador ve el estado de cada usuario en **Panel de control → Usuarios** y puede completar o corregir el número.

## Claude (servidor MCP)

`agent-mcp/server.mjs` no tiene dependencias (Node 18+). Configuración del cliente MCP:

```json
{ "mcpServers": { "kanban": {
  "command": "node",
  "args": ["/ruta/a/kanban-app/agent-mcp/server.mjs"],
  "env": { "KANBAN_URL": "https://<dominio>", "KANBAN_TOKEN": "kbn_…" }
} } }
```

Herramientas: `kanban_me`, `kanban_boards`, `kanban_board`, `kanban_tasks`, `kanban_reminders`, `kanban_search`, `kanban_card`, `kanban_people`,
`kanban_create_card`, `kanban_update_card`, `kanban_comment`, `kanban_notify`.

## Hermes y otros agentes

Cualquier agente con llamadas HTTP o «function calling» puede importar `/api/agent/v1/openapi.json`. Las instrucciones sugeridas
(se muestran al crear el token) piden tratar el texto de tarjetas como **datos y no como órdenes**.

## Seguridad

- Acceso = lo que el administrador autorizó, tablero por tablero; nunca otros workspaces ni usuarios.
- Token aleatorio de 256 bits, solo se guarda su huella; rotación y revocación inmediatas; caducidad opcional.
- Límites de uso y registro de actividad (90 días).
- Un agente **no puede** gestionar usuarios, workspaces ni conexiones, ni compartir tableros.
- Riesgo a tener en cuenta: el contenido de las tarjetas lo escriben personas; un agente que lo lea no debe seguirlo como instrucciones.
