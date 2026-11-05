import Dexie, { type Table } from 'dexie'
import type {
  Attachment,
  Board,
  Card,
  ChecklistItem,
  Column,
  Comment,
  Label,
  TableKey,
} from '../lib/types'

/** Imagen comprimida guardada en el dispositivo. `uploaded`: ya está en Storage. */
export interface BlobRow {
  id: string // = id del Attachment
  blob: Blob
  uploaded: boolean
}

export interface MetaRow {
  key: string
  value: unknown
}

/** Cambio local pendiente de enviar. Una entrada por fila; `v` cambia en cada nueva escritura. */
export interface OutboxEntry {
  key: string // `${table}:${id}`
  table: TableKey
  id: string
  v: string
}

class KanbanDB extends Dexie {
  boards!: Table<Board, string>
  labels!: Table<Label, string>
  columns!: Table<Column, string>
  cards!: Table<Card, string>
  attachments!: Table<Attachment, string>
  items!: Table<ChecklistItem, string>
  comments!: Table<Comment, string>
  meta!: Table<MetaRow, string>
  outbox!: Table<OutboxEntry, string>
  blobs!: Table<BlobRow, string>

  constructor() {
    super('kanban')
    this.version(1).stores({
      boards: 'id, position',
      columns: 'id, boardId',
      cards: 'id, columnId, boardId',
      items: 'id, cardId',
      comments: 'id, cardId',
      meta: 'key',
    })
    this.version(2).stores({
      outbox: 'key, table',
    })
    this.version(3).stores({
      attachments: 'id, cardId',
      blobs: 'id',
    })
    this.version(4).stores({
      labels: 'id',
    })
  }
}

export const db = new KanbanDB()
