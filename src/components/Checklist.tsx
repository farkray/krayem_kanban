import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { announcements, screenReaderInstructions } from '../lib/dndA11y'
import { LIMITS, type ChecklistItem } from '../lib/types'
import { useItems } from '../store/hooks'
import { useStore } from '../store/store'
import { GripIcon, TrashIcon } from './Icons'
import { InlineInput } from './InlineInput'
import styles from './Checklist.module.css'

function Row({ item }: { item: ChecklistItem }) {
  const toggleItem = useStore((s) => s.toggleItem)
  const updateItem = useStore((s) => s.updateItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const [editing, setEditing] = useState(false)
  const sortable = useSortable({ id: item.id })

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`${styles.row} ${sortable.isDragging ? styles.dragging : ''}`}
    >
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        className={styles.grip}
        aria-label={`Mover ítem ${item.text}`}
        title="Arrastra para reordenar"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripIcon width={16} height={16} />
      </button>
      <input
        type="checkbox"
        checked={item.done}
        onChange={() => toggleItem(item.id)}
        aria-label={`Completar: ${item.text}`}
      />
      {editing ? (
        <InlineInput
          initial={item.text}
          label="Texto del ítem"
          maxLength={LIMITS.item}
          submitOnBlur
          onSubmit={(t) => {
            updateItem(item.id, t)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className={`${styles.text} ${item.done ? styles.done : ''}`}
          onClick={() => setEditing(true)}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        className={styles.remove}
        aria-label={`Eliminar ítem ${item.text}`}
        onClick={() => deleteItem(item.id)}
      >
        <TrashIcon width={14} height={14} />
      </button>
    </li>
  )
}

function AddItem({ cardId }: { cardId: string }) {
  const addItem = useStore((s) => s.addItem)
  const [value, setValue] = useState('')

  const submit = () => {
    if (addItem(cardId, value)) setValue('')
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length > 1) {
      e.preventDefault()
      for (const l of lines) addItem(cardId, l)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <input
      className={styles.add}
      value={value}
      maxLength={LIMITS.item}
      placeholder="Agregar un ítem…"
      aria-label="Nuevo ítem de la lista"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  )
}

export function Checklist({ cardId }: { cardId: string }) {
  const items = useItems(cardId)
  const moveItem = useStore((s) => s.moveItem)
  const removeChecklist = useStore((s) => s.removeChecklist)
  const [opened, setOpened] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (items.length === 0 && !opened) {
    return (
      <button type="button" className={styles.openBtn} onClick={() => setOpened(true)}>
        + Agregar lista de tareas
      </button>
    )
  }

  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const to = items.findIndex((i) => i.id === e.over!.id)
    if (to >= 0) moveItem(String(e.active.id), to)
  }

  return (
    <div>
      <div className={styles.head}>
        <span className={styles.progressLabel}>{pct}%</span>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de la lista de tareas"
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <button
          type="button"
          className={styles.quitBtn}
          onClick={() => {
            removeChecklist(cardId)
            setOpened(false)
          }}
        >
          Quitar lista
        </button>
      </div>
      <DndContext
        accessibility={{
          announcements: announcements(
            (id) => items.find((i) => i.id === id)?.text ?? String(id),
            'el ítem',
          ),
          screenReaderInstructions,
        }}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.list}>
            {items.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddItem cardId={cardId} />
    </div>
  )
}
