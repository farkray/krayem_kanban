/**
 * Flujo de n8n listo para importar (Workflows → Importar desde archivo). Lo genera el servidor para
 * que siempre coincida con el formato de aviso de esta versión. No lleva ningún secreto: el token del
 * webhook, el SMTP y la pasarela de WhatsApp se configuran dentro de n8n.
 */

const EVENT_CODE = `const e = $json.body ?? $json;
const who = e.actor || 'Alguien';
const card = e.card?.title ? \` «\${e.card.title}»\` : '';
const board = e.board?.title ? \` (\${e.board.title})\` : '';
const frases = {
  mention: \`\${who} te mencionó en\${card}\${board}\`,
  assignment: \`\${who} te asignó la tarjeta\${card}\${board}\`,
  access_granted: \`\${who} te compartió el tablero \${e.board?.title ?? ''} (\${e.excerpt || 'acceso'})\`,
  access_role: \`\${who} cambió tu permiso en \${e.board?.title ?? 'un tablero'} a \${e.excerpt}\`,
  access_removed: \`\${who} te quitó el acceso a \${e.board?.title ?? 'un tablero'}\`,
  test: 'Prueba de avisos del kanban: si lo lees, el flujo funciona.',
};
const lead = frases[e.type] ?? 'Aviso del kanban';
const detail = e.type === 'mention' && e.excerpt ? \`\\n“\${e.excerpt}”\` : '';
const link = e.url ? \`\\n\${e.url}\` : '';
return {
  json: {
    name: e.recipient?.name ?? '',
    email: e.recipient?.email ?? '',
    phone: String(e.recipient?.phone ?? '').replace(/\\D/g, ''),
    channels: e.channels ?? [],
    subject: lead,
    text: lead + detail + link,
  },
};`

const DIGEST_CODE = `return {
  json: {
    name: $json.recipient.name,
    email: $json.recipient.email,
    phone: String($json.recipient.phone ?? '').replace(/\\D/g, ''),
    channels: $json.channels ?? [],
    subject: $json.subject,
    text: $json.text,
  },
};`

const ifChannel = (id: string, channel: string) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [
      {
        id,
        leftValue: `={{ $json.channels.includes('${channel}') }}`,
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      },
    ],
    combinator: 'and',
  },
  options: {},
})

