# Avisos por correo y WhatsApp con n8n

El kanban avisa dentro de la app (campana) y, si el administrador lo activa, también **fuera de la app**.
No envía correos ni mensajes él mismo: manda cada aviso a un **webhook de n8n**, y n8n lo reparte.
Así el kanban no guarda ninguna contraseña SMTP ni credencial de WhatsApp.

```
 cambio en un tablero ──► el kanban detecta el aviso ──► campana (siempre)
                                   │
                                   └─► cola de envío ──► webhook de n8n ──► correo
                                       (reintentos)                     └─► WhatsApp
 cada mañana: n8n ──► GET /api/integrations/digest ──► resumen "Hoy" ──► correo / WhatsApp
```

Quién configura qué:

| Quién | Qué | Dónde |
|---|---|---|
| Administrador | URL del webhook, activar, zona horaria | Panel de control → *Avisos por correo y WhatsApp* |
| Administrador | Credenciales SMTP y de WhatsApp | n8n |
| Cada persona | Su teléfono y los canales que quiere | Barra lateral → *Avisos por correo y WhatsApp* |

## Puesta en marcha

1. En el panel de control, pulsa **Descargar flujo de n8n** (`kanban-avisos-n8n.json`, sin secretos).
2. En n8n: *Workflows → Importar desde archivo*.
3. Crea la credencial **Header Auth** del nodo *Aviso del kanban*: nombre `Authorization`, valor `Bearer ` seguido del secreto (se genera en el panel; se muestra una sola vez). Usa la misma credencial en *Pedir resumen*.
4. En *Enviar correo* elige tu credencial SMTP y cambia el remitente.
5. En *Enviar WhatsApp* pon la URL y la clave de tu pasarela (ver abajo).
6. Activa el flujo y copia la **URL de producción** del webhook al panel del kanban. Marca *Enviar avisos al webhook* y guarda.
7. Pulsa **Enviar prueba**: llega un correo y un WhatsApp al administrador (si activó sus canales).

## WhatsApp

El kanban no vincula WhatsApp. El flujo envía con una **pasarela** que tú gestionas:

- El nodo viene con el formato de **Evolution API** (`POST /message/sendText/<instancia>` con `number` y `text`). Con WAHA u otra, cambia solo ese nodo.
- El **QR** se escanea en la pasarela, no en el kanban.
- ⚠️ Vincular un número por QR es WhatsApp Web no oficial y va contra las condiciones de WhatsApp: pueden bloquear el número. Usa un número dedicado. La alternativa oficial es la API de Meta, que exige plantillas aprobadas.

## Formato del aviso

`POST` al webhook, con `Authorization: Bearer <secreto>` y JSON:

```json
{
  "event": "notification",
  "version": 1,
  "id": "…",
  "type": "mention",
  "recipient": { "id": "…", "name": "Ana López", "email": "ana@correo.com", "phone": "+525512345678" },
  "channels": ["email", "whatsapp"],
  "actor": "Jorge",
  "board": { "id": "…", "title": "Trabajo" },
  "card": { "id": "…", "title": "Banner importador" },
  "excerpt": "@Ana revisa el banner",
  "count": 1,
  "url": "https://kanban.ejemplo.com/b/…",
  "createdAt": "2026-11-08T12:00:00.000Z"
}
```

- `type`: `mention`, `assignment`, `access_granted`, `access_role`, `access_removed` y `test` (el botón de prueba).
- `channels`: solo los que la persona activó (WhatsApp requiere teléfono).
- Responde con cualquier 2xx. Si no, el kanban reintenta a 1 min, 5 min, 30 min, 2 h y 6 h; después queda como *fallido* y el panel ofrece **Reintentar fallidos**.
- Los avisos repetidos de la misma tarjeta que se funden en la campana no se vuelven a enviar.

## Resumen diario

`GET /api/integrations/digest` con el mismo `Authorization: Bearer <secreto>`. Devuelve, para cada persona que lo pidió, sus tarjetas vencidas, de hoy, de mañana y que empiezan hoy, con `subject` y `text` ya redactados. "Hoy" se calcula en la zona horaria configurada. El flujo lo pide cada mañana a las 8:00 (nodo *Cada mañana*).

## Seguridad

- El secreto se guarda en la base del servidor y nunca se devuelve, salvo al generarlo.
- Solo administradores configuran el webhook; la URL debe ser http o https y sin usuario ni contraseña.
- El webhook recibe correos y teléfonos de las personas que activaron los canales: usa n8n propio y HTTPS.
