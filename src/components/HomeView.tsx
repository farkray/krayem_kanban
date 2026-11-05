import { useState } from 'react'
import { pluralize } from '../lib/format'
import { LIMITS } from '../lib/types'
import type { BoardSummary } from '../store/hooks'
import { BoardIcon, PlusIcon } from './Icons'
import { InlineInput } from './InlineInput'
import styles from './HomeView.module.css'

interface Props {
  boards: BoardSummary[]
  onOpen: (id: string) => void
  onCreate: (title: string) => void
}

export function HomeView({ boards, onOpen, onCreate }: Props) {
  const [creating, setCreating] = useState(false)

  return (
    <div className={styles.home}>
      <h1 className={styles.title}>Mis tableros</h1>
      {boards.length === 0 && (
        <p className={styles.hint}>Aún no tienes tableros. Crea el primero.</p>
      )}
      <div className={styles.grid}>
        {boards.map((b) => (
          <button key={b.id} type="button" className={styles.tile} onClick={() => onOpen(b.id)}>
            <span className={styles.icon}>
              <BoardIcon width={20} height={20} />
            </span>
            <span className={styles.name}>{b.title}</span>
            <span className={styles.meta}>
              {pluralize(b.columnCount, 'columna', 'columnas')} ·{' '}
              {pluralize(b.cardCount, 'tarjeta', 'tarjetas')}
            </span>
          </button>
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
    </div>
  )
}