export function buildN8nWorkflow(opts: { kanbanUrl: string }) {
  const base = opts.kanbanUrl.replace(/\/+$/, '') || 'https://TU-KANBAN'
  const note = (name: string, content: string, position: [number, number], w = 300, h = 220) => ({
    parameters: { content, width: w, height: h },
    id: `note-${name}`,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  })

  const nodes = [
    note(
      'Léeme',
      [
        '## Avisos del kanban por correo y WhatsApp',
        'El kanban envía un aviso a este webhook y n8n lo reparte según los canales que cada persona activó.',
        '',
        '**Antes de activarlo**',
        '1. Crea la credencial *Header Auth* del webhook: nombre `Authorization`, valor `Bearer ` + el secreto del panel del kanban.',
        '2. Elige la credencial SMTP en *Enviar correo* y cambia el remitente.',
        '3. Ajusta la URL y la clave de tu pasarela en *Enviar WhatsApp*.',
        '4. Activa el flujo, copia la URL de producción del webhook al panel del kanban y pulsa *Enviar prueba*.',
        '',
        'Cada aviso trae **un solo canal**. El webhook responde cuando termina de enviar; si el correo o WhatsApp falla, responde con error y el kanban reintenta ese envío más tarde. Las salidas *false* de los dos filtros solo significan que la persona no usa ese canal.',
      ].join('\n'),
      [-300, 40],
      360,
      330,
    ),
    note(
      'WhatsApp',
      [
        '## WhatsApp',
        'El QR se escanea en tu **pasarela** (Evolution API, WAHA u otra), no en el kanban.',
        'Este nodo usa el formato de Evolution API: `POST /message/sendText/<instancia>` con `number` y `text`. Si usas otra, cambia solo este nodo.',
        '⚠️ Vincular por QR es WhatsApp Web no oficial: WhatsApp puede bloquear el número. Con la API oficial de Meta se usan plantillas aprobadas.',
      ].join('\n'),
      [1040, 420],
      340,
      240,
    ),
    {
      parameters: {
        httpMethod: 'POST',
        path: 'kanban-avisos',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        options: {},
      },
      id: 'node-webhook',
      name: 'Aviso del kanban',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [100, 140],
      webhookId: 'kanban-avisos',
    },
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: EVENT_CODE },
      id: 'node-event',
      name: 'Preparar aviso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [340, 220],
    },
    {
      parameters: { rule: { interval: [{ field: 'days', triggerAtHour: 8 }] } },
      id: 'node-schedule',
      name: 'Cada mañana',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [100, 460],
    },
    {
      parameters: {
        url: `${base}/api/integrations/digest`,
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        options: {},
      },
      id: 'node-digest',
      name: 'Pedir resumen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [340, 460],
    },
    {
      parameters: { fieldToSplitOut: 'users', options: {} },
      id: 'node-split',
      name: 'Una persona por mensaje',
      type: 'n8n-nodes-base.splitOut',
      typeVersion: 1,
      position: [580, 460],
    },
    {
      parameters: { mode: 'runOnceForEachItem', jsCode: DIGEST_CODE },
      id: 'node-digest-prep',
      name: 'Preparar resumen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [820, 460],
    },
    {
      parameters: ifChannel('c-email', 'email'),
      id: 'node-if-email',
      name: '¿Por correo?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [820, 200],
    },
    {
      parameters: ifChannel('c-wa', 'whatsapp'),
      id: 'node-if-wa',
      name: '¿Por WhatsApp?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [820, 340],
    },
    {
      parameters: {},
      id: 'node-no-email',
      name: 'Correo no activo',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [1060, 60],
    },
    {
      parameters: {},
      id: 'node-no-wa',
      name: 'WhatsApp no activo',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: [1060, 460],
    },
    {
      parameters: {
        fromEmail: 'avisos@tu-dominio.com',
        toEmail: '={{ $json.email }}',
        subject: '={{ $json.subject }}',
        emailFormat: 'text',
        text: '={{ $json.text }}',
        options: {},
      },
      id: 'node-email',
      name: 'Enviar correo',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2.1,
      position: [1060, 180],
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://TU-PASARELA/message/sendText/TU-INSTANCIA',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'apikey', value: 'TU_CLAVE' }] },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ number: $json.phone, text: $json.text }) }}',
        options: {},
      },
      id: 'node-whatsapp',
      name: 'Enviar WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1060, 320],
    },
  ]

  const link = (node: string) => [{ node, type: 'main', index: 0 }]
  return {
    name: 'Kanban · avisos por correo y WhatsApp',
    nodes,
    connections: {
      'Aviso del kanban': {
        main: [link('Preparar aviso')],
      },
      'Preparar aviso': { main: [[...link('¿Por correo?'), ...link('¿Por WhatsApp?')]] },
      'Cada mañana': { main: [link('Pedir resumen')] },
      'Pedir resumen': { main: [link('Una persona por mensaje')] },
      'Una persona por mensaje': { main: [link('Preparar resumen')] },
      'Preparar resumen': { main: [[...link('¿Por correo?'), ...link('¿Por WhatsApp?')]] },
      // true → enviar; false → la persona no usa ese canal: no se hace nada (a propósito)
      '¿Por correo?': { main: [link('Enviar correo'), link('Correo no activo')] },
      '¿Por WhatsApp?': { main: [link('Enviar WhatsApp'), link('WhatsApp no activo')] },
    },
    active: false,
    settings: { executionOrder: 'v1' },
    pinData: {},
    meta: { templateCredsSetupCompleted: false },
  }
}
