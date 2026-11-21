import { useMemo, useState } from 'react'
import { byPosition } from '../lib/position'
import type { Card } from '../lib/types'
import { useBoards } from '../store/hooks'
import { useStore } from '../store/store'
import { Select } from './Select'
import styles from './MoveCard.module.css'

/** "Mover → Tablero → Columna": pasa la tarjeta a otro tablero (del mismo dueño) y columna. */
export function MoveCard({ card }: { card: Card }) {
  const boards = useBoards()
  const columns = useStore((s) => s.columns)
  const moveCardToBoard = useStore((s) => s.moveCardToBoard)
  const [open, setOpen] = useState(false)
  const [boardId, setBoardId] = useState('')
  const [columnId, setColumnId] = useState('')

  const current = boards.find((b) => b.id === card.boardId)
  const targets = useMemo(
    () =>
      boards.filter(
        (b) =>
          !b.parentId &&
          b.id !== card.boardId &&
          (b.ownerId ?? null) === (current?.ownerId ?? null),
      ),
    [boards, card.boardId, current?.ownerId],
  )
  const cols = useMemo(
    () => columns.filter((c) => !c.deletedAt && c.boardId === boardId).sort(byPosition),
    [columns, boardId],
  )

  if (targets.length === 0) return null

  const start = () => {
    const first = targets[0].id
    setBoardId(first)
    setColumnId(
      columns.filter((c) => !c.deletedAt && c.boardId === first).sort(byPosition)[0]?.id ?? '',
    )
    setOpen(true)
  }
  const pickBoard = (next: string) => {
    setBoardId(next)
    setColumnId(
      columns.filter((c) => !c.deletedAt && c.boardId === next).sort(byPosition)[0]?.id ?? '',
    )
  }

  if (!open) {
    return (
      <button type="button" className={styles.trigger} onClick={start}>
        Mover a otro tablero…
      </button>
    )
  }

  return (
    <fieldset className={styles.box}>
      <legend>Mover tarjeta</legend>
      <Select
        label="Tablero"
        value={boardId}
        options={targets.map((b) => ({ value: b.id, label: b.title }))}
        onChange={pickBoard}
      />
      <Select
        label="Columna"
        value={columnId}
        options={
          cols.length === 0
            ? [{ value: '', label: 'Este tablero no tiene columnas' }]
            : cols.map((c) => ({ value: c.id, label: c.title }))
        }
        onChange={setColumnId}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!columnId}
          onClick={() => {
            if (moveCardToBoard(card.id, columnId)) setOpen(false)
          }}
        >
          Mover
        </button>
        <button type="button" className={styles.link} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </fieldset>
  )
}
