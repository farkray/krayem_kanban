import { useState } from 'react'
import { pluralize } from '../lib/format'
import { limitOf, type Column } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { Select } from './Select'

interface Props {
  column: Column
  others: Column[]
  cardCount: number
  /** Tarjetas actuales por columna, para respetar los límites al mover. */
  countOf?: (columnId: string) => number
  onConfirm: (moveToId?: string) => void
  onCancel: () => void
}

export function DeleteColumnDialog({
  column,
  others,
  cardCount,
  countOf,
  onConfirm,
  onCancel,
}: Props) {
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
          <Select
            label="Destino de las tarjetas"
            value={target}
            onChange={setTarget}
            options={[
              { value: '', label: 'Eliminar las tarjetas' },
              ...others.map((c) => {
                const limit = limitOf(c)
                const fits = limit === null || (countOf?.(c.id) ?? 0) + cardCount <= limit
                return {
                  value: c.id,
                  label: `Mover a “${c.title}”${fits ? '' : ' (no caben)'}`,
                  disabled: !fits,
                }
              }),
            ]}
          />
        </>
      )}
    </ConfirmDialog>
  )
}
