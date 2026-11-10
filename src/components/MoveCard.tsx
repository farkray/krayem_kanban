import { useId, useMemo, useState } from 'react'
import { byPosition } from '../lib/position'
import type { Card } from '../lib/types'
import { useBoards } from '../store/hooks'
import { useStore } from '../store/store'
import styles from './MoveCard.module.css'

/** "Mover → Tablero → Columna": pasa la tarjeta a otro tablero (del mismo dueño) y columna. */
export function MoveCard({ card }: { card: Card }) {
  const boards = useBoards()
  const columns = useStore((s) => s.columns)
  const moveCardToBoard = useStore((s) => s.moveCardToBoard)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [boardId, setBoardId] = useState('')
  const [columnId, setColumnId] = useState('')

  const current = boards.find((b) => b.id === card.boardId)
  const targets = useMemo(
    () =>
      boards.filter(
        (b) =>
          b.id !== card.boardId && (b.ownerId ?? null) === (current?.ownerId ?? null),
      ),
    [boards, card.boardId, current?.ownerId],
  )
  const cols = useMemo(
    () =>
      columns
        .filter((c) => !c.deletedAt && c.boardId === boardId)
        .sort(byPosition),
    [columns, boardId],
  )

  if (targets.length === 0) return null

  const start = () => {
    const first = targets[0].id
    setBoardId(first)
    setColumnId(
      columns
        .filter((c) => !c.deletedAt && c.boardId === first)
        .sort(byPosition)[0]?.id ?? '',
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
      <label className={styles.field} htmlFor={`${id}-b`}>
        <span>Tablero</span>
        <select id={`${id}-b`} value={boardId} onChange={(e) => pickBoard(e.target.value)}>
          {targets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field} htmlFor={`${id}-c`}>
        <span>Columna</span>
        <select id={`${id}-c`} value={columnId} onChange={(e) => setColumnId(e.target.value)}>
          {cols.length === 0 && <option value="">Este tablero no tiene columnas</option>}
          {cols.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
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
