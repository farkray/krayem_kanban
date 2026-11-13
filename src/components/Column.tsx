import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCanEdit } from '../lib/CanEdit'
import { useViewBoard } from '../lib/ViewBoard'
import { pluralize } from '../lib/format'
import {
  COLUMN_KIND_NAMES,
  LIMITS,
  kindOf,
  limitOf,
  type Card as CardModel,
  type Column as ColumnModel,
} from '../lib/types'
import { useStore } from '../store/store'
import { SortableCard, type CardStats } from './Card'
import { ColumnKindMenu } from './ColumnKindMenu'
import { DeleteColumnDialog } from './DeleteColumnDialog'
import { GripIcon, PlusIcon, TrashIcon } from './Icons'
import { InlineInput } from './InlineInput'
import styles from './Column.module.css'

interface Props {
  column: ColumnModel
  siblings: ColumnModel[]
  cards: CardModel[]
  /** Total de tarjetas de la columna (con filtro activo, `cards` son solo las que coinciden). */
  total?: number
  stats: Map<string, CardStats>
  /** Tarjetas por columna del tablero (para validar límites al eliminar). */
  counts?: Map<string, number>
  isLast: boolean
  /** Hay una tarjeta arrastrada sobre esta columna: se resalta como destino. */
  dropTarget?: boolean
  /** La tarjeta arrastrada no cabe aquí (columna en su límite). */
  blocked?: boolean
  /** Etapa de la columna: inicio, en proceso o terminada (punto de color junto al contador). */
  tone?: 'start' | 'progress' | 'done'
  /** Recién creada: nace con el nombre en edición y a la vista. */
  startRenaming?: boolean
  onRenameStarted?: () => void
  onOpenCard: (id: string) => void
}

export function Column({
  column,
  siblings,
  cards,
  total = cards.length,
  stats,
  counts,
  isLast,
  dropTarget,
  blocked,
  tone = 'start',
  startRenaming = false,
  onRenameStarted,
  onOpenCard,
}: Props) {
  const renameColumn = useStore((s) => s.renameColumn)
  const deleteColumn = useStore((s) => s.deleteColumn)
  const addCard = useStore((s) => s.addCard)
  const setColumnKind = useStore((s) => s.setColumnKind)
  const canEdit = useCanEdit()
  // En un subtablero las columnas son las del padre: se ven, pero solo se cambian allá.
  const view = useViewBoard()
  const canEditColumns = canEdit && !view?.linkLabelId
  const kind = kindOf(column)
  const limit = limitOf(column)
  const full = limit !== null && total >= limit

  const [renaming, setRenaming] = useState(startRenaming)
  const root = useRef<HTMLElement | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sortable = useSortable({
    id: `col:${column.id}`,
    data: { type: 'column', columnId: column.id },
    disabled: !canEditColumns,
  })
  // Recién creada: se lleva a la vista (el tablero se desplaza en horizontal) y se avisa al tablero.
  useEffect(() => {
    if (!startRenaming) return
    root.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
    onRenameStarted?.()
  }, [startRenaming, onRenameStarted])

  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop:${column.id}`,
    data: { type: 'column', columnId: column.id },
  })

  return (
    <section
      ref={(el) => {
        sortable.setNodeRef(el)
        root.current = el
      }}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`${styles.column} ${sortable.isDragging ? styles.dragging : ''} ${dropTarget ? (blocked ? styles.dropBlocked : styles.dropTarget) : ''}`}
      aria-label={column.title}
    >
      <header className={styles.header}>
        {canEditColumns && (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            className={styles.grip}
            aria-label={`Mover columna ${column.title}`}
            title="Arrastra para mover la columna"
            {...sortable.attributes}
            aria-roledescription="columna que se puede mover"
            {...sortable.listeners}
          >
            <GripIcon width={18} height={18} />
          </button>
        )}
        <div className={styles.headText}>
          {renaming ? (
            <InlineInput
              initial={column.title}
              label="Nombre de la columna"
              maxLength={LIMITS.column}
              submitOnBlur
              onSubmit={(t) => {
                renameColumn(column.id, t)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h3 className={styles.title}>
              <button
                type="button"
                className={styles.titleBtn}
                onClick={() => canEditColumns && setRenaming(true)}
                title={canEditColumns ? 'Renombrar' : undefined}
              >
                {column.title}
              </button>
            </h3>
          )}
          <span className={styles.count}>
            <span className={`${styles.dot} ${styles[tone]}`} aria-hidden="true" />
            {total === cards.length
              ? pluralize(cards.length, 'tarjeta', 'tarjetas')
              : `${cards.length} de ${pluralize(total, 'tarjeta', 'tarjetas')}`}
            {kind === 'done' && <span className={styles.doneTag}>Done</span>}
            {limit !== null && (
              <span
                className={`${styles.wip} ${full ? styles.wipFull : ''}`}
                title={`${COLUMN_KIND_NAMES[kind]}: máximo ${limit} tarjetas`}
              >
                {COLUMN_KIND_NAMES[kind]} {total}/{limit}
              </span>
            )}
          </span>
        </div>
        {canEditColumns && (
          <ColumnKindMenu column={column} onChange={(k) => setColumnKind(column.id, k)} />
        )}
        {canEditColumns && (
          <button
            type="button"
            className={styles.delete}
            aria-label={`Eliminar columna ${column.title}`}
            disabled={siblings.length <= 1}
            title={siblings.length <= 1 ? 'Un tablero necesita al menos una columna' : undefined}
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon width={15} height={15} />
          </button>
        )}
      </header>

      <div ref={setDropRef} className={styles.body}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <SortableCard
              key={c.id}
              card={c}
              stats={stats.get(c.id)}
              finished={isLast || kind === 'done'}
              done={kind === 'done'}
              onOpen={onOpenCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && !adding && (
          <p className={styles.empty}>{total > 0 ? 'Sin coincidencias' : 'Sin tarjetas'}</p>
        )}
        {!canEdit ? null : adding ? (
          <InlineInput
            label="Título de la tarjeta"
            placeholder="Título de la tarjeta"
            maxLength={LIMITS.card}
            keepOpen
            onSubmit={(t) => addCard(column.id, t, view?.linkLabelId ?? undefined)}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className={styles.add}
            disabled={full}
            onClick={() => setAdding(true)}
          >
            <PlusIcon width={16} height={16} />
            {full ? `Límite alcanzado (${limit})` : 'Agregar tarjeta'}
          </button>
        )}
      </div>

      {confirmDelete && (
        <DeleteColumnDialog
          column={column}
          others={siblings.filter((c) => c.id !== column.id)}
          cardCount={cards.length}
          countOf={(id) => counts?.get(id) ?? 0}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={(moveTo) => {
            deleteColumn(column.id, moveTo)
            setConfirmDelete(false)
          }}
        />
      )}
    </section>
  )
}

/** Vista ligera usada en el DragOverlay al arrastrar una columna. */
export function ColumnOverlay({ column, count }: { column: ColumnModel; count: number }) {
  return (
    <section className={`${styles.column} ${styles.lifted}`}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{column.title}</h3>
          <span className={styles.count}>{pluralize(count, 'tarjeta', 'tarjetas')}</span>
        </div>
      </header>
    </section>
  )
}
