import { db } from '../db/db'
import {
  cardHasDraft,
  editDraftKey,
  flushDrafts,
  hydrateDrafts,
  replyDraftKey,
  resetDrafts,
  updateDraftKey,
  useDrafts,
} from './drafts'

beforeEach(async () => {
  resetDrafts()
  await db.meta.clear()
})

describe('borradores', () => {
  it('guardan en memoria al instante y en la base local al vaciar la cola', async () => {
    useDrafts.getState().set('k1:update', 'Hola **mundo**')
    expect(useDrafts.getState().items['k1:update']).toBe('Hola **mundo**')
    await flushDrafts()
    expect((await db.meta.get('draft:k1:update'))?.value).toBe('Hola **mundo**')
  })

  it('un texto vacío borra el borrador (memoria y disco)', async () => {
    useDrafts.getState().set('k1:update', 'algo')
    await flushDrafts()
    useDrafts.getState().set('k1:update', '   ')
    await flushDrafts()
    expect(useDrafts.getState().items['k1:update']).toBeUndefined()
    expect(await db.meta.get('draft:k1:update')).toBeUndefined()
  })

  it('clear descarta el borrador', async () => {
    useDrafts.getState().set('k1:update', 'algo')
    useDrafts.getState().clear('k1:update')
    await flushDrafts()
    expect(await db.meta.get('draft:k1:update')).toBeUndefined()
  })

  it('hydrate recupera los guardados al abrir la app (y no pisa lo ya escrito)', async () => {
    await db.meta.put({ key: 'draft:k1:update', value: 'del disco' })
    await db.meta.put({ key: 'draft:k2:reply:u1', value: 'respuesta' })
    await db.meta.put({ key: 'identity', value: { userId: 'x' } }) // otra clave: se ignora
    useDrafts.getState().set('k2:reply:u1', 'más reciente')
    await hydrateDrafts()
    expect(useDrafts.getState().items).toEqual({
      'k1:update': 'del disco',
      'k2:reply:u1': 'más reciente',
    })
  })

  it('las claves distinguen actualización, respuesta y edición, y se ubican por tarjeta', () => {
    const items = {
      [updateDraftKey('k1')]: 'a',
      [replyDraftKey('k2', 'u9')]: 'b',
      [editDraftKey('k3', 'c1')]: 'c',
    }
    expect(cardHasDraft(items, 'k1')).toBe(true)
    expect(cardHasDraft(items, 'k2')).toBe(true)
    expect(cardHasDraft(items, 'k3')).toBe(true)
    expect(cardHasDraft(items, 'k4')).toBe(false)
  })
})
