import { normalize, searchAll } from './search'
import type { Data } from './types'

const ts = '2026-11-03T10:00:00.000Z'
const base = { createdAt: ts, updatedAt: ts }

const data: Data = {
  boards: [{ ...base, id: 'b1', title: 'Trabajo', position: 'a0' }],
  columns: [{ ...base, id: 'c1', boardId: 'b1', title: 'Por hacer', position: 'a0' }],
  cards: [
    {
      ...base,
      id: 't1',
      boardId: 'b1',
      columnId: 'c1',
      title: 'Presentación IBERO',
      position: 'a0',
    },
    {
      ...base,
      id: 't2',
      boardId: 'b1',
      columnId: 'c1',
      title: 'Banner',
      description: 'Revisar el logotipo viejo',
      position: 'a1',
    },
    {
      ...base,
      id: 't3',
      boardId: 'b1',
      columnId: 'c1',
      title: 'Borrada',
      position: 'a2',
      deletedAt: ts,
    },
  ],
  attachments: [],
  labels: [],
  items: [
    { ...base, id: 'i1', cardId: 't1', text: 'Preparar diapositivas', done: false, position: 'a0' },
  ],
  comments: [{ ...base, id: 'm1', cardId: 't2', bodyMd: 'Hablar con **diseño**' }],
}

describe('búsqueda por etiqueta', () => {
  it('encuentra tarjetas por el nombre de su etiqueta', () => {
    const withLabel: Data = {
      ...data,
      labels: [{ ...base, id: 'l1', name: 'Coppel', color: 'blue' }],
      cards: data.cards.map((c) => (c.id === 't1' ? { ...c, labelIds: ['l1'] } : c)),
    }
    const r = searchAll(withLabel, 'coppel')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ type: 'card', cardId: 't1' })
    expect(r[0].context).toContain('Etiqueta: Coppel')
  })
})

describe('searchAll', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalize('Presentación')).toBe('presentacion')
    expect(searchAll(data, 'PRESENTACION').map((r) => r.type)).toEqual(['card'])
  })

  it('busca en tableros, columnas, descripción, ítems y comentarios', () => {
    expect(searchAll(data, 'trabajo')[0].type).toBe('board')
    expect(searchAll(data, 'por hacer')[0].type).toBe('column')
    expect(searchAll(data, 'logotipo')[0]).toMatchObject({ type: 'card', cardId: 't2' })
    expect(searchAll(data, 'diapositivas')[0]).toMatchObject({ type: 'item', cardId: 't1' })
    expect(searchAll(data, 'diseño')[0]).toMatchObject({ type: 'comment', cardId: 't2' })
  })

  it('ignora eliminados y consulta vacía', () => {
    expect(searchAll(data, 'borrada')).toEqual([])
    expect(searchAll(data, '  ')).toEqual([])
  })
})
