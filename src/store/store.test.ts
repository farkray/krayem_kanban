import { db } from '../db/db'
import { byPosition } from '../lib/position'
import { flush, resetInit, resetStore, useStore } from './store'

const S = () => useStore.getState()
const liveCols = (boardId: string) =>
  S()
    .columns.filter((c) => c.boardId === boardId && !c.deletedAt)
    .sort(byPosition)
const liveCards = (colId: string) =>
  S()
    .cards.filter((c) => c.columnId === colId && !c.deletedAt)
    .sort(byPosition)

beforeEach(resetStore)

describe('init', () => {
  it('crea tablero inicial con 3 columnas la primera vez y no repite', async () => {
    await S().init()
    await flush()
    expect(S().boards).toHaveLength(1)
    expect(liveCols(S().boards[0].id).map((c) => c.title)).toEqual([
      'Por hacer',
      'En curso',
      'Listo',
    ])

    useStore.setState({ boards: [], columns: [] })
    resetInit()
    await S().init()
    expect(S().boards).toHaveLength(1) // recargado desde Dexie
    expect(S().columns).toHaveLength(3)
  })

  it('init concurrente no siembra dos veces', async () => {
    await Promise.all([S().init(), S().init()])
    await flush()
    expect(S().boards).toHaveLength(1)
  })

  it('no resiembra si el usuario eliminó todo', async () => {
    await S().init()
    S().deleteBoard(S().boards[0].id)
    await flush()
    useStore.setState({ ...S(), boards: [], columns: [] })
    resetInit()
    await S().init()
    expect(S().boards.filter((b) => !b.deletedAt)).toHaveLength(0)
  })
})

describe('tableros y columnas', () => {
  it('crea, valida y renombra', () => {
    expect(S().createBoard('   ')).toBeNull()
    const id = S().createBoard('  Casa ')!
    expect(S().boards.find((b) => b.id === id)?.title).toBe('Casa')
    expect(S().renameBoard(id, 'Hogar')).toBe(true)
    expect(S().renameBoard(id, '')).toBe(false)
  })

  it('límite de 5 columnas', () => {
    const b = S().createBoard('X')!
    expect(S().addColumn(b, 'Cuarta')).not.toBeNull()
    expect(S().addColumn(b, 'Quinta')).not.toBeNull()
    expect(S().addColumn(b, 'Sexta')).toBeNull()
    expect(liveCols(b)).toHaveLength(5)
  })

  it('no elimina la última columna', () => {
    const b = S().createBoard('X')!
    const [c1, c2, c3] = liveCols(b)
    expect(S().deleteColumn(c1.id)).toBe(true)
    expect(S().deleteColumn(c2.id)).toBe(true)
    expect(S().deleteColumn(c3.id)).toBe(false)
  })

  it('reordena columnas', () => {
    const b = S().createBoard('X')!
    const [c1] = liveCols(b)
    S().moveColumn(c1.id, 2)
    expect(liveCols(b).map((c) => c.title)).toEqual(['En curso', 'Listo', 'Por hacer'])
  })

  it('eliminar columna moviendo tarjetas y deshacer', () => {
    const b = S().createBoard('X')!
    const [c1, c2] = liveCols(b)
    S().addCard(c1.id, 'A')
    S().addCard(c1.id, 'B')
    S().addCard(c2.id, 'C')
    S().deleteColumn(c1.id, c2.id)
    expect(liveCards(c2.id).map((c) => c.title)).toEqual(['C', 'A', 'B'])
    S().toast!.undo!()
    expect(liveCols(b)).toHaveLength(3)
    expect(liveCards(c1.id).map((c) => c.title)).toEqual(['A', 'B'])
    expect(liveCards(c2.id).map((c) => c.title)).toEqual(['C'])
  })

  it('eliminar tablero es en cascada y se puede deshacer', () => {
    const b = S().createBoard('X')!
    const [c1] = liveCols(b)
    const card = S().addCard(c1.id, 'A')!
    S().addItem(card, 'i')
    S().addComment(card, 'hola')
    S().deleteBoard(b)
    expect(S().boards.find((x) => x.id === b)?.deletedAt).toBeTruthy()
    expect(S().cards.every((c) => c.deletedAt)).toBe(true)
    expect(S().items.every((c) => c.deletedAt)).toBe(true)
    S().toast!.undo!()
    expect(S().boards.find((x) => x.id === b)?.deletedAt).toBeUndefined()
    expect(S().cards.every((c) => !c.deletedAt)).toBe(true)
    expect(S().comments.every((c) => !c.deletedAt)).toBe(true)
  })
})

