/**
 * Número de WhatsApp de una persona. Formato correcto = internacional E.164: «+», código de país y 8 a 15 dígitos
 * (p. ej. +525512345678). Los clientes de WhatsApp (Evolution, Cloud API…) piden los dígitos sin el «+».
 */
export interface WhatsApp {
  /** `ok` = formato correcto; `missing` = sin número; `invalid` = hay un valor que no cumple el formato. */
  status: 'ok' | 'missing' | 'invalid'
  /** Número en formato E.164 con «+», o null si no es válido. */
  e164: string | null
  /** Solo dígitos (para APIs que no admiten «+»), o null. */
  number: string | null
  /** La persona activó los avisos por WhatsApp en la app (consentimiento). */
  optIn: boolean
}

export function whatsappOf(raw: string | null | undefined, optIn = false): WhatsApp {
  const t = (raw ?? '').replace(/[\s().-]/g, '')
  if (t === '') return { status: 'missing', e164: null, number: null, optIn }
  if (!/^\+[1-9]\d{7,14}$/.test(t)) return { status: 'invalid', e164: null, number: null, optIn }
  return { status: 'ok', e164: t, number: t.slice(1), optIn }
}
