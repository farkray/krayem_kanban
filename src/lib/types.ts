interface Base {
  id: string
  createdAt: string // ISO
  updatedAt: string // ISO
  deletedAt?: string // borrado lógico
}

/** Colores de etiqueta disponibles (la paleta vive en tokens.css: --label-<color>-*). */
export const LABEL_COLORS = [
  'blue',
  'green',
  'red',
  'orange',
  'yellow',
  'purple',
  'pink',
  'gray',
] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  blue: 'Azul',
  green: 'Verde',
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  purple: 'Morado',
  pink: 'Rosa',
  gray: 'Gris',
}

/** Etiqueta para identificar, p. ej., la empresa de un pendiente ("Coppel" · Azul). Es global del usuario. */
export interface Label extends Base {
  name: string
  color: LabelColor
}

export interface Board extends Base {
  title: string
  position: string
}

/** Tipo de columna: define el límite de tarjetas simultáneas (regla WIP). */
export const COLUMN_KINDS = ['standard', 'next', 'doing'] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]

export const COLUMN_KIND_NAMES: Record<ColumnKind, string> = {
  standard: 'Estándar',
  next: 'Next',
  doing: 'Doing',
}

/** Máximo de tarjetas por tipo de columna; `standard` no tiene límite. */
export const WIP_LIMITS: Record<ColumnKind, number | null> = {
  standard: null,
  next: 4,
  doing: 2,
}

export const kindOf = (c: { kind?: ColumnKind }): ColumnKind => c.kind ?? 'standard'
export const limitOf = (c: { kind?: ColumnKind }): number | null => WIP_LIMITS[kindOf(c)]

export interface Column extends Base {
  boardId: string
  title: string
  position: string
  kind?: ColumnKind // ausente = estándar
}

export interface Card extends Base {
  boardId: string
  columnId: string
  title: string
  description?: string
  position: string
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD, >= startDate
  coverAttachmentId?: string // imagen de portada (un Attachment de esta tarjeta)
  labelIds?: string[] // etiquetas asignadas (ids de Label)
}

export interface Attachment extends Base {
  cardId: string
  name: string
  /** Ruta dentro del bucket del usuario: `${id}.webp`. */
  path: string
  mime: string
  sizeOriginal: number
  sizeCompressed: number
  width: number
  height: number
}

export interface ChecklistItem extends Base {
  cardId: string
  text: string
  done: boolean
  position: string
}

export interface Comment extends Base {
  cardId: string
  bodyMd: string
  editedAt?: string
}

export interface Data {
  boards: Board[]
  labels: Label[]
  columns: Column[]
  cards: Card[]
  attachments: Attachment[]
  items: ChecklistItem[]
  comments: Comment[]
}

export type TableKey = keyof Data

/** Orden de dependencias: los padres antes que los hijos (también el orden de envío a la nube). */
export const TABLE_KEYS: TableKey[] = [
  'boards',
  'labels',
  'columns',
  'cards',
  'attachments',
  'items',
  'comments',
]

export const MAX_COLUMNS = 5
export const DEFAULT_COLUMNS = ['Por hacer', 'En curso', 'Listo']
export const LIMITS = {
  board: 60,
  column: 40,
  card: 200,
  description: 10000,
  item: 200,
  items: 100,
  comment: 10000,
  attachments: 10,
  label: 30,
  labels: 50,
  cardLabels: 8,
} as const

/** Imagen de entrada máxima (antes de comprimir). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
