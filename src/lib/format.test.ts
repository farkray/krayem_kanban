import { createdLabel, dateRangeLabel, dueState, pluralize, relativeTime } from './format'

describe('pluralize', () => {
  it.each([
    [0, '0 tarjetas'],
    [1, '1 tarjeta'],
    [2, '2 tarjetas'],
  ])('%i -> %s', (n, out) => {
    expect(pluralize(n, 'tarjeta', 'tarjetas')).toBe(out)
  })
})

describe('createdLabel', () => {
  const now = new Date(2026, 10, 3, 15, 0)
  const ago = (d: number) => new Date(2026, 10, 3 - d, 9, 0).toISOString()

  it.each([
    [0, 'Creada hoy'],
    [1, 'Creada ayer'],
    [3, 'Creada hace 3 días'],
    [7, 'Creada hace 1 semana'],
    [15, 'Creada hace 2 semanas'],
    [60, 'Creada hace 2 meses'],
    [400, 'Creada hace 1 año'],
  ])('hace %i días -> %s', (d, out) => {
    expect(createdLabel(ago(d), now)).toBe(out)
  })
})

describe('fechas de tarjeta', () => {
  const now = new Date(2026, 10, 3, 12, 0)

  it('dateRangeLabel', () => {
    expect(dateRangeLabel()).toBeNull()
    expect(dateRangeLabel('2026-11-03', '2026-11-10')).toBe('3 nov → 10 nov')
    expect(dateRangeLabel('2026-11-03')).toBe('Inicio 3 nov')
    expect(dateRangeLabel(undefined, '2026-11-10')).toBe('Vence 10 nov')
  })

  it('dueState', () => {
    expect(dueState(undefined, false, now)).toBeNull()
    expect(dueState('2026-11-02', false, now)).toBe('overdue')
    expect(dueState('2026-11-02', true, now)).toBeNull()
    expect(dueState('2026-11-03', false, now)).toBe('soon')
    expect(dueState('2026-11-05', false, now)).toBe('soon')
    expect(dueState('2026-11-06', false, now)).toBeNull()
  })
})

describe('relativeTime', () => {
  const now = new Date(2026, 10, 3, 12, 0, 0)
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it('formatos', () => {
    expect(relativeTime(at(10_000), now)).toBe('hace un momento')
    expect(relativeTime(at(5 * 60_000), now)).toBe('hace 5 min')
    expect(relativeTime(at(3 * 3_600_000), now)).toBe('hace 3 h')
    expect(relativeTime(new Date(2026, 10, 2, 8, 0).toISOString(), now)).toBe('ayer')
    expect(relativeTime(new Date(2026, 9, 20, 8, 0).toISOString(), now)).toBe('20 oct')
  })
})
