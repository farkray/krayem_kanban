import { db } from '../db/db'
import { byPosition } from '../lib/position'
import { setRoleResolver } from '../lib/access'
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

  it('cambia el color y el icono de un tablero, normaliza lo desconocido y no escribe si nada cambia', async () => {
    const id = S().createBoard('Casa')!
    const look = () => S().boards.find((b) => b.id === id)!
    expect(look().color).toBeUndefined() // por defecto no se guarda nada
    expect(S().setBoardAppearance(id, { color: 'morado' })).toBe(true)
    expect(look()).toMatchObject({ color: 'morado' })
    expect(look().icon).toBeUndefined()
    expect(S().setBoardAppearance(id, { icon: 'cohete' })).toBe(true)
    expect(look()).toMatchObject({ color: 'morado', icon: 'cohete' }) // pedir uno no borra el otro
    // un valor desconocido cae al de por defecto
    S().setBoardAppearance(id, { color: 'fucsia' as never })
    expect(look().color).toBe('petroleo')
    // sin cambios no se vuelve a escribir (no sube updatedAt)
    const before = look().updatedAt
    expect(S().setBoardAppearance(id, { color: 'petroleo', icon: 'cohete' })).toBe(true)
    expect(look().updatedAt).toBe(before)
    expect(S().setBoardAppearance('no-existe', { color: 'rojo' })).toBe(false)
    await flush()
    expect((await db.boards.get(id))?.color).toBe('petroleo') // y queda guardado
  })

  it('límite de 10 columnas', () => {
    const b = S().createBoard('X')!
    for (let i = 4; i <= 10; i++) expect(S().addColumn(b, `C${i}`)).not.toBeNull()
    expect(S().addColumn(b, 'Once')).toBeNull()
    expect(liveCols(b)).toHaveLength(10)
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

  it('mueve una tarjeta a otro tablero con sus datos y las etiquetas por nombre', () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const [a1] = liveCols(a)
    const [b1] = liveCols(b)
    const la = S().createLabel(a, 'Urgente', 'red')!
    const lb = S().createLabel(b, 'urgente', 'red')!
    const lx = S().createLabel(a, 'Solo A', 'blue')!
    const id = S().addCard(a1.id, 'Viaja')!
    S().updateCard(id, { labelIds: [la, lx] } as never)
    S().addComment(id, 'Hola')
    S().addItem(id, 'Paso')
    expect(S().moveCardToBoard(id, b1.id)).toBe(true)
    const card = S().cards.find((c) => c.id === id)!
    expect(card).toMatchObject({ boardId: b, columnId: b1.id })
    // "Urgente" ya existía en B (otro uso de mayúsculas); "Solo A" se crea en B
    expect(card.labelIds).toContain(lb)
    expect(
      S()
        .labels.filter((l) => l.boardId === b && !l.deletedAt)
        .map((l) => l.name)
        .sort(),
    ).toEqual(['Solo A', 'urgente'])
    expect(
      S()
        .comments.filter((c) => c.cardId === id)
        .every((c) => c.boardId === b),
    ).toBe(true)
    expect(
      S()
        .items.filter((i) => i.cardId === id)
        .every((i) => i.boardId === b),
    ).toBe(true)
    expect(liveCards(a1.id)).toHaveLength(0)
    expect(liveCards(b1.id).map((c) => c.id)).toEqual([id])
  })

  it('no mueve a una columna llena de otro tablero', () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const [a1] = liveCols(a)
    const doing = liveCols(b)[1] // En curso: límite 2
    S().addCard(doing.id, 'x')
    S().addCard(doing.id, 'y')
    const id = S().addCard(a1.id, 'z')!
    expect(S().moveCardToBoard(id, doing.id)).toBe(false)
    expect(S().cards.find((c) => c.id === id)?.boardId).toBe(a)
  })

  it('reordena tableros', () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const c = S().createBoard('C')!
    const titles = () =>
      S()
        .boards.filter((x) => !x.deletedAt)
        .sort((x, y) => (x.position < y.position ? -1 : 1))
        .map((x) => x.title)
    expect(titles()).toEqual(['A', 'B', 'C'])
    S().moveBoard(c, 0)
    expect(titles()).toEqual(['C', 'A', 'B'])
    S().moveBoard(c, 2)
    expect(titles()).toEqual(['A', 'B', 'C'])
    void a
    void b
  })

  it('eliminar columna moviendo tarjetas y deshacer', () => {
    const b = S().createBoard('X')!
    const [c1, , c2] = liveCols(b) // "Listo": estándar, sin límite
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
  const B = () => S().boards.find((b) => !b.deletedAt)?.id ?? S().createBoard('T')!
  it('crea con nombre y color, sin duplicar el nombre (sin distinguir mayúsculas)', () => {
    expect(S().createLabel(B(), '   ', 'blue')).toBeNull()
    const id = S().createLabel(B(), '  Coppel ', 'blue')!
    expect(S().labels.find((l) => l.id === id)).toMatchObject({ name: 'Coppel', color: 'blue' })
    expect(S().createLabel(B(), 'coppel', 'red')).toBeNull()
    expect(S().createLabel(B(), 'x'.repeat(31), 'blue')).toBeNull()
    expect(S().createLabel(B(), 'Otra', 'fucsia' as never)).toBeNull()
  })

  it('edita nombre y color; rechaza duplicados', () => {
    const a = S().createLabel(B(), 'Coppel', 'blue')!
    const b = S().createLabel(B(), 'Liverpool', 'pink')!
    expect(S().updateLabel(a, { color: 'green', name: 'Coppel MX' })).toBe(true)
    expect(S().labels.find((l) => l.id === a)).toMatchObject({ name: 'Coppel MX', color: 'green' })
    expect(S().updateLabel(b, { name: 'coppel mx' })).toBe(false)
    expect(S().updateLabel(b, { name: '' })).toBe(false)
  })

  it('asigna y quita en una tarjeta; máximo 8 por tarjeta', () => {
    const board = S().createBoard('X')!
    const card = S().addCard(liveCols(board)[0].id, 'A')!
    const ids = Array.from({ length: 9 }, (_, i) => S().createLabel(board, `E${i}`, 'gray')!)
    for (const id of ids.slice(0, 8)) expect(S().toggleCardLabel(card, id)).toBe(true)
    expect(S().toggleCardLabel(card, ids[8])).toBe(false)
    expect(S().cards.find((c) => c.id === card)?.labelIds).toHaveLength(8)
    expect(S().toggleCardLabel(card, ids[0])).toBe(true) // quitar
    expect(S().cards.find((c) => c.id === card)?.labelIds).toHaveLength(7)
    for (const id of ids.slice(1, 8)) S().toggleCardLabel(card, id)
    expect(S().cards.find((c) => c.id === card)?.labelIds).toBeUndefined() // sin etiquetas: campo ausente
  })

  it('eliminar una etiqueta se puede deshacer y la saca del filtro', () => {
    const id = S().createLabel(B(), 'Coppel', 'blue')!
    S().setLabelFilter([id])
    S().deleteLabel(id)
    expect(S().labels.find((l) => l.id === id)?.deletedAt).toBeTruthy()
    expect(S().labelFilter).toEqual([])
    S().toast!.undo!()
    expect(S().labels.find((l) => l.id === id)?.deletedAt).toBeUndefined()
  })

  it('el outbox encola las etiquetas para sincronizarlas', async () => {
    const id = S().createLabel(B(), 'Coppel', 'blue')!
    await flush()
    expect(await db.outbox.get(`labels:${id}`)).toBeTruthy()
    expect((await db.labels.get(id))?.name).toBe('Coppel')
  })
})

