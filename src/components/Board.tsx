import { useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type UniqueIdentifier,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CanEditContext } from '../lib/CanEdit'
import { displayName } from '../lib/people'
import { announcements, screenReaderInstructions } from '../lib/dndA11y'
import { pluralize } from '../lib/format'
import {
  ASSIGNEE_NONE,
  DEFAULT_COLUMN_TITLE,
  LIMITS,
  limitOf,
  type Board as BoardModel,
} from '../lib/types'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useBoardCards, useCardStats, useColumns, useLabelIndex } from '../store/hooks'
import { useStore } from '../store/store'
import { removeMember, useBoardAccess, useParticipants } from '../sync/access'
import { useAuth } from '../sync/auth'
import { AddColumn } from './AddColumn'
import { BoardAppearance } from './BoardAppearance'
import { CardOverlay } from './Card'
import { Column, ColumnOverlay } from './Column'
import { ConfirmDialog } from './ConfirmDialog'
import { MembersButton } from './MembersButton'
import { ShareDialog } from './ShareDialog'
import { ShareIcon, TrashIcon } from './Icons'
import { InlineInput } from './InlineInput'
import { LabelChip } from './LabelChip'
import styles from './Board.module.css'

interface Props {
  board: BoardModel
  onOpenCard: (id: string) => void
  onDeleted: () => void
}

type Active = { type: 'card' | 'column'; id: string } | null

