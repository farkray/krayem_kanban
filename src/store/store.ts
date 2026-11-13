import { create } from 'zustand'
import type { Table } from 'dexie'
import { db, type OutboxEntry } from '../db/db'
import { canEditBoard, currentUserId, participantIds, roleOf } from '../lib/access'
import { isConfigured } from '../lib/config'
import { byPosition, positionAt, positionsFor } from '../lib/position'
import {
  DEFAULT_COLUMNS,
  LIMITS,
  MAX_COLUMNS,
  TABLE_KEYS,
  COLUMN_KIND_NAMES,
  limitOf,
  boardColorOf,
  boardIconOf,
  type Board,
  type BoardColor,
  type BoardIconName,
  LABEL_COLORS,
  type Attachment,
  type Card,
  type ChecklistItem,
  type Column,
  type ColumnKind,
  type Comment,
  type Data,
  type Label,
  type LabelColor,
  type Like,
  type TableKey,
} from '../lib/types'

/* ---------- utilidades ---------- */

/** UUID derivado de dos ids (SHA-256): mismo par → mismo id en cualquier dispositivo. */
async function deterministicId(a: string, b: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${a}|${b}`))
  const h = [...new Uint8Array(buf)]
    .slice(0, 16)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const uid = () => crypto.randomUUID()
const stamp = () => new Date().toISOString()
const live = <T extends { deletedAt?: string }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt)

const clean = (text: string, max: number): string | null => {
  const t = text.trim()
  return t.length >= 1 && t.length <= max ? t : null
}

// Cola de escrituras a IndexedDB (Fase 3 la reutiliza para el outbox de sync).
let writes: Promise<unknown> = Promise.resolve()
const enqueue = (fn: () => Promise<unknown>) => {
  writes = writes.then(fn).catch((e) => console.error('[db]', e))
}
/** Espera a que terminen las escrituras pendientes. */
export const flush = () => writes

// El motor de sync se entera de cada escritura local para programar el envío.
let writeListener: (() => void) | null = null
export const setWriteListener = (fn: (() => void) | null) => {
  writeListener = fn
}

type Snapshot = Partial<Data>

export interface Toast {
  id: number
  message: string
  undo?: () => void
}

interface Actions {
  init: () => Promise<void>
  /** Crea el tablero inicial si nunca se sembró en este dispositivo. */
  seedIfEmpty: () => Promise<void>
  /** Quita del dispositivo todo lo de estos tableros (se perdió el acceso o se salió de ellos). */
  purgeBoards: (boardIds: string[]) => Promise<void>
  /** Las etiquetas antiguas (globales) pasan a ser de cada tablero que las usa. Idempotente. */
  migrateLabels: () => Promise<void>
  /** Aplica filas llegadas de la nube (no se vuelven a enviar). */
  applyRemote: <K extends TableKey>(key: K, rows: Data[K]) => void
  // tableros
  createBoard: (title: string) => string | null
  /** Crea un subtablero de `parentId` que muestra las tarjetas con la etiqueta `labelId`. */
  createSubboard: (parentId: string, labelId: string, title?: string) => string | null
  renameBoard: (id: string, title: string) => boolean
  /** Cambia el color y/o el icono del tablero (solo el dueño; los demás no pueden escribir el tablero). */
  setBoardAppearance: (id: string, look: { color?: BoardColor; icon?: BoardIconName }) => boolean
  deleteBoard: (id: string) => void
  // columnas
  addColumn: (boardId: string, title: string) => string | null
  renameColumn: (id: string, title: string) => boolean
  deleteColumn: (id: string, moveToId?: string) => boolean
  moveColumn: (id: string, index: number) => void
  /** Reordena mis tableros: `index` es el lugar entre los tableros propios. */
  moveBoard: (id: string, index: number) => void
  /** Cambia el tipo de columna (Estándar / Next / Doing). Falla si ya tiene más tarjetas que el límite. */
  setColumnKind: (id: string, kind: ColumnKind) => boolean
  // tarjetas
  /** Devuelve null si el título es inválido o la columna llegó a su límite. */
  /** Con `labelId` la tarjeta nace con esa etiqueta (así entra a un subtablero al crearla ahí). */
  addCard: (columnId: string, title: string, labelId?: string) => string | null
  updateCard: (
    id: string,
    patch: Partial<
      Pick<
        Card,
        | 'title'
        | 'description'
        | 'startDate'
        | 'endDate'
        | 'coverAttachmentId'
        | 'labelIds'
        | 'assigneeId'
      >
    >,
  ) => boolean
  /** Devuelve false si la columna destino llegó a su límite (la tarjeta no se mueve). */
  moveCard: (id: string, toColumnId: string, index: number) => boolean
  /** Pasa la tarjeta (con sus actualizaciones, lista y adjuntos) a una columna de otro tablero. */
  moveCardToBoard: (id: string, toColumnId: string) => boolean
  deleteCard: (id: string) => void
  // etiquetas
  createLabel: (boardId: string, name: string, color: LabelColor) => string | null
  updateLabel: (id: string, patch: Partial<Pick<Label, 'name' | 'color'>>) => boolean
  deleteLabel: (id: string) => void
  /** Pone o quita una etiqueta de una tarjeta. `false` si se excede el máximo por tarjeta. */
  toggleCardLabel: (cardId: string, labelId: string) => boolean
  /** Etiquetas por las que se filtra el tablero (vacío = sin filtro). No se guarda: es de la sesión. */
  labelFilter: string[]
  /** Filtro por persona: ids de usuario, o ASSIGNEE_NONE para "sin asignar". */
  assigneeFilter: string[]
  setLabelFilter: (ids: string[]) => void
  setAssigneeFilter: (ids: string[]) => void
  // imágenes
  addAttachment: (
    cardId: string,
    meta: Pick<
      Attachment,
      'name' | 'mime' | 'sizeOriginal' | 'sizeCompressed' | 'width' | 'height' | 'inline'
    >,
    blob: Blob,
  ) => string | null
  deleteAttachment: (id: string) => void
  // checklist
  addItem: (cardId: string, text: string) => string | null
  toggleItem: (id: string) => void
  updateItem: (id: string, text: string) => boolean
  deleteItem: (id: string) => void
  moveItem: (id: string, index: number) => void
  removeChecklist: (cardId: string) => void
  // comentarios
  addComment: (cardId: string, bodyMd: string) => string | null
  /** Responde a una actualización (si `parentId` ya es una respuesta, se cuelga de su actualización). */
  addReply: (parentId: string, bodyMd: string) => string | null
  /** Da o quita mi "me gusta". Puede hacerlo cualquiera que vea el tablero, aunque sea de solo lectura. */
  toggleLike: (commentId: string) => void
  editComment: (id: string, bodyMd: string) => boolean
  deleteComment: (id: string) => void
  // toast
  dismissToast: () => void
}

export type Store = Data & Actions & { ready: boolean; toast: Toast | null }

const emptyData = (): Data => ({
  boards: [],
  labels: [],
  columns: [],
  cards: [],
  attachments: [],
  items: [],
  comments: [],
  likes: [],
})

/** Quien da "me gusta" cuando no hay cuentas (modo solo-local). */
const LOCAL_USER = 'local'

let toastSeq = 0
let initPromise: Promise<void> | null = null

export const useStore = create<Store>((set, get) => {
  /**
   * Inserta/actualiza filas en memoria y las persiste en IndexedDB.
   * Con `track` (por defecto) también las encola en el outbox para enviarlas a la nube.
   */
  function put<K extends TableKey>(key: K, rows: Data[K], track = true): void {
    if (rows.length === 0) return
    if (track) {
      // Los hijos (ítems, comentarios, imágenes) llevan el tablero para saber con quién se comparten.
      if (key === 'items' || key === 'comments' || key === 'attachments' || key === 'likes') {
        const cards = get().cards
        rows = (rows as { cardId: string; boardId?: string }[]).map((r) =>
          r.boardId ? r : { ...r, boardId: cards.find((c) => c.id === r.cardId)?.boardId },
        ) as unknown as Data[K]
      }
      // Tablero compartido como solo lectura: no se escribe (el servidor también lo rechaza).
      const blocked = (rows as { id: string; boardId?: string }[]).some((r) => {
        // El "me gusta" es de cada quien: también lo da quien solo lee el tablero.
        if (key === 'likes') return false
        const bid = key === 'boards' ? r.id : r.boardId
        // El tablero en sí (nombre, borrado) solo lo cambia su dueño; lo de dentro, también los editores.
        return !!bid && (key === 'boards' ? roleOf(bid) !== 'owner' : !canEditBoard(bid))
      })
      if (blocked) {
        set({ toast: { id: ++toastSeq, message: 'Este tablero es de solo lectura.' } })
        return
      }
    }
    set((s) => {
      const incoming = new Map<string, Data[K][number]>(rows.map((r) => [r.id, r]))
      const current = s[key] as Data[K]
      const next = current.map((r) => incoming.get(r.id) ?? r)
      const known = new Set(current.map((r) => r.id))
      for (const r of rows) if (!known.has(r.id)) next.push(r)
      return { [key]: next } as unknown as Pick<Data, K>
    })
    const table = db[key] as unknown as Table<{ id: string }, string>
    enqueue(async () => {
      await db.transaction('rw', table, db.outbox, async () => {
        await table.bulkPut(rows as { id: string }[])
        if (track) {
          const entries: OutboxEntry[] = rows.map((r) => ({
            key: `${key}:${r.id}`,
            table: key,
            id: r.id,
            v: uid(),
          }))
          await db.outbox.bulkPut(entries)
        }
      })
      if (track) writeListener?.()
    })
  }

  const notify = (message: string, undo?: () => void) =>
    set({ toast: { id: ++toastSeq, message, undo } })

  const markDeleted = (snap: Snapshot) => {
    const ts = stamp()
    for (const k of TABLE_KEYS) {
      const rows = snap[k]
      if (rows) put(k, rows.map((r) => ({ ...r, deletedAt: ts, updatedAt: ts })) as never)
    }
  }

  const restore = (snap: Snapshot) => {
    const ts = stamp()
    for (const k of TABLE_KEYS) {
      const rows = snap[k]
      if (rows) put(k, rows.map((r) => ({ ...r, deletedAt: undefined, updatedAt: ts })) as never)
    }
  }

  const cardSnapshot = (cardIds: string[]): Snapshot => {
    const ids = new Set(cardIds)
    const s = get()
    return {
      cards: live(s.cards).filter((c) => ids.has(c.id)),
      attachments: live(s.attachments).filter((a) => ids.has(a.cardId)),
      items: live(s.items).filter((i) => ids.has(i.cardId)),
      comments: live(s.comments).filter((c) => ids.has(c.cardId)),
      likes: live(s.likes).filter((l) => ids.has(l.cardId)),
    }
  }

  const isFull = (col: Column) => {
    const limit = limitOf(col)
    return limit !== null && cardsOf(col.id).length >= limit
  }

  /**
   * Invariante: una etiqueta es del tablero, y una tarjeta solo usa etiquetas de su propio tablero.
   * Si una tarjeta apunta a una etiqueta de otro tablero, se cambia por la del mismo nombre en el
   * suyo (si existe) o se quita la referencia.
   */
  /** Tablero padre de un subtablero (si `boardId` lo es). */
  const subOf = (boardId: string): string | undefined =>
    get().boards.find((b) => b.id === boardId && !b.deletedAt)?.parentId

  const repairLabelRefs = () => {
    const st = get()
    const labels = live(st.labels)
    const byId = new Map(labels.map((l) => [l.id, l]))
    const fixed: Card[] = []
    for (const c of live(st.cards)) {
      if (!c.labelIds?.length) continue
      let changed = false
      const next: string[] = []
      for (const id of c.labelIds) {
        const l = byId.get(id)
        // Las subetiquetas (de un subtablero de este tablero) también son válidas aquí.
        if (!l || !l.boardId || l.boardId === c.boardId || subOf(l.boardId) === c.boardId) {
          next.push(id)
          continue
        }
        changed = true
        const same = labels.find(
          (x) => x.boardId === c.boardId && x.name.toLowerCase() === l.name.toLowerCase(),
        )
        if (same && !next.includes(same.id)) next.push(same.id)
      }
      if (changed) {
        const card: Card = { ...c, labelIds: next.length ? next : undefined, updatedAt: stamp() }
        if (!card.labelIds) delete card.labelIds
        fixed.push(card)
      }
    }
    if (fixed.length) put('cards', fixed)
  }

  const notifyFull = (col: Column) =>
    notify(
      `“${col.title}” está en su límite: ${limitOf(col)} ${limitOf(col) === 1 ? 'tarjeta' : 'tarjetas'} (${COLUMN_KIND_NAMES[col.kind ?? 'standard']}). Termina o mueve una primero.`,
    )

  const colsOf = (boardId: string) =>
    live(get().columns)
      .filter((c) => c.boardId === boardId)
      .sort(byPosition)
  const cardsOf = (columnId: string) =>
    live(get().cards)
      .filter((c) => c.columnId === columnId)
      .sort(byPosition)
  const itemsOf = (cardId: string) =>
    live(get().items)
      .filter((i) => i.cardId === cardId)
      .sort(byPosition)

  const base = () => {
    const ts = stamp()
    return { id: uid(), createdAt: ts, updatedAt: ts }
  }

  async function load(): Promise<void> {
    const [boards, labels, columns, cards, attachments, items, comments, likes] = await Promise.all(
      [
        db.boards.toArray(),
        db.labels.toArray(),
        db.columns.toArray(),
        db.cards.toArray(),
        db.attachments.toArray(),
        db.items.toArray(),
        db.comments.toArray(),
        db.likes.toArray(),
      ],
    )
    set({ boards, labels, columns, cards, attachments, items, comments, likes, ready: true })
    await get().migrateLabels()
    // Con nube configurada, el tablero inicial se crea tras la primera descarga (ver sync/engine).
    if (!isConfigured()) await get().seedIfEmpty()
  }

  return {
    ...emptyData(),
    ready: false,
    toast: null,
    labelFilter: [],
    assigneeFilter: [],

    // Idempotente: StrictMode (y dobles montajes) no deben sembrar dos veces.
    init: () => (initPromise ??= load()),

    seedIfEmpty: async () => {
      await flush() // asegura que lo ya descargado esté en memoria
      if (await db.meta.get('seeded')) return
      // Se cuentan también los borrados lógicos: si hubo tableros alguna vez, no se resiembra.
      if (get().boards.length === 0) get().createBoard('Mi tablero')
      enqueue(() => db.meta.put({ key: 'seeded', value: true }))
    },

    applyRemote: (key, rows) => put(key, rows, false),

    purgeBoards: async (boardIds) => {
      if (boardIds.length === 0) return
      const gone = new Set(boardIds)
      await flush()
      const s = get()
      const cardIds = new Set(s.cards.filter((c) => gone.has(c.boardId)).map((c) => c.id))
      const inBoard = (r: { boardId?: string; cardId?: string }) =>
        (r.boardId !== undefined && gone.has(r.boardId)) ||
        (r.cardId !== undefined && cardIds.has(r.cardId))
      const removed = {
        boards: s.boards.filter((b) => gone.has(b.id)),
        labels: s.labels.filter((l) => l.boardId !== undefined && gone.has(l.boardId)),
        columns: s.columns.filter((c) => gone.has(c.boardId)),
        cards: s.cards.filter((c) => gone.has(c.boardId)),
        attachments: s.attachments.filter(inBoard),
        items: s.items.filter(inBoard),
        comments: s.comments.filter(inBoard),
        likes: s.likes.filter(inBoard),
      }
      set({
        boards: s.boards.filter((x) => !removed.boards.includes(x)),
        labels: s.labels.filter((x) => !removed.labels.includes(x)),
        columns: s.columns.filter((x) => !removed.columns.includes(x)),
        cards: s.cards.filter((x) => !removed.cards.includes(x)),
        attachments: s.attachments.filter((x) => !removed.attachments.includes(x)),
        items: s.items.filter((x) => !removed.items.includes(x)),
        comments: s.comments.filter((x) => !removed.comments.includes(x)),
        likes: s.likes.filter((x) => !removed.likes.includes(x)),
      })
      await db.transaction('rw', [...db.tables], async () => {
        for (const k of TABLE_KEYS) {
          const ids = removed[k].map((r) => r.id)
          await (db[k] as unknown as Table<{ id: string }, string>).bulkDelete(ids)
          await db.outbox.bulkDelete(ids.map((id) => `${k}:${id}`))
        }
        await db.blobs.bulkDelete(removed.attachments.map((a) => a.id))
      })
    },

    migrateLabels: async () => {
      const st = get()
      const legacy = live(st.labels).filter((l) => !l.boardId)
      const mine = live(st.boards)
        // Solo los tableros propios (el servidor marca también los míos con ownerId = yo)
        .filter((b) => roleOf(b.id) === 'owner' && !b.parentId)
        .sort(byPosition)
      // Siempre se revisa que las tarjetas solo apunten a etiquetas de SU tablero.
      repairLabelRefs()
      if (legacy.length === 0 || mine.length === 0) return
      const ts = stamp()
      const copies: Label[] = []
      const cards: Card[] = []
      const usedAnywhere = new Set(live(st.cards).flatMap((c) => c.labelIds ?? []))
      for (const board of mine) {
        const boardCards = live(st.cards).filter((c) => c.boardId === board.id)
        const used = new Set(boardCards.flatMap((c) => c.labelIds ?? []))
        const map = new Map<string, string>()
        for (const l of legacy) {
          // Las que ninguna tarjeta usa se conservan en el primer tablero.
          if (!used.has(l.id) && !(board === mine[0] && !usedAnywhere.has(l.id))) continue
          // Id determinista: dos dispositivos que migren a la vez producen las mismas filas.
          const id = await deterministicId(l.id, board.id)
          map.set(l.id, id)
          copies.push({ ...l, id, boardId: board.id, updatedAt: ts })
        }
        for (const c of boardCards) {
          if (!c.labelIds?.some((id) => map.has(id))) continue
          cards.push({ ...c, labelIds: c.labelIds.map((id) => map.get(id) ?? id), updatedAt: ts })
        }
      }
      put('labels', copies)
      put('cards', cards)
      markDeleted({ labels: legacy })
    },

    /* ---------- tableros ---------- */

    createBoard: (title) => {
      const t = clean(title, LIMITS.board)
      if (!t) return null
      const boards = live(get().boards)
        .filter((b) => !b.parentId)
        .sort(byPosition)
      const board: Board = { ...base(), title: t, position: positionAt(boards, boards.length) }
      const keys = positionsFor(DEFAULT_COLUMNS.length)
      const columns: Column[] = DEFAULT_COLUMNS.map((name, i) => ({
        ...base(),
        boardId: board.id,
        title: name,
        position: keys[i],
        ...(name === 'En curso' ? { kind: 'doing' as const } : {}),
        ...(name === 'Listo' ? { kind: 'done' as const } : {}),
      }))
      put('boards', [board])
      put('columns', columns)
      return board.id
    },

    createSubboard: (parentId, labelId, title) => {
      const s = get()
      const parent = live(s.boards).find((b) => b.id === parentId)
      const label = live(s.labels).find((l) => l.id === labelId)
      // Un solo nivel; la etiqueta es del padre; una etiqueta, un subtablero; solo el dueño crea.
      if (!parent || parent.parentId || roleOf(parentId) !== 'owner') return null
      if (!label || label.boardId !== parentId) return null
      const kids = live(s.boards).filter((b) => b.parentId === parentId)
      if (kids.some((b) => b.linkLabelId === labelId)) return null
      const t = clean(title ?? label.name, LIMITS.board)
      if (!t) return null
      const sub: Board = {
        ...base(),
        title: t,
        position: positionAt(kids.sort(byPosition), kids.length),
        parentId,
        linkLabelId: labelId,
        color: parent.color,
        icon: parent.icon,
      }
      if (!sub.color) delete sub.color
      if (!sub.icon) delete sub.icon
      put('boards', [sub])
      return sub.id
    },

    renameBoard: (id, title) => {
      const t = clean(title, LIMITS.board)
      const b = get().boards.find((x) => x.id === id)
      if (!t || !b) return false
      put('boards', [{ ...b, title: t, updatedAt: stamp() }])
      return true
    },

    setBoardAppearance: (id, look) => {
      const b = get().boards.find((x) => x.id === id && !x.deletedAt)
      if (!b) return false
      // Los valores desconocidos se normalizan; lo que no se pide se deja como estaba.
      const color = look.color === undefined ? b.color : boardColorOf(look)
      const icon = look.icon === undefined ? b.icon : boardIconOf(look)
      if (color === b.color && icon === b.icon) return true
      put('boards', [{ ...b, color, icon, updatedAt: stamp() }])
      return true
    },

    deleteBoard: (id) => {
      const s = get()
      const board = live(s.boards).find((b) => b.id === id)
      if (!board) return
      // Un subtablero es solo una vista: al borrarlo se van él y sus subetiquetas, no las tarjetas.
      if (board.parentId) {
        const snap: Snapshot = {
          boards: [board],
          labels: live(s.labels).filter((l) => l.boardId === id),
        }
        markDeleted(snap)
        notify(`Subtablero “${board.title}” eliminado`, () => restore(snap))
        return
      }
      const cardIds = live(s.cards)
        .filter((c) => c.boardId === id)
        .map((c) => c.id)
      const kids = live(s.boards).filter((b) => b.parentId === id)
      const kidIds = new Set(kids.map((b) => b.id))
      const snap: Snapshot = {
        boards: [board, ...kids],
        columns: live(s.columns).filter((c) => c.boardId === id),
        labels: live(s.labels).filter((l) => kidIds.has(l.boardId ?? '')),
        ...cardSnapshot(cardIds),
      }
      markDeleted(snap)
      notify(`Tablero “${board.title}” eliminado`, () => restore(snap))
    },

    /* ---------- columnas ---------- */

    addColumn: (boardId, title) => {
      const t = clean(title, LIMITS.column)
      const cols = colsOf(boardId)
      if (!t || cols.length >= MAX_COLUMNS) return null
      const col: Column = { ...base(), boardId, title: t, position: positionAt(cols, cols.length) }
      put('columns', [col])
      return col.id
    },

    renameColumn: (id, title) => {
      const t = clean(title, LIMITS.column)
      const c = get().columns.find((x) => x.id === id)
      if (!t || !c) return false
      put('columns', [{ ...c, title: t, updatedAt: stamp() }])
      return true
    },

    deleteColumn: (id, moveToId) => {
      const col = live(get().columns).find((c) => c.id === id)
      if (!col) return false
      if (colsOf(col.boardId).length <= 1) return false // mínimo 1 columna
      const cards = cardsOf(id)

      if (moveToId && cards.length > 0) {
        const dest = live(get().columns).find((c) => c.id === moveToId)
        const limit = dest ? limitOf(dest) : null
        if (limit !== null && cardsOf(moveToId).length + cards.length > limit) return false
        // al final de la columna destino, conservando el orden
        const ts = stamp()
        const placed: Card[] = cardsOf(moveToId)
        const moved: Card[] = []
        for (const c of cards) {
          const m = {
            ...c,
            columnId: moveToId,
            position: positionAt(placed, placed.length),
            updatedAt: ts,
          }
          placed.push(m)
          moved.push(m)
        }
        put('cards', moved)
        markDeleted({ columns: [col] })
        notify(`Columna “${col.title}” eliminada`, () => {
          restore({ columns: [col] })
          put(
            'cards',
            cards.map((c) => ({ ...c, updatedAt: stamp() })),
          )
        })
        return true
      }

      const snap: Snapshot = { columns: [col], ...cardSnapshot(cards.map((c) => c.id)) }
      markDeleted(snap)
      notify(`Columna “${col.title}” eliminada`, () => restore(snap))
      return true
    },

    moveBoard: (id, index) => {
      const board = live(get().boards).find((b) => b.id === id)
      if (!board || roleOf(id) !== 'owner') return
      // Se ordena entre sus hermanos: los tableros de primer nivel, o los subtableros del mismo padre.
      const mine = live(get().boards)
        .filter((b) => b.id !== id && roleOf(b.id) === 'owner' && b.parentId === board.parentId)
        .sort(byPosition)
      put('boards', [{ ...board, position: positionAt(mine, index), updatedAt: stamp() }])
    },

    moveColumn: (id, index) => {
      const col = get().columns.find((c) => c.id === id)
      if (!col) return
      const siblings = colsOf(col.boardId).filter((c) => c.id !== id)
      put('columns', [{ ...col, position: positionAt(siblings, index), updatedAt: stamp() }])
    },

    setColumnKind: (id, kind) => {
      const col = live(get().columns).find((c) => c.id === id)
      if (!col) return false
      const limit = limitOf({ kind })
      if (limit !== null && cardsOf(id).length > limit) {
        notify(
          `“${col.title}” tiene ${cardsOf(id).length} tarjetas y ${COLUMN_KIND_NAMES[kind]} admite ${limit}. Mueve algunas primero.`,
        )
        return false
      }
      const next: Column = { ...col, updatedAt: stamp() }
      if (kind === 'standard') delete next.kind
      else next.kind = kind
      put('columns', [next])
      return true
    },

    /* ---------- tarjetas ---------- */

    addCard: (columnId, title, labelId) => {
      const t = clean(title, LIMITS.card)
      const col = live(get().columns).find((c) => c.id === columnId)
      if (!t || !col) return null
      if (isFull(col)) {
        notifyFull(col)
        return null
      }
      const cards = cardsOf(columnId)
      const card: Card = {
        ...base(),
        boardId: col.boardId,
        columnId,
        title: t,
        position: positionAt(cards, cards.length),
        ...(labelId && live(get().labels).some((l) => l.id === labelId)
          ? { labelIds: [labelId] }
          : {}),
      }
      put('cards', [card])
      return card.id
    },

    updateCard: (id, patch) => {
      const c = get().cards.find((x) => x.id === id)
      if (!c) return false
      const next = { ...c, ...patch }
      if (patch.title !== undefined) {
        const t = clean(patch.title, LIMITS.card)
        if (!t) return false
        next.title = t
      }
      if (patch.description !== undefined) {
        if (patch.description.length > LIMITS.description) return false
        next.description = patch.description || undefined
      }
      if (next.startDate && next.endDate && next.endDate < next.startDate) return false
      if (!next.assigneeId) delete next.assigneeId
      put('cards', [{ ...next, updatedAt: stamp() }])
      return true
    },

    moveCard: (id, toColumnId, index) => {
      const card = get().cards.find((c) => c.id === id)
      const col = live(get().columns).find((c) => c.id === toColumnId)
      if (!card || !col) return false
      const siblings = cardsOf(toColumnId).filter((c) => c.id !== id)
      const limit = limitOf(col)
      if (card.columnId !== toColumnId && limit !== null && siblings.length >= limit) {
        notifyFull(col)
        return false
      }
      put('cards', [
        {
          ...card,
          columnId: toColumnId,
          boardId: col.boardId,
          position: positionAt(siblings, index),
          updatedAt: stamp(),
        },
      ])
      return true
    },

    moveCardToBoard: (id, toColumnId) => {
      const st = get()
      const card = live(st.cards).find((c) => c.id === id)
      const col = live(st.columns).find((c) => c.id === toColumnId)
      if (!card || !col) return false
      if (col.boardId === card.boardId)
        return get().moveCard(id, toColumnId, cardsOf(toColumnId).length)
      const from = live(st.boards).find((b) => b.id === card.boardId)
      const to = live(st.boards).find((b) => b.id === col.boardId)
      // Mismo dueño y permiso de edición en los dos: así el servidor guarda todo bajo la misma cuenta.
      if (!from || !to || to.parentId || (from.ownerId ?? null) !== (to.ownerId ?? null))
        return false
      if (!canEditBoard(from.id) || !canEditBoard(to.id)) return false
      const siblings = cardsOf(toColumnId)
      const limit = limitOf(col)
      if (limit !== null && siblings.length >= limit) {
        notifyFull(col)
        return false
      }

      // Las etiquetas son de cada tablero: se usa la del mismo nombre o se crea igual en el destino.
      const labelIds: string[] = []
      for (const lid of card.labelIds ?? []) {
        const src = live(get().labels).find((l) => l.id === lid)
        // Las subetiquetas solo viven en su subtablero: no viajan a otro tablero.
        if (!src || src.boardId !== card.boardId) continue
        const found = live(get().labels).find(
          (l) => l.boardId === to.id && l.name.toLowerCase() === src.name.toLowerCase(),
        )
        const target = found?.id ?? get().createLabel(to.id, src.name, src.color)
        if (target && !labelIds.includes(target)) labelIds.push(target)
      }
      // La persona asignada se conserva solo si también participa en el tablero destino.
      const people = participantIds(to.id)
      const keepAssignee = !!card.assigneeId && (!people || people.includes(card.assigneeId))

      const ts = stamp()
      const moved: Card = {
        ...card,
        columnId: toColumnId,
        boardId: to.id,
        position: positionAt(siblings, siblings.length),
        labelIds: labelIds.length ? labelIds : undefined,
        updatedAt: ts,
      }
      if (!labelIds.length) delete moved.labelIds
      if (!keepAssignee) delete moved.assigneeId
      put('cards', [moved])
      const snap = cardSnapshot([id])
      for (const k of ['items', 'comments', 'attachments', 'likes'] as const) {
        const rows = snap[k]
        if (rows?.length)
          put(k, rows.map((r) => ({ ...r, boardId: to.id, updatedAt: ts })) as never)
      }
      notify(`Tarjeta movida a “${to.title}” · ${col.title}`)
      return true
    },

    deleteCard: (id) => {
      const card = live(get().cards).find((c) => c.id === id)
      if (!card) return
      const snap = cardSnapshot([id])
      markDeleted(snap)
      notify(`Tarjeta “${card.title}” eliminada`, () => {
        const col = live(get().columns).find((c) => c.id === card.columnId)
        if (col && isFull(col)) {
          notify(`No se pudo deshacer: “${col.title}” ya está en su límite de tarjetas.`)
          return
        }
        restore(snap)
      })
    },

    /* ---------- etiquetas ---------- */

    createLabel: (boardId, name, color) => {
      const n = clean(name, LIMITS.label)
      const labels = live(get().labels).filter((l) => l.boardId === boardId)
      if (!n || !LABEL_COLORS.includes(color) || labels.length >= LIMITS.labels) return null
      if (!live(get().boards).some((b) => b.id === boardId)) return null
      // Un nombre = una etiqueta por tablero (sin distinguir mayúsculas): evita "Coppel" y "coppel" a la vez.
      if (labels.some((l) => l.name.toLowerCase() === n.toLowerCase())) return null
      const label: Label = { ...base(), name: n, color, boardId }
      put('labels', [label])
      return label.id
    },

    updateLabel: (id, patch) => {
      const l = live(get().labels).find((x) => x.id === id)
      if (!l) return false
      const next = { ...l }
      if (patch.name !== undefined) {
        const n = clean(patch.name, LIMITS.label)
        if (!n) return false
        const dup = live(get().labels).some(
          (x) => x.id !== id && x.boardId === l.boardId && x.name.toLowerCase() === n.toLowerCase(),
        )
        if (dup) return false
        next.name = n
      }
      if (patch.color !== undefined) {
        if (!LABEL_COLORS.includes(patch.color)) return false
        next.color = patch.color
      }
      put('labels', [{ ...next, updatedAt: stamp() }])
      return true
    },

    deleteLabel: (id) => {
      const l = live(get().labels).find((x) => x.id === id)
      if (!l) return
      // Las tarjetas conservan el id; al mostrarse se ignoran las etiquetas eliminadas (y "Deshacer" las recupera).
      // Si la etiqueta vincula un subtablero, el subtablero (y sus subetiquetas) se va con ella.
      const subs = live(get().boards).filter((b) => b.linkLabelId === id)
      const subIds = new Set(subs.map((b) => b.id))
      const snap: Snapshot = {
        labels: [l, ...live(get().labels).filter((x) => subIds.has(x.boardId ?? ''))],
        ...(subs.length ? { boards: subs } : {}),
      }
      markDeleted(snap)
      set((s) => ({ labelFilter: s.labelFilter.filter((f) => f !== id) }))
      notify(
        subs.length
          ? `Etiqueta “${l.name}” y su subtablero eliminados`
          : `Etiqueta “${l.name}” eliminada`,
        () => restore(snap),
      )
    },

    toggleCardLabel: (cardId, labelId) => {
      const c = live(get().cards).find((x) => x.id === cardId)
      const l = live(get().labels).find((x) => x.id === labelId)
      if (!c || !l || (l.boardId !== c.boardId && subOf(l.boardId ?? '') !== c.boardId))
        return false
      const current = (c.labelIds ?? []).filter((id) => live(get().labels).some((x) => x.id === id))
      const has = current.includes(labelId)
      if (!has && current.length >= LIMITS.cardLabels) return false
      const next = has ? current.filter((id) => id !== labelId) : [...current, labelId]
      put('cards', [{ ...c, labelIds: next.length ? next : undefined, updatedAt: stamp() }])
      return true
    },

    setLabelFilter: (ids) => set({ labelFilter: ids }),
    setAssigneeFilter: (ids) => set({ assigneeFilter: ids }),

    /* ---------- imágenes ---------- */

    addAttachment: (cardId, meta, blob) => {
      const card = live(get().cards).find((c) => c.id === cardId)
      const count = live(get().attachments).filter(
        (a) => a.cardId === cardId && !!a.inline === !!meta.inline,
      ).length
      const max = meta.inline ? LIMITS.inlineImages : LIMITS.attachments
      if (!card || count >= max) return null
      const ext = meta.mime.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
      const att: Attachment = { ...base(), ...meta, cardId, path: '' }
      att.path = `${att.id}.${ext}`
      // El archivo se guarda antes que la fila para que el motor de sync siempre lo encuentre.
      enqueue(() => db.blobs.put({ id: att.id, blob, uploaded: false }))
      put('attachments', [att])
      return att.id
    },

    deleteAttachment: (id) => {
      const a = live(get().attachments).find((x) => x.id === id)
      if (!a) return
      markDeleted({ attachments: [a] })
      notify('Imagen eliminada', () => restore({ attachments: [a] }))
    },

    /* ---------- checklist ---------- */

    addItem: (cardId, text) => {
      const t = clean(text, LIMITS.item)
      const items = itemsOf(cardId)
      if (!t || items.length >= LIMITS.items) return null
      const item: ChecklistItem = {
        ...base(),
        cardId,
        text: t,
        done: false,
        position: positionAt(items, items.length),
      }
      put('items', [item])
      return item.id
    },

    toggleItem: (id) => {
      const i = get().items.find((x) => x.id === id)
      if (i) put('items', [{ ...i, done: !i.done, updatedAt: stamp() }])
    },

    updateItem: (id, text) => {
      const t = clean(text, LIMITS.item)
      const i = get().items.find((x) => x.id === id)
      if (!t || !i) return false
      put('items', [{ ...i, text: t, updatedAt: stamp() }])
      return true
    },

    deleteItem: (id) => {
      const i = live(get().items).find((x) => x.id === id)
      if (!i) return
      markDeleted({ items: [i] })
      notify('Ítem eliminado', () => restore({ items: [i] }))
    },

    moveItem: (id, index) => {
      const item = get().items.find((x) => x.id === id)
      if (!item) return
      const siblings = itemsOf(item.cardId).filter((x) => x.id !== id)
      put('items', [{ ...item, position: positionAt(siblings, index), updatedAt: stamp() }])
    },

    removeChecklist: (cardId) => {
      const items = itemsOf(cardId)
      if (items.length === 0) return
      markDeleted({ items })
      notify('Lista de tareas eliminada', () => restore({ items }))
    },

    /* ---------- comentarios ---------- */

    addComment: (cardId, bodyMd) => {
      const body = clean(bodyMd, LIMITS.comment)
      if (!body) return null
      const authorId = currentUserId() ?? undefined
      const comment: Comment = {
        ...base(),
        cardId,
        bodyMd: body,
        ...(authorId ? { authorId } : {}),
      }
      put('comments', [comment])
      return comment.id
    },

    addReply: (parentId, bodyMd) => {
      const body = clean(bodyMd, LIMITS.comment)
      const target = live(get().comments).find((c) => c.id === parentId)
      if (!body || !target) return null
      const rootId = target.parentId ?? target.id // las respuestas no se anidan: cuelgan de la actualización
      const authorId = currentUserId() ?? undefined
      const reply: Comment = {
        ...base(),
        cardId: target.cardId,
        bodyMd: body,
        parentId: rootId,
        ...(authorId ? { authorId } : {}),
      }
      put('comments', [reply])
      return reply.id
    },

    toggleLike: (commentId) => {
      const c = live(get().comments).find((x) => x.id === commentId)
      if (!c) return
      const me = currentUserId() ?? LOCAL_USER
      const mine = live(get().likes).filter((l) => l.commentId === commentId && l.userId === me)
      if (mine.length > 0) {
        markDeleted({ likes: mine }) // también si hubo duplicados por dos dispositivos
        return
      }
      const like: Like = { ...base(), cardId: c.cardId, commentId, userId: me }
      put('likes', [like])
    },

    editComment: (id, bodyMd) => {
      const body = clean(bodyMd, LIMITS.comment)
      const c = get().comments.find((x) => x.id === id)
      if (!body || !c) return false
      const ts = stamp()
      put('comments', [{ ...c, bodyMd: body, editedAt: ts, updatedAt: ts }])
      return true
    },

    deleteComment: (id) => {
      const c = live(get().comments).find((x) => x.id === id)
      if (!c) return
      // Al borrar una actualización se van con ella sus respuestas y sus "me gusta".
      const replies = live(get().comments).filter((x) => x.parentId === id)
      const ids = new Set([id, ...replies.map((r) => r.id)])
      const snap: Snapshot = {
        comments: [c, ...replies],
        likes: live(get().likes).filter((l) => ids.has(l.commentId)),
      }
      markDeleted(snap)
      notify(c.parentId ? 'Respuesta eliminada' : 'Actualización eliminada', () => restore(snap))
    },

    dismissToast: () => set({ toast: null }),
  }
})

/** Borra todos los datos locales (cambio de cuenta / cerrar sesión). */
export async function wipeLocal(): Promise<void> {
  await flush()
  await Promise.all(db.tables.map((t) => t.clear()))
  useStore.setState({ ...emptyData(), toast: null, labelFilter: [], assigneeFilter: [] })
}

/** Solo para tests: fuerza que el próximo init() vuelva a leer de IndexedDB. */
export const resetInit = () => {
  initPromise = null
}

/** Solo para tests: vacía memoria y base local. */
export async function resetStore(): Promise<void> {
  await flush()
  resetInit()
  await Promise.all(db.tables.map((t) => t.clear()))
  useStore.setState({
    ...emptyData(),
    ready: false,
    toast: null,
    labelFilter: [],
    assigneeFilter: [],
  })
}