describe('tipo de columna y límites (WIP)', () => {
  const setup = () => {
    const b = S().createBoard('X')!
    const [todo, doing, done] = liveCols(b)
    return { b, todo, doing, done }
  }

  it('"En curso" nace como Doing y admite 2 tarjetas', () => {
    const { doing } = setup()
    expect(doing.kind).toBe('doing')
    expect(S().addCard(doing.id, 'A')).toBeTruthy()
    expect(S().addCard(doing.id, 'B')).toBeTruthy()
    expect(S().addCard(doing.id, 'C')).toBeNull()
    expect(S().toast?.message).toContain('límite')
    expect(liveCards(doing.id)).toHaveLength(2)
  })

  it('Next admite 4 y una columna estándar no tiene límite', () => {
    const { todo, done } = setup()
    expect(S().setColumnKind(todo.id, 'next')).toBe(true)
    for (const t of ['1', '2', '3', '4']) expect(S().addCard(todo.id, t)).toBeTruthy()
    expect(S().addCard(todo.id, '5')).toBeNull()
    for (let i = 0; i < 6; i++) expect(S().addCard(done.id, `d${i}`)).toBeTruthy()
  })

  it('mover a una columna llena se rechaza; reordenar dentro de ella sí', () => {
    const { todo, doing } = setup()
    const a = S().addCard(doing.id, 'A')!
    S().addCard(doing.id, 'B')
    const x = S().addCard(todo.id, 'X')!
    expect(S().moveCard(x, doing.id, 0)).toBe(false)
    expect(S().cards.find((c) => c.id === x)?.columnId).toBe(todo.id)
    expect(S().moveCard(a, doing.id, 2)).toBe(true) // misma columna
    S().deleteCard(a)
    expect(S().moveCard(x, doing.id, 0)).toBe(true)
  })

  it('no deja cambiar a un tipo con menos cupo que las tarjetas actuales', () => {
    const { todo } = setup()
    for (const t of ['1', '2', '3']) S().addCard(todo.id, t)
    expect(S().setColumnKind(todo.id, 'doing')).toBe(false)
    expect(liveCols(todo.boardId)[0].kind).toBeUndefined()
    expect(S().setColumnKind(todo.id, 'next')).toBe(true)
    expect(S().setColumnKind(todo.id, 'standard')).toBe(true)
    expect(liveCols(todo.boardId)[0].kind).toBeUndefined()
  })

  it('deshacer el borrado de una tarjeta no rebasa el límite', () => {
    const { doing } = setup()
    const a = S().addCard(doing.id, 'A')!
    S().addCard(doing.id, 'B')
    S().deleteCard(a)
    const undo = S().toast!.undo!
    S().addCard(doing.id, 'C')
    undo()
    expect(liveCards(doing.id).map((c) => c.title)).toEqual(['B', 'C'])
    expect(S().toast?.message).toContain('No se pudo deshacer')
  })

  it('eliminar una columna no mueve tarjetas a una columna a la que no caben', () => {
    const { todo, doing } = setup()
    for (const t of ['1', '2', '3']) S().addCard(todo.id, t)
    expect(S().deleteColumn(todo.id, doing.id)).toBe(false)
    expect(liveCols(todo.boardId)).toHaveLength(3)
  })
})

