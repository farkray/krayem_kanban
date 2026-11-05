import { byPosition, positionAt, positionsFor } from './position'

describe('position', () => {
  it('genera claves ordenadas', () => {
    const keys = positionsFor(3)
    expect([...keys].sort()).toEqual(keys)
  })

  it('inserta al inicio, medio y final', () => {
    const list = positionsFor(3).map((position) => ({ position }))
    const start = positionAt(list, 0)
    const mid = positionAt(list, 1)
    const end = positionAt(list, 3)
    expect(start < list[0].position).toBe(true)
    expect(mid > list[0].position && mid < list[1].position).toBe(true)
    expect(end > list[2].position).toBe(true)
  })

  it('lista vacía devuelve una clave', () => {
    expect(typeof positionAt([], 0)).toBe('string')
  })

  it('byPosition ordena', () => {
    const l = [{ position: 'b' }, { position: 'a' }].sort(byPosition)
    expect(l.map((x) => x.position)).toEqual(['a', 'b'])
  })
})