describe('tarjetas', () => {
  it('agrega al final, mueve entre columnas y dentro de la columna', () => {
    const b = S().createBoard('X')!
    const [c1, c2] = liveCols(b)
    const a = S().addCard(c1.id, 'A')!
    S().addCard(c1.id, 'B')
    const c = S().addCard(c1.id, 'C')!
    expect(S().addCard(c1.id, '  ')).toBeNull()
    S().moveCard(c, c1.id, 0)
    expect(liveCards(c1.id).map((x) => x.title)).toEqual(['C', 'A', 'B'])
    S().moveCard(a, c2.id, 0)
    expect(liveCards(c2.id).map((x) => x.title)).toEqual(['A'])
    expect(liveCards(c1.id).map((x) => x.title)).toEqual(['C', 'B'])
  })

  it('valida fechas: final >= inicio', () => {
    const b = S().createBoard('X')!
    const id = S().addCard(liveCols(b)[0].id, 'A')!
    expect(S().updateCard(id, { startDate: '2026-11-10' })).toBe(true)
    expect(S().updateCard(id, { endDate: '2026-11-05' })).toBe(false)
    expect(S().updateCard(id, { endDate: '2026-11-12' })).toBe(true)
    expect(S().updateCard(id, { startDate: undefined })).toBe(true)
  })

  it('elimina y deshace', () => {
    const b = S().createBoard('X')!
    const id = S().addCard(liveCols(b)[0].id, 'A')!
    S().deleteCard(id)
    expect(liveCards(liveCols(b)[0].id)).toHaveLength(0)
    S().toast!.undo!()
    expect(liveCards(liveCols(b)[0].id)).toHaveLength(1)
  })
})

describe('checklist y comentarios', () => {
  it('checklist: agregar, marcar, reordenar, quitar', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    const i1 = S().addItem(card, 'uno')!
    S().addItem(card, 'dos')
    S().toggleItem(i1)
    expect(S().items.find((i) => i.id === i1)?.done).toBe(true)
    S().moveItem(i1, 1)
    const order = S()
      .items.filter((i) => !i.deletedAt)
      .sort(byPosition)
      .map((i) => i.text)
    expect(order).toEqual(['dos', 'uno'])
    S().removeChecklist(card)
    expect(S().items.every((i) => i.deletedAt)).toBe(true)
  })

  it('comentarios: agregar, editar (marca editedAt), eliminar', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    expect(S().addComment(card, '   ')).toBeNull()
    const id = S().addComment(card, '**hola**')!
    expect(S().editComment(id, 'nuevo')).toBe(true)
    const c = S().comments.find((x) => x.id === id)!
    expect(c.bodyMd).toBe('nuevo')
    expect(c.editedAt).toBeTruthy()
    S().deleteComment(id)
    expect(S().comments.find((x) => x.id === id)?.deletedAt).toBeTruthy()
  })
})