describe('etiquetas por tablero', () => {
  it('una etiqueta solo se asigna a tarjetas de su tablero', () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const label = S().createLabel(a, 'Coppel', 'blue')!
    const cardB = S().addCard(liveCols(b)[0].id, 'x')!
    expect(S().toggleCardLabel(cardB, label)).toBe(false)
    // el mismo nombre sí puede existir en otro tablero
    expect(S().createLabel(b, 'Coppel', 'red')).toBeTruthy()
  })

  it('migra las etiquetas antiguas (globales) a cada tablero que las usa', async () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const cardA = S().addCard(liveCols(a)[0].id, 'a')!
    const cardB = S().addCard(liveCols(b)[0].id, 'b')!
    const ts = new Date().toISOString()
    const coppel = {
      id: 'legacy-1',
      name: 'Coppel',
      color: 'blue' as const,
      createdAt: ts,
      updatedAt: ts,
    }
    const sin = {
      id: 'legacy-2',
      name: 'SinUso',
      color: 'gray' as const,
      createdAt: ts,
      updatedAt: ts,
    }
    useStore.setState({ labels: [coppel, sin] })
    S().updateCard(cardA, { labelIds: ['legacy-1'] })
    S().updateCard(cardB, { labelIds: ['legacy-1'] })

    await S().migrateLabels()
    const live = S().labels.filter((l) => !l.deletedAt)
    expect(
      live
        .filter((l) => l.name === 'Coppel')
        .map((l) => l.boardId)
        .sort(),
    ).toEqual([a, b].sort())
    expect(live.filter((l) => l.name === 'SinUso').map((l) => l.boardId)).toEqual([a]) // al primero
    expect(live.every((l) => !!l.boardId)).toBe(true)
    for (const [card, board] of [
      [cardA, a],
      [cardB, b],
    ] as const) {
      const ids = S().cards.find((c) => c.id === card)!.labelIds!
      expect(live.find((l) => l.id === ids[0])?.boardId).toBe(board)
    }
    // idempotente: no vuelve a duplicar
    const before = S().labels.length
    await S().migrateLabels()
    expect(S().labels.length).toBe(before)
  })
})

