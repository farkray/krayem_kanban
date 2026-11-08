import { todaySummary } from './today'
import type { Board, Card, Column } from './types'

const NOW = new Date(2026, 10, 8, 10, 0) // 8 nov 2026
const base = { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
const board = (id: string, extra: Partial<Board> = {}): Board => ({
  id,
  title: id,
  position: 'a0',
  ...base,
  ...extra,
})
const col = (id: string, extra: Partial<Column> = {}): Column => ({
  id,
  boardId: 'b1',
  title: id,
  position: 'a0',
  ...base,
  ...extra,
})
const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  boardId: 'b1',
  columnId: 'c1',
  title: id,
  position: 'a0',
  ...base,
  ...extra,
})
const run = (cards: Card[], extra: Partial<Parameters<typeof todaySummary>[0]> = {}, me = 'yo') =>
  todaySummary(
    { boards: [board('b1')], columns: [col('c1'), col('done', { kind: 'done' })], cards, ...extra },
    me,
    NOW,
  )
const groups = (items: ReturnType<typeof run>) => items.map((i) => `${i.cardId}:${i.group}`)

describe('resumen "Hoy"', () => {
  it('clasifica vencidas, de hoy, de mañana y las que empiezan hoy', () => {
    const items = run([
      card('vieja', { endDate: '2026-11-05' }),
      card('hoy', { endDate: '2026-11-08' }),
      card('manana', { endDate: '2026-11-09' }),
      card('empieza', { startDate: '2026-11-08', endDate: '2026-11-20' }),
      card('lejos', { endDate: '2026-11-20' }),
      card('sin-fechas'),
    ])
    expect(groups(items)).toEqual([
      'vieja:overdue',
      'hoy:today',
      'manana:tomorrow',
      'empieza:starting',
    ])
  })

  it('una tarjeta que vence hoy y empieza hoy cuenta solo como "vence hoy"', () => {
    expect(groups(run([card('x', { startDate: '2026-11-08', endDate: '2026-11-08' })]))).toEqual([
      'x:today',
    ])
  })

  it('ordena: vencidas (la más antigua primero), hoy, mañana, empiezan', () => {
    const items = run([
      card('b', { endDate: '2026-11-06' }),
      card('a', { endDate: '2026-11-01' }),
      card('c', { endDate: '2026-11-08' }),
    ])
    expect(items.map((i) => i.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('ignora tarjetas en columnas Done y borradas', () => {
    const items = run([
      card('hecha', { columnId: 'done', endDate: '2026-11-01' }),
      card('borrada', { endDate: '2026-11-01', deletedAt: '2026-11-02T00:00:00.000Z' }),
      card('viva', { endDate: '2026-11-01' }),
    ])
    expect(items.map((i) => i.cardId)).toEqual(['viva'])
  })

  it('ignora tarjetas de tableros o columnas borrados', () => {
    const items = run(
      [
        card('k1', { endDate: '2026-11-01' }),
        card('k2', { columnId: 'c2', endDate: '2026-11-01' }),
      ],
      {
        boards: [board('b1', { deletedAt: '2026-11-02T00:00:00.000Z' })],
        columns: [col('c1'), col('c2', { deletedAt: '2026-11-02T00:00:00.000Z' })],
      },
    )
    expect(items).toEqual([])
  })

  it('solo las mías: asignadas a mí, o sin asignar en un tablero propio', () => {
    const cards = [
      card('mia', { assigneeId: 'yo', endDate: '2026-11-01' }),
      card('de-ana', { assigneeId: 'ana', endDate: '2026-11-01' }),
      card('sin-asignar', { endDate: '2026-11-01' }),
    ]
    expect(run(cards).map((i) => i.cardId)).toEqual(['mia', 'sin-asignar'])
    // en un tablero ajeno, lo sin asignar no es mío
    const ajeno = run(cards, { boards: [board('b1', { ownerId: 'ana' })] })
    expect(ajeno.map((i) => i.cardId)).toEqual(['mia'])
    // en un tablero propio con ownerId explícito sigue siendo mío
    expect(run(cards, { boards: [board('b1', { ownerId: 'yo' })] }).map((i) => i.cardId)).toEqual([
      'mia',
      'sin-asignar',
    ])
  })

  it('sin sesión no hay resumen', () => {
    expect(
      todaySummary(
        {
          boards: [board('b1')],
          columns: [col('c1')],
          cards: [card('x', { endDate: '2026-11-01' })],
        },
        null,
        NOW,
      ),
    ).toEqual([])
  })

  it('cambia con el día: mañana pasa a ser hoy', () => {
    const cards = [card('x', { endDate: '2026-11-09' })]
    const data = { boards: [board('b1')], columns: [col('c1')], cards }
    expect(todaySummary(data, 'yo', NOW)[0].group).toBe('tomorrow')
    expect(todaySummary(data, 'yo', new Date(2026, 10, 9, 8, 0))[0].group).toBe('today')
    expect(todaySummary(data, 'yo', new Date(2026, 10, 10, 8, 0))[0].group).toBe('overdue')
  })
})
