import { applyFormat } from './mdFormat'

describe('applyFormat', () => {
  it('negrita envuelve la selección y la quita al repetir', () => {
    const a = applyFormat('bold', 'hola mundo', 5, 10)
    expect(a.value).toBe('hola **mundo**')
    expect(a.value.slice(a.start, a.end)).toBe('mundo')
    const b = applyFormat('bold', a.value, a.start, a.end)
    expect(b.value).toBe('hola mundo')
    expect(b.value.slice(b.start, b.end)).toBe('mundo')
  })

  it('sin selección deja el cursor entre los marcadores', () => {
    const a = applyFormat('italic', 'x', 1, 1)
    expect(a.value).toBe('x__')
    expect(a.start).toBe(2)
    expect(a.end).toBe(2)
  })

  it('quita el formato cuando la selección incluye los marcadores', () => {
    expect(applyFormat('strike', '~~a~~', 0, 5).value).toBe('a')
  })

  it('listas: prefija cada línea y alterna', () => {
    const a = applyFormat('ul', 'uno\ndos', 0, 7)
    expect(a.value).toBe('- uno\n- dos')
    expect(applyFormat('ul', a.value, a.start, a.end).value).toBe('uno\ndos')
  })

  it('lista sin selección deja el cursor al final para escribir', () => {
    const a = applyFormat('ul', 'a\n', 2, 2)
    expect(a.value).toBe('a\n- ')
    expect(a.start).toBe(4)
    expect(a.end).toBe(4)
  })

  it('cambiar de lista reemplaza el prefijo anterior', () => {
    expect(applyFormat('ol', '- uno', 0, 5).value).toBe('1. uno')
    expect(applyFormat('task', '1. uno', 0, 6).value).toBe('- [ ] uno')
  })

  it('formato de línea solo toca las líneas de la selección', () => {
    expect(applyFormat('heading', 'a\nb\nc', 2, 3).value).toBe('a\n## b\nc')
  })

  it('enlace selecciona la URL para escribirla', () => {
    const a = applyFormat('link', 'ver docs', 4, 8)
    expect(a.value).toBe('ver [docs](https://)')
    expect(a.value.slice(a.start, a.end)).toBe('https://')
  })

  it('línea separadora queda en su propio párrafo', () => {
    expect(applyFormat('rule', 'texto', 5, 5).value).toBe('texto\n\n---\n')
  })
})