export function Board({ board, onOpenCard, onDeleted }: Props) {
  const columns = useColumns(board.id)
  const cards = useBoardCards(board.id)
  const stats = useCardStats()
  const labelIndex = useLabelIndex()
  const labelFilter = useStore((s) => s.labelFilter)
  const setLabelFilter = useStore((s) => s.setLabelFilter)
  const assigneeFilter = useStore((s) => s.assigneeFilter)
  const setAssigneeFilter = useStore((s) => s.setAssigneeFilter)
  const people = useParticipants(board.id)
  // Los filtros son de un tablero (etiquetas y personas): al cambiar de tablero se limpian.
  useEffect(() => {
    setLabelFilter([])
    setAssigneeFilter([])
  }, [board.id, setLabelFilter, setAssigneeFilter])
  const filtering = labelFilter.length > 0 || assigneeFilter.length > 0
  const renameBoard = useStore((s) => s.renameBoard)
  const deleteBoard = useStore((s) => s.deleteBoard)
  const addColumn = useStore((s) => s.addColumn)
  const moveColumn = useStore((s) => s.moveColumn)
  const moveCard = useStore((s) => s.moveCard)

  const access = useBoardAccess(board.id)
  const me = useAuth((s) => s.userId)
  const signedIn = useAuth((s) => s.status === 'signedIn')
  const [sharing, setSharing] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [renaming, setRenaming] = useState(false)
  // Columna recién creada: se abre su nombre para escribirlo (primero se crea, luego se nombra).
  const [newColumnId, setNewColumnId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [active, setActive] = useState<Active>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null) // columna bajo el puntero al arrastrar una tarjeta

  // Con filtro por etiqueta solo se listan las tarjetas que tengan alguna de las elegidas.
  const matches = (c: (typeof cards)[number]) =>
    (labelFilter.length === 0 || (c.labelIds ?? []).some((id) => labelFilter.includes(id))) &&
    (assigneeFilter.length === 0 ||
      (c.assigneeId
        ? assigneeFilter.includes(c.assigneeId)
        : assigneeFilter.includes(ASSIGNEE_NONE)))

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, typeof cards>()
    for (const col of columns) map.set(col.id, [])
    for (const c of cards) if (matches(c)) map.get(c.columnId)?.push(c)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, cards, labelFilter, assigneeFilter])

  const totalByColumn = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cards) map.set(c.columnId, (map.get(c.columnId) ?? 0) + 1)
    return map
  }, [cards])

  const sensors = useSensors(
    // Mouse: arranca al mover 6 px (un clic sigue abriendo la tarjeta).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Táctil: mantener pulsado ~0,2 s; si no, el dedo desplaza el tablero como siempre.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )

  // Qué se considera "destino":
  //  · columnas arrastradas → solo contra columnas (por cercanía de centros);
  //  · tarjetas con mouse/dedo → lo que esté BAJO el puntero: primero una tarjeta, si no la zona de
  //    la columna (incluye el espacio vacío, aunque la columna sea muy alta), si no su encabezado;
  //  · tarjetas con teclado (sin puntero) → la más cercana.
  // (La cercanía de esquinas fallaba en columnas altas: soltar en su zona vacía caía en otra columna.)
  const collision: CollisionDetection = (args) => {
    const kind = (id: UniqueIdentifier) =>
      args.droppableContainers.find((d) => d.id === id)?.data.current?.type as string | undefined
    const isColumnShell = (id: UniqueIdentifier) => String(id).startsWith('col:')

    if (args.active.data.current?.type === 'column') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((d) => isColumnShell(d.id)),
      })
    }

    const hits = pointerWithin(args)
    if (hits.length > 0) {
      const pick =
        hits.find((h) => kind(h.id) === 'card') ??
        hits.find((h) => String(h.id).startsWith('drop:')) ??
        hits.find((h) => isColumnShell(h.id))
      if (pick) return [pick]
    }
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((d) => !isColumnShell(d.id)),
    })
  }

  const onDragStart = (e: DragStartEvent) => {
    const t = e.active.data.current?.type as 'card' | 'column'
    const id = t === 'column' ? (e.active.data.current?.columnId as string) : String(e.active.id)
    setActive({ type: t, id })
  }

  const onDragOver = (e: DragOverEvent) => {
    const col = e.over?.data.current?.columnId as string | undefined
    setOverColumn(e.active.data.current?.type === 'card' ? (col ?? null) : null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    setOverColumn(null)
    const { active: a, over } = e
    if (!over || over.id === a.id) return // fuera de todo, o sobre sí misma: no cambia nada
    const ad = a.data.current as { type: string; columnId: string }
    const od = over.data.current as { type: string; columnId: string }

    if (ad.type === 'column') {
      if (od.columnId === ad.columnId) return
      const to = columns.findIndex((c) => c.id === od.columnId)
      if (to >= 0) moveColumn(ad.columnId, to)
      return
    }

    // Tarjeta: al final de la columna (zona vacía o encabezado) o junto a la tarjeta bajo el puntero,
    // antes o después según la mitad de ella sobre la que quedó la tarjeta arrastrada.
    const cardId = String(a.id)
    const fromList = cardsByColumn.get(ad.columnId) ?? []
    const targetList = (cardsByColumn.get(od.columnId) ?? []).filter((c) => c.id !== cardId)
    let index = targetList.length
    if (od.type === 'card') {
      const overIdx = targetList.findIndex((c) => c.id === String(over.id))
      const sameColumn = od.columnId === ad.columnId
      let below: boolean
      if (sameColumn) {
        // Misma columna: se intercambian lugares (hacia abajo cae después; hacia arriba, antes).
        // Vale igual para mouse, dedo y teclado (que no tiene puntero).
        const fromIdx = fromList.findIndex((c) => c.id === cardId)
        const overFull = fromList.findIndex((c) => c.id === String(over.id))
        below = fromIdx < overFull
      } else {
        // Otra columna: antes o después según la mitad de la tarjeta destino sobre la que quedó.
        const moved = a.rect.current.translated
        below = !!moved && moved.top + moved.height / 2 > over.rect.top + over.rect.height / 2
      }
      index = below ? overIdx + 1 : overIdx
    }
    if (od.columnId === ad.columnId && index === fromList.findIndex((c) => c.id === cardId)) return
    moveCard(cardId, od.columnId, index)
  }

  // Nombres legibles para los anuncios del lector de pantalla.
  const nameOf = (id: UniqueIdentifier) => {
    const key = String(id)
    if (key.startsWith('col:') || key.startsWith('drop:')) {
      const colId = key.slice(key.indexOf(':') + 1)
      return `columna ${columns.find((c) => c.id === colId)?.title ?? ''}`.trim()
    }
    return cards.find((c) => c.id === key)?.title ?? key
  }
  const announce = {
    ...announcements(nameOf, 'el elemento'),
  }

  const activeCard = active?.type === 'card' ? cards.find((c) => c.id === active.id) : undefined
  const activeColumn =
    active?.type === 'column' ? columns.find((c) => c.id === active.id) : undefined
  const lastColumnId = columns[columns.length - 1]?.id

  return (
    <CanEditContext.Provider value={access.canEdit}>
      <div className={styles.board}>
        <div className={styles.head}>
          <BoardAppearance board={board} editable={access.isOwner} className={styles.tile} />
          {renaming ? (
            <InlineInput
              className={styles.titleInput}
              initial={board.title}
              label="Nombre del tablero"
              maxLength={LIMITS.board}
              submitOnBlur
              onSubmit={(t) => {
                renameBoard(board.id, t)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h1 className={styles.title}>
              <button
                type="button"
                className={styles.titleBtn}
                onClick={() => access.isOwner && setRenaming(true)}
                title={access.isOwner ? 'Renombrar tablero' : undefined}
              >
                {board.title}
              </button>
            </h1>
          )}
          {access.isOwner && (
            <button
              type="button"
              className={styles.delete}
              aria-label="Eliminar tablero"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon width={16} height={16} />
            </button>
          )}
          <div className={styles.headAction}>
            <MembersButton
              boardId={board.id}
              onManage={access.isOwner && signedIn ? () => setSharing(true) : undefined}
            />
            {access.isOwner && signedIn && (
              <button type="button" className={styles.shareBtn} onClick={() => setSharing(true)}>
                <ShareIcon width={16} height={16} />
                {access.members.length > 0 ? `Compartido · ${access.members.length}` : 'Compartir'}
              </button>
            )}
            {!access.isOwner && (
              <>
                <span className={styles.sharedBy}>
                  De {access.ownerName ?? 'otra persona'} ·{' '}
                  {access.canEdit ? 'Editor' : 'Solo lectura'}
                </span>
                <button type="button" className={styles.shareBtn} onClick={() => setLeaving(true)}>
                  Salir del tablero
                </button>
              </>
            )}
            {access.canEdit && (
              <AddColumn
                count={columns.length}
                onAdd={() => setNewColumnId(addColumn(board.id, DEFAULT_COLUMN_TITLE))}
              />
            )}
          </div>
        </div>

        {filtering && (
          <div className={styles.filterBar} role="status">
            <span className={styles.filterLabel}>Filtrando por:</span>
            {labelFilter
              .flatMap((id) => labelIndex.get(id) ?? [])
              .map((l) => (
                <LabelChip
                  key={l.id}
                  label={l}
                  onRemove={() => setLabelFilter(labelFilter.filter((f) => f !== l.id))}
                />
              ))}
            {assigneeFilter.map((id) => {
              const p = people.find((x) => x.userId === id)
              const name =
                id === ASSIGNEE_NONE
                  ? 'Sin asignar'
                  : p
                    ? p.userId === me
                      ? 'Yo'
                      : displayName(p)
                    : null
              return name ? (
                <button
                  key={id}
                  type="button"
                  className={styles.clearFilter}
                  aria-label={`Quitar filtro: ${name}`}
                  onClick={() => setAssigneeFilter(assigneeFilter.filter((f) => f !== id))}
                >
                  {name} ×
                </button>
              ) : null
            })}
            <button
              type="button"
              className={styles.clearFilter}
              onClick={() => {
                setLabelFilter([])
                setAssigneeFilter([])
              }}
            >
              Limpiar filtro
            </button>
          </div>
        )}

        <DndContext
          accessibility={{ announcements: announce, screenReaderInstructions }}
          sensors={access.canEdit ? sensors : []}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActive(null)
            setOverColumn(null)
          }}
        >
          <div className={`${styles.columns} ${active ? styles.dragging : ''}`}>
            <SortableContext
              items={columns.map((c) => `col:${c.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((col, idx) => (
                <Column
                  key={col.id}
                  column={col}
                  siblings={columns}
                  cards={cardsByColumn.get(col.id) ?? []}
                  total={totalByColumn.get(col.id) ?? 0}
                  counts={totalByColumn}
                  stats={stats}
                  isLast={col.id === lastColumnId}
                  startRenaming={col.id === newColumnId}
                  onRenameStarted={() => setNewColumnId(null)}
                  dropTarget={active?.type === 'card' && overColumn === col.id}
                  blocked={
                    active?.type === 'card' &&
                    activeCard?.columnId !== col.id &&
                    limitOf(col) !== null &&
                    (totalByColumn.get(col.id) ?? 0) >= (limitOf(col) ?? 0)
                  }
                  tone={
                    columns.length > 1
                      ? idx === 0
                        ? 'start'
                        : col.id === lastColumnId
                          ? 'done'
                          : 'progress'
                      : 'start'
                  }
                  onOpenCard={onOpenCard}
                />
              ))}
            </SortableContext>
          </div>
          <DragOverlay
            dropAnimation={
              reducedMotion ? null : { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
            }
          >
            {activeCard && (
              <CardOverlay
                card={activeCard}
                stats={stats.get(activeCard.id)}
                finished={activeCard.columnId === lastColumnId}
                done={columns.find((c) => c.id === activeCard.columnId)?.kind === 'done'}
              />
            )}
            {activeColumn && (
              <ColumnOverlay
                column={activeColumn}
                count={cardsByColumn.get(activeColumn.id)?.length ?? 0}
              />
            )}
          </DragOverlay>
        </DndContext>

        {confirmDelete && (
          <ConfirmDialog
            title={`Eliminar “${board.title}”`}
            confirmLabel="Eliminar tablero"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              deleteBoard(board.id)
              setConfirmDelete(false)
              onDeleted()
            }}
          >
            <p>
              Se eliminarán {pluralize(columns.length, 'columna', 'columnas')} y{' '}
              {pluralize(cards.length, 'tarjeta', 'tarjetas')}. Podrás deshacerlo durante unos
              segundos.
            </p>
          </ConfirmDialog>
        )}
        {sharing && (
          <ShareDialog boardId={board.id} title={board.title} onClose={() => setSharing(false)} />
        )}
        {leaving && (
          <ConfirmDialog
            title={`Salir de “${board.title}”`}
            confirmLabel="Salir del tablero"
            onCancel={() => setLeaving(false)}
            onConfirm={async () => {
              setLeaving(false)
              if (me && !(await removeMember(board.id, me))) onDeleted()
            }}
          >
            <p>
              Dejarás de ver este tablero. {access.ownerName ?? 'Su dueño'} puede volver a
              invitarte.
            </p>
          </ConfirmDialog>
        )}
      </div>
    </CanEditContext.Provider>
  )
}