describe('migración de etiquetas con tableros descargados del servidor', () => {
  afterEach(() => setRoleResolver(null))

  const legacy = () => {
    const ts = new Date().toISOString()
    return { id: 'legacy-1', name: 'Anáhuac', color: 'red' as const, createdAt: ts, updatedAt: ts }
  }

  it('migra también mis tableros que traen ownerId (el servidor lo pone en todos)', async () => {
    const b = S().createBoard('General')!
    useStore.setState({ boards: S().boards.map((x) => (x.id === b ? { ...x, ownerId: 'yo' } : x)) })
    const card = S().addCard(liveCols(b)[0].id, 'x')!
    useStore.setState({ labels: [legacy()] })
    S().updateCard(card, { labelIds: ['legacy-1'] })
    await S().migrateLabels()
    const mine = S().labels.filter((l) => !l.deletedAt && l.boardId === b)
    expect(mine.map((l) => l.name)).toEqual(['Anáhuac'])
    expect(S().cards.find((c) => c.id === card)?.labelIds).toEqual([mine[0].id])
  })

  it('no migra hacia tableros ajenos', async () => {
    const b = S().createBoard('Ajeno')!
    setRoleResolver(() => 'editor')
    useStore.setState({ labels: [legacy()] })
    await S().migrateLabels()
    expect(S().labels.filter((l) => l.boardId === b)).toHaveLength(0)
  })
})

describe('invariante: las etiquetas son del tablero', () => {
  it('cada etiqueta tiene tablero y cada tarjeta solo usa etiquetas del suyo', async () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const la = S().createLabel(a, 'Coppel', 'blue')!
    const lb = S().createLabel(b, 'Coppel', 'red')!
    const ca = S().addCard(liveCols(a)[0].id, 'a')!
    const cb = S().addCard(liveCols(b)[0].id, 'b')!
    expect(S().toggleCardLabel(ca, la)).toBe(true)
    expect(S().toggleCardLabel(cb, la)).toBe(false) // no se puede usar la de otro tablero
    expect(S().toggleCardLabel(cb, lb)).toBe(true)
    // una referencia cruzada (datos viejos o de sync) se repara con la etiqueta del mismo nombre
    useStore.setState({ cards: S().cards.map((c) => (c.id === cb ? { ...c, labelIds: [la] } : c)) })
    await S().migrateLabels()
    expect(S().cards.find((c) => c.id === cb)?.labelIds).toEqual([lb])
    const live = S().labels.filter((l) => !l.deletedAt)
    expect(live.every((l) => !!l.boardId)).toBe(true)
    for (const c of S().cards.filter((x) => !x.deletedAt)) {
      for (const id of c.labelIds ?? []) {
        expect(live.find((l) => l.id === id)?.boardId).toBe(c.boardId)
      }
    }
  })

  it('una referencia cruzada sin equivalente en el tablero se quita', async () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const la = S().createLabel(a, 'Solo en A', 'blue')!
    const cb = S().addCard(liveCols(b)[0].id, 'b')!
    useStore.setState({ cards: S().cards.map((c) => (c.id === cb ? { ...c, labelIds: [la] } : c)) })
    await S().migrateLabels()
    expect(S().cards.find((c) => c.id === cb)).not.toHaveProperty('labelIds')
  })
})

