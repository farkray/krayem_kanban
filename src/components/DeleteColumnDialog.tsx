import { useState } from 'react'
import { pluralize } from '../lib/format'
import type { Column } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  column: Column
  others: Column[]
  cardCount: number
  onConfirm: (moveToId?: string) => void
  onCancel: () => void
}

export function DeleteColumnDialog({ column, others, cardCount, onConfirm, onCancel }: Props) {
  const [target, setTarget] = useState('')
  return (
    <ConfirmDialog
      title={`Eliminar la columna “${column.title}”`}
      confirmLabel="Eliminar"
      onConfirm={() => onConfirm(target || undefined)}
      onCancel={onCancel}
    >
      {cardCount === 0 ? (
        <p>La columna está vacía.</p>
      ) : (
        <>
          <p>Tiene {pluralize(cardCount, 'tarjeta', 'tarjetas')}. ¿Qué hacemos con ellas?</p>
          <select
            aria-label="Destino de las tarjetas"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Eliminar las tarjetas</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                Mover a “{c.title}”
              </option>
            ))}
          </select>
        </>
      )}
    </ConfirmDialog>
  )
}
