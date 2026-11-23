// @vitest-environment node
import { whatsappOf } from './phone.ts'

describe('número de WhatsApp', () => {
  it('formato correcto: + código de país y 8 a 15 dígitos; da también los dígitos para las APIs de WhatsApp', () => {
    expect(whatsappOf('+525512345678', true)).toEqual({
      status: 'ok',
      e164: '+525512345678',
      number: '525512345678',
      optIn: true,
    })
    // espacios, guiones y paréntesis se normalizan
    expect(whatsappOf('+52 (55) 1234-5678')).toMatchObject({ status: 'ok', e164: '+525512345678' })
  })

  it('sin número = missing; un valor que no cumple = invalid (y nunca se entrega como número)', () => {
    expect(whatsappOf('')).toMatchObject({ status: 'missing', e164: null, number: null })
    expect(whatsappOf(undefined)).toMatchObject({ status: 'missing' })
    for (const bad of ['5512345678', '+0123456789', '+52 abc', '+1234567', '+1234567890123456', '0052551234567'])
      expect(whatsappOf(bad)).toMatchObject({ status: 'invalid', e164: null, number: null })
  })
})