describe('tableros compartidos (cliente)', () => {
  afterEach(() => setRoleResolver(null))

  it('en solo lectura no se escribe nada y se avisa', () => {
    const board = S().createBoard('Ajeno')!
    const col = liveCols(board)[0]
    setRoleResolver((id) => (id === board ? 'viewer' : 'owner'))
    expect(S().addCard(col.id, 'No')).toBeTruthy() // la acción devuelve id, pero put() no escribe
    expect(liveCards(col.id)).toHaveLength(0)
    expect(S().toast?.message).toContain('solo lectura')
    expect(S().renameBoard(board, 'Otro')).toBe(true)
    expect(S().boards.find((b) => b.id === board)?.title).toBe('Ajeno')
  })

  it('un editor sí escribe, y los hijos llevan el tablero', () => {
    const board = S().createBoard('Compartido')!
    setRoleResolver(() => 'editor')
    const col = liveCols(board)[0]
    const card = S().addCard(col.id, 'Sí')!
    const item = S().addItem(card, 'ítem')!
    const comment = S().addComment(card, 'hola')!
    expect(S().items.find((i) => i.id === item)?.boardId).toBe(board)
    expect(S().comments.find((c) => c.id === comment)?.boardId).toBe(board)
  })

  it('purgeBoards borra el tablero y todo lo suyo del dispositivo', async () => {
    const a = S().createBoard('A')!
    const b = S().createBoard('B')!
    const cardA = S().addCard(liveCols(a)[0].id, 'a')!
    S().addItem(cardA, 'i')
    S().addComment(cardA, 'c')
    S().addCard(liveCols(b)[0].id, 'b')
    await S().purgeBoards([a])
    expect(S().boards.map((x) => x.id)).toEqual([b])
    expect(S().cards.every((c) => c.boardId === b)).toBe(true)
    expect(S().items).toHaveLength(0)
    expect(S().comments).toHaveLength(0)
    expect(await db.cards.where('boardId').equals(a).count()).toBe(0)
    expect(await db.outbox.get(`cards:${cardA}`)).toBeUndefined()
  })
})

describe('tipo Done y asignación', () => {
  it('"Listo" nace como Done, sin límite de tarjetas; se puede cambiar el tipo a Done', () => {
    const b = S().createBoard('X')!
    const [todo, , done] = liveCols(b)
    expect(done.kind).toBe('done')
    for (let i = 0; i < 6; i++) expect(S().addCard(done.id, `d${i}`)).toBeTruthy()
    expect(S().setColumnKind(todo.id, 'done')).toBe(true)
    expect(liveCols(b)[0].kind).toBe('done')
  })

  it('asigna y quita a una persona de la tarjeta', () => {
    const b = S().createBoard('X')!
    const card = S().addCard(liveCols(b)[0].id, 'A')!
    expect(S().updateCard(card, { assigneeId: 'user-1' })).toBe(true)
    expect(S().cards.find((c) => c.id === card)?.assigneeId).toBe('user-1')
    S().updateCard(card, { assigneeId: undefined })
    expect(S().cards.find((c) => c.id === card)).not.toHaveProperty('assigneeId')
  })
})
