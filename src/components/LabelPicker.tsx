import { useState, type FormEvent } from 'react'
import { LABEL_COLORS, LABEL_COLOR_NAMES, LIMITS, type Label, type LabelColor } from '../lib/types'
import { useLabelIndex, useLabels } from '../store/hooks'
import { useStore } from '../store/store'
import { LabelChip } from './LabelChip'
import styles from './LabelPicker.module.css'

interface FormProps {
  initial?: Label
  /** Nombres ya usados por otras etiquetas (sin distinguir mayúsculas). */
  taken: string[]
  /** Color sugerido al crear. */
  suggested: LabelColor
  onSubmit: (name: string, color: LabelColor) => void
  onDelete?: () => void
  onCancel: () => void
}

function LabelForm({ initial, taken, suggested, onSubmit, onDelete, onCancel }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState<LabelColor>(initial?.color ?? suggested)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setError('Escribe un nombre para la etiqueta.')
    if (taken.includes(n.toLowerCase())) return setError('Ya existe una etiqueta con ese nombre.')
    onSubmit(n, color)
  }

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      aria-label={initial ? 'Editar etiqueta' : 'Nueva etiqueta'}
    >
      <label className={styles.field}>
        <span>Nombre de la etiqueta</span>
        <input
          className={styles.input}
          value={name}
          maxLength={LIMITS.label}
          placeholder="Por ejemplo: Coppel"
          autoFocus
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </label>
      <div className={styles.field} role="radiogroup" aria-label="Color">
        <span>Color</span>
        <div className={styles.swatches}>
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={LABEL_COLOR_NAMES[c]}
              title={LABEL_COLOR_NAMES[c]}
              className={styles.swatch}
              data-color={c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {onDelete && (
          <button type="button" className={styles.danger} onClick={onDelete}>
            Eliminar etiqueta
          </button>
        )}
        <span className={styles.spacer} />
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.primary}>
          {initial ? 'Guardar' : 'Crear etiqueta'}
        </button>
      </div>
    </form>
  )
}

/** Etiquetas de una tarjeta: asignar, crear (nombre + color), editar y eliminar. */
export function LabelPicker({ cardId, labelIds }: { cardId: string; labelIds: string[] }) {
  const labels = useLabels()
  const index = useLabelIndex()
  const createLabel = useStore((s) => s.createLabel)
  const updateLabel = useStore((s) => s.updateLabel)
  const deleteLabel = useStore((s) => s.deleteLabel)
  const toggleCardLabel = useStore((s) => s.toggleCardLabel)

  const [open, setOpen] = useState(false)
  // null = lista; 'new' = formulario de alta; id = edición de esa etiqueta
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [limitNote, setLimitNote] = useState(false)

  const assigned = labelIds.flatMap((id) => index.get(id) ?? [])
  const showForm = editing !== null || (open && labels.length === 0)
  const editingLabel = editing && editing !== 'new' ? index.get(editing) : undefined
  const taken = (except?: string) =>
    labels.filter((l) => l.id !== except).map((l) => l.name.toLowerCase())

  const toggle = (id: string) => setLimitNote(!toggleCardLabel(cardId, id))

  return (
    <div className={styles.picker}>
      <div className={styles.assigned}>
        {assigned.map((l) => (
          <LabelChip key={l.id} label={l} onRemove={() => toggle(l.id)} />
        ))}
        <button
          type="button"
          className={styles.link}
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v)
            setEditing(null)
            setLimitNote(false)
          }}
        >
          {open ? 'Ocultar' : assigned.length ? '+ Etiqueta' : '+ Agregar etiqueta'}
        </button>
      </div>

      {open && (
        <div className={styles.panel}>
          {limitNote && (
            <p className={styles.error} role="alert">
              Una tarjeta admite como máximo {LIMITS.cardLabels} etiquetas.
            </p>
          )}

          {showForm ? (
            <>
              {labels.length === 0 && editing === null && (
                <p className={styles.hint}>
                  Crea tu primera etiqueta: por ejemplo, el nombre de una empresa con su color.
                </p>
              )}
              <LabelForm
                key={editing ?? 'new'}
                initial={editingLabel}
                taken={taken(editingLabel?.id)}
                suggested={LABEL_COLORS[labels.length % LABEL_COLORS.length]}
                onCancel={() => setEditing(null)}
                onSubmit={(name, color) => {
                  if (editingLabel) updateLabel(editingLabel.id, { name, color })
                  else {
                    const id = createLabel(name, color)
                    if (id) toggleCardLabel(cardId, id) // la etiqueta nueva queda puesta en esta tarjeta
                  }
                  setEditing(null)
                }}
                onDelete={
                  editingLabel
                    ? () => {
                        deleteLabel(editingLabel.id)
                        setEditing(null)
                      }
                    : undefined
                }
              />
            </>
          ) : (
            <>
              <ul className={styles.list} aria-label="Etiquetas disponibles">
                {labels.map((l) => (
                  <li key={l.id} className={styles.row}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={labelIds.includes(l.id)}
                        onChange={() => toggle(l.id)}
                        aria-label={`Etiqueta ${l.name}`}
                      />
                      <LabelChip label={l} />
                    </label>
                    <button
                      type="button"
                      className={styles.edit}
                      aria-label={`Editar etiqueta ${l.name}`}
                      onClick={() => setEditing(l.id)}
                    >
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
              {labels.length < LIMITS.labels && (
                <button type="button" className={styles.link} onClick={() => setEditing('new')}>
                  + Crear etiqueta
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
