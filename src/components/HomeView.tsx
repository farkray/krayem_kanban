import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { announcements, screenReaderInstructions } from '../lib/dndA11y'
import { pluralize } from '../lib/format'
import { LIMITS } from '../lib/types'
import type { BoardSummary } from '../store/hooks'
import { BoardTile } from './BoardTile'
import { GripIcon, PlusIcon } from './Icons'
import { InlineInput } from './InlineInput'
import styles from './HomeView.module.css'

interface Props {
  boards: BoardSummary[]
  onOpen: (id: string) => void
  onCreate: (title: string) => void
  /** Mueve uno de mis tableros al lugar `index` entre los míos. */
  onMove?: (id: string, index: number) => void
}

function Tile({
  board: b,
  onOpen,
  sortable,
}: {
  board: BoardSummary
  onOpen: () => void
  sortable: boolean
}) {
  const s = useSortable({ id: b.id, disabled: !sortable })
  return (
    <div
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={`${styles.cell} ${s.isDragging ? styles.dragging : ''}`}
    >
      <button type="button" className={styles.tile} onClick={onOpen}>
        <BoardTile className={styles.icon} color={b.color} icon={b.icon} size={20} />
        <span className={styles.name}>{b.title}</span>
        <span className={styles.meta}>
          {pluralize(b.columnCount, 'columna', 'columnas')} ·{' '}
          {pluralize(b.cardCount, 'tarjeta', 'tarjetas')}
        </span>
      </button>
      {sortable && (
        <button
          type="button"
          ref={s.setActivatorNodeRef}
          className={styles.grip}
          aria-label={`Mover tablero ${b.title}`}
          title="Arrastra para cambiar el orden"
          {...s.attributes}
          aria-roledescription="tablero que se puede mover"
          {...s.listeners}
        >
          <GripIcon width={18} height={18} />
        </button>
      )}
    </div>
  )
}

export function HomeView({ boards, onOpen, onCreate, onMove }: Props) {
  const [creating, setCreating] = useState(false)
  const mine = boards.filter((b) => !b.sharedBy)
  const canSort = !!onMove && mine.length > 1
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
  const nameOf = (id: string | number) => boards.find((b) => b.id === id)?.title ?? ''
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const to = mine.findIndex((b) => b.id === over.id)
    if (to >= 0) onMove?.(String(active.id), to)
  }

  return (
    <div className={styles.home}>
      <h1 className={styles.title}>Mis tableros</h1>
      {boards.length === 0 && (
        <p className={styles.hint}>Aún no tienes tableros. Crea el primero.</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: announcements(nameOf, 'el tablero'),
          screenReaderInstructions,
        }}
      >
        <SortableContext items={mine.map((b) => b.id)} strategy={rectSortingStrategy}>
          <div className={styles.grid}>
            {boards.map((b) => (
              <Tile
                key={b.id}
                board={b}
                sortable={canSort && !b.sharedBy}
                onOpen={() => onOpen(b.id)}
              />
            ))}
            {creating ? (
              <div className={styles.tile}>
                <InlineInput
                  label="Nombre del tablero"
                  placeholder="Nombre del tablero"
                  maxLength={LIMITS.board}
                  onSubmit={(t) => {
                    onCreate(t)
                    setCreating(false)
                  }}
                  onCancel={() => setCreating(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.tile} ${styles.new}`}
                onClick={() => setCreating(true)}
              >
                <PlusIcon width={24} height={24} />
                <span className={styles.name}>Nuevo tablero</span>
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
