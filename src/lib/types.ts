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
  /** Tablero al que pertenece (las etiquetas son del tablero y se comparten con él). */
  boardId?: string
}

/**
 * Aspecto de un tablero: un color y un icono para reconocerlo de un vistazo (100 combinaciones).
 * El color y el icono juntos identifican; así no depende solo del tono (daltonismo). Los colores
 * están ordenados por tono para escanearlos fácil, y el neutro (grafito) va al final.
 */
export const BOARD_COLORS = [
  'petroleo',
  'cielo',
  'azul',
  'morado',
  'rosa',
  'rojo',
  'naranja',
  'marron',
  'verde',
  'grafito',
] as const
export type BoardColor = (typeof BOARD_COLORS)[number]

export const BOARD_COLOR_NAMES: Record<BoardColor, string> = {
  petroleo: 'Petróleo',
  cielo: 'Cielo',
  azul: 'Azul',
  morado: 'Morado',
  rosa: 'Rosa',
  rojo: 'Rojo',
  naranja: 'Naranja',
  marron: 'Marrón',
  verde: 'Verde',
  grafito: 'Grafito',
}

export const BOARD_ICONS = [
  'tablero',
  'trabajo',
  'estudio',
  'codigo',
  'grafica',
  'anuncio',
  'casa',
  'corazon',
  'estrella',
  'cohete',
] as const
export type BoardIconName = (typeof BOARD_ICONS)[number]

export const BOARD_ICON_NAMES: Record<BoardIconName, string> = {
  tablero: 'Tablero',
  trabajo: 'Trabajo',
  estudio: 'Estudio',
  codigo: 'Código',
  grafica: 'Gráfica',
  anuncio: 'Anuncio',
  casa: 'Casa',
  corazon: 'Personal',
  estrella: 'Favorito',
  cohete: 'Lanzamiento',
}

/** Nombre con el que nace una columna nueva; enseguida se abre para renombrarla. */
export const DEFAULT_COLUMN_TITLE = 'Nueva columna'

export const DEFAULT_BOARD_COLOR: BoardColor = 'petroleo'
export const DEFAULT_BOARD_ICON: BoardIconName = 'tablero'

/** Valores desconocidos (p. ej. de una versión más nueva) caen al aspecto por defecto. */
export const boardColorOf = (b: { color?: string }): BoardColor =>
  (BOARD_COLORS as readonly string[]).includes(b.color ?? '')
    ? (b.color as BoardColor)
    : DEFAULT_BOARD_COLOR
export const boardIconOf = (b: { icon?: string }): BoardIconName =>
  (BOARD_ICONS as readonly string[]).includes(b.icon ?? '')
    ? (b.icon as BoardIconName)
    : DEFAULT_BOARD_ICON

export interface Board extends Base {
  title: string
  position: string
  color?: BoardColor // ausente = petróleo
  icon?: BoardIconName // ausente = tablero
  /** Dueño del tablero: lo pone el servidor al descargar. Ausente = tablero propio creado aquí. */
  ownerId?: string
}

/** Tipo de columna: define el límite de tarjetas simultáneas (regla WIP). */
export const COLUMN_KINDS = ['standard', 'next', 'doing', 'done'] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]

export const COLUMN_KIND_NAMES: Record<ColumnKind, string> = {
  standard: 'Estándar',
  next: 'Next',
  doing: 'Doing',
  done: 'Done',
}

/** Máximo de tarjetas por tipo de columna; `standard` no tiene límite. */
export const WIP_LIMITS: Record<ColumnKind, number | null> = {
  standard: null,
  next: 4,
  doing: 2,
  done: null, // finalizados: sin límite
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
  assigneeId?: string // persona asignada (id de usuario; debe participar en el tablero)
}

export interface Attachment extends Base {
  cardId: string
  boardId?: string
  name: string
  /** Ruta dentro del bucket del usuario: `${id}.webp`. */
  path: string
  mime: string
  sizeOriginal: number
  sizeCompressed: number
  width: number
  height: number
  /** Imagen pegada dentro de una actualización: no aparece en la galería de la tarjeta. */
  inline?: boolean
}

export interface ChecklistItem extends Base {
  cardId: string
  boardId?: string
  text: string
  done: boolean
  position: string
}

export interface Comment extends Base {
  cardId: string
  boardId?: string
  bodyMd: string
  editedAt?: string
  /** Quién la escribió (id de usuario). Ausente en las antiguas y en el modo solo-local. */
  authorId?: string
  /** Si es una respuesta, la actualización a la que responde (las respuestas no se anidan más). */
  parentId?: string
}

/**
 * "Me gusta" de una persona en una actualización. Es una fila aparte (no un campo de la
 * actualización) para que dos personas puedan dar "me gusta" a la vez sin pisarse, y para que
 * también puedan darlo quienes solo leen el tablero. Quitarlo es un borrado lógico.
 */
export interface Like extends Base {
  cardId: string
  boardId?: string
  commentId: string
  userId: string
}

export interface Data {
  boards: Board[]
  labels: Label[]
  columns: Column[]
  cards: Card[]
  attachments: Attachment[]
  items: ChecklistItem[]
  comments: Comment[]
  likes: Like[]
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
  'likes',
]

export const MAX_COLUMNS = 10
export const DEFAULT_COLUMNS = ['Por hacer', 'En curso', 'Listo']
export const LIMITS = {
  board: 60,
  column: 40,
  card: 200,
  description: 10000,
  item: 400, // texto guardado (las menciones ocupan más que lo que se ve)
  itemText: 200, // lo que se puede escribir en un ítem
  items: 100,
  comment: 10000,
  attachments: 10,
  inlineImages: 100,
  label: 30,
  labels: 50,
  cardLabels: 8,
} as const

/** Imagen de entrada máxima (antes de comprimir). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Valor del filtro por persona que significa "sin asignar". */
export const ASSIGNEE_NONE = '__none__'