describe('imágenes', () => {
  const meta = {
    name: 'foto.png',
    mime: 'image/webp',
    sizeOriginal: 4_000_000,
    sizeCompressed: 300_000,
    width: 1600,
    height: 900,
  }
  const blob = () => new Blob(['x'], { type: 'image/webp' })

  it('agrega con ruta por id, guarda el archivo y lo encola', async () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    const id = S().addAttachment(card, meta, blob())!
    const att = S().attachments.find((a) => a.id === id)!
    expect(att.path).toBe(`${id}.webp`)
    expect(att.cardId).toBe(card)
    await flush()
    expect((await db.blobs.get(id))?.uploaded).toBe(false)
    expect(await db.outbox.get(`attachments:${id}`)).toBeTruthy()
  })

  it('límite de 10 imágenes por tarjeta', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    for (let i = 0; i < 10; i++) expect(S().addAttachment(card, meta, blob())).not.toBeNull()
    expect(S().addAttachment(card, meta, blob())).toBeNull()
  })

  it('portada: se asigna y se quita; eliminar la tarjeta elimina sus imágenes (con deshacer)', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    const id = S().addAttachment(card, meta, blob())!
    expect(S().updateCard(card, { coverAttachmentId: id })).toBe(true)
    expect(S().cards.find((c) => c.id === card)?.coverAttachmentId).toBe(id)
    expect(S().updateCard(card, { coverAttachmentId: undefined })).toBe(true)
    expect(S().cards.find((c) => c.id === card)?.coverAttachmentId).toBeUndefined()

    S().deleteCard(card)
    expect(S().attachments.every((a) => a.deletedAt)).toBe(true)
    S().toast!.undo!()
    expect(S().attachments.every((a) => !a.deletedAt)).toBe(true)
  })

  it('elimina una imagen con deshacer', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    const id = S().addAttachment(card, meta, blob())!
    S().deleteAttachment(id)
    expect(S().attachments.find((a) => a.id === id)?.deletedAt).toBeTruthy()
    S().toast!.undo!()
    expect(S().attachments.find((a) => a.id === id)?.deletedAt).toBeUndefined()
  })
})

describe('etiquetas', () => {
  it('crea con nombre y color, sin duplicar el nombre (sin distinguir mayúsculas)', () => {
    expect(S().createLabel('   ', 'blue')).toBeNull()
    const id = S().createLabel('  Coppel ', 'blue')!
    expect(S().labels.find((l) => l.id === id)).toMatchObject({ name: 'Coppel', color: 'blue' })
    expect(S().createLabel('coppel', 'red')).toBeNull()
    expect(S().createLabel('x'.repeat(31), 'blue')).toBeNull()
    expect(S().createLabel('Otra', 'fucsia' as never)).toBeNull()
  })

  it('edita nombre y color; rechaza duplicados', () => {
    const a = S().createLabel('Coppel', 'blue')!
    const b = S().createLabel('Liverpool', 'pink')!
    expect(S().updateLabel(a, { color: 'green', name: 'Coppel MX' })).toBe(true)
    expect(S().labels.find((l) => l.id === a)).toMatchObject({ name: 'Coppel MX', color: 'green' })
    expect(S().updateLabel(b, { name: 'coppel mx' })).toBe(false)
    expect(S().updateLabel(b, { name: '' })).toBe(false)
  })

  it('asigna y quita en una tarjeta; máximo 8 por tarjeta', () => {
    const board = S().createBoard('X')!
    const card = S().addCard(liveCols(board)[0].id, 'A')!
    const ids = Array.from({ length: 9 }, (_, i) => S().createLabel(`E${i}`, 'gray')!)
    for (const id of ids.slice(0, 8)) expect(S().toggleCardLabel(card, id)).toBe(true)
    expect(S().toggleCardLabel(card, ids[8])).toBe(false)
    expect(S().cards.find((c) => c.id === card)?.labelIds).toHaveLength(8)
    expect(S().toggleCardLabel(card, ids[0])).toBe(true) // quitar
    expect(S().cards.find((c) => c.id === card)?.labelIds).toHaveLength(7)
    for (const id of ids.slice(1, 8)) S().toggleCardLabel(card, id)
    expect(S().cards.find((c) => c.id === card)?.labelIds).toBeUndefined() // sin etiquetas: campo ausente
  })

  it('eliminar una etiqueta se puede deshacer y la saca del filtro', () => {
    const id = S().createLabel('Coppel', 'blue')!
    S().setLabelFilter([id])
    S().deleteLabel(id)
    expect(S().labels.find((l) => l.id === id)?.deletedAt).toBeTruthy()
    expect(S().labelFilter).toEqual([])
    S().toast!.undo!()
    expect(S().labels.find((l) => l.id === id)?.deletedAt).toBeUndefined()
  })

  it('el outbox encola las etiquetas para sincronizarlas', async () => {
    const id = S().createLabel('Coppel', 'blue')!
    await flush()
    expect(await db.outbox.get(`labels:${id}`)).toBeTruthy()
    expect((await db.labels.get(id))?.name).toBe('Coppel')
  })
})
