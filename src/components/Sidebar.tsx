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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { announcements, screenReaderInstructions } from '../lib/dndA11y'
import { pluralize } from '../lib/format'
import { LIMITS } from '../lib/types'
import type { BoardSummary } from '../store/hooks'
import { BoardTile } from './BoardTile'
import { GripIcon, PlusIcon, SidebarIcon } from './Icons'
import { InlineInput } from './InlineInput'
import { InstallButton } from './PwaPrompts'
import styles from './Sidebar.module.css'

interface Props {
  boards: BoardSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  /** Mueve uno de mis tableros al lugar `index` entre los míos. */
  onMove?: (id: string, index: number) => void
  onToggle: () => void
  /** Panel deslizable sobre el contenido (pantallas angostas). */
  drawer?: boolean
  /** Correo de la sesión y cierre de sesión (solo con nube configurada). */
  account?: {
    email: string | null
    onSignOut: () => void
    onChangePassword: () => void
    /** Elegir por qué canales recibir avisos fuera de la app (correo, WhatsApp). */
    onAlerts: () => void
    /** Solo administradores: abre la gestión de usuarios. */
    onManageUsers?: () => void
    /** Estás en el panel de control. */
    adminActive?: boolean
  }
}

function Item({
  board: b,
  active,
  sortable,
  onSelect,
}: {
  board: BoardSummary
  active: boolean
  sortable: boolean
  onSelect: () => void
}) {
  const s = useSortable({ id: b.id, disabled: !sortable })
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={`${styles.row} ${s.isDragging ? styles.dragging : ''}`}
    >
      <button
        type="button"
        className={styles.item}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        <BoardTile className={styles.boardIcon} color={b.color} icon={b.icon} size={16} />
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{b.title}</span>
          <span className={styles.itemMeta}>
            {pluralize(b.columnCount, 'columna', 'columnas')} ·{' '}
            {pluralize(b.cardCount, 'tarjeta', 'tarjetas')}
          </span>
          {b.sharedBy && (
            <span className={styles.itemMeta}>
              De {b.sharedBy.name} · {b.sharedBy.role === 'editor' ? 'Editor' : 'Solo lectura'}
            </span>
          )}
          {b.memberCount > 0 && (
            <span className={styles.itemMeta}>
              Compartido con {pluralize(b.memberCount, 'persona', 'personas')}
            </span>
          )}
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
          <GripIcon width={16} height={16} />
        </button>
      )}
    </li>
  )
}

export function Sidebar({
  boards,
  activeId,
  drawer = false,
  onSelect,
  onCreate,
  onMove,
  onToggle,
  account,
}: Props) {
  const [creating, setCreating] = useState(false)
  const mine = boards.filter((b) => !b.sharedBy)
  const sharedWithMe = boards.filter((b) => b.sharedBy)

  const canSort = !!onMove && mine.length > 1
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const to = mine.findIndex((b) => b.id === over.id)
    if (to >= 0) onMove?.(String(active.id), to)
  }
  const renderItem = (b: BoardSummary, sortable = false) => (
    <Item
      key={b.id}
      board={b}
      active={b.id === activeId}
      sortable={sortable}
      onSelect={() => onSelect(b.id)}
    />
  )

  return (
    <aside className={`${styles.sidebar} ${drawer ? styles.drawer : ''}`} aria-label="Tableros">
      <div className={styles.chrome}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onToggle}
          aria-label={drawer ? 'Cerrar menú' : 'Ocultar barra lateral'}
          autoFocus={drawer}
        >
          <SidebarIcon />
        </button>
      </div>
      <header className={styles.header}>
        <h2 className={styles.heading}>Mis Tableros</h2>
        <button
          type="button"
          className={styles.add}
          aria-label="Nuevo tablero"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </button>
      </header>

      {creating && (
        <div className={styles.create}>
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
      )}

      {boards.length === 0 && !creating ? (
        <p className={styles.empty}>Aún no tienes tableros. Crea el primero con “+”.</p>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements: announcements(
                (id) => boards.find((b) => b.id === id)?.title ?? '',
                'el tablero',
              ),
              screenReaderInstructions,
            }}
          >
            <SortableContext items={mine.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <ul className={styles.list} aria-label="Mis tableros">
                {mine.map((b) => renderItem(b, canSort))}
              </ul>
            </SortableContext>
          </DndContext>
          {sharedWithMe.length > 0 && (
            <>
              <h3 className={styles.subheading}>Compartidos conmigo</h3>
              <ul className={styles.list} aria-label="Compartidos conmigo">
                {sharedWithMe.map((b) => renderItem(b))}
              </ul>
            </>
          )}
        </>
      )}
      {drawer && (
        <div className={styles.install}>
          <InstallButton />
        </div>
      )}
      {account && (
        <footer className={styles.account}>
          <span className={styles.email} title={account.email ?? undefined}>
            {account.email}
          </span>
          {account.onManageUsers && (
            <button
              type="button"
              className={styles.signOut}
              aria-current={account.adminActive ? 'page' : undefined}
              onClick={account.onManageUsers}
            >
              Panel de control
            </button>
          )}
          <button type="button" className={styles.signOut} onClick={account.onAlerts}>
            Avisos por correo y WhatsApp
          </button>
          <button type="button" className={styles.signOut} onClick={account.onChangePassword}>
            Cambiar contraseña
          </button>
          <button type="button" className={styles.signOut} onClick={account.onSignOut}>
            Cerrar sesión
          </button>
        </footer>
      )}
    </aside>
  )
}
