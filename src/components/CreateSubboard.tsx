import { useState, type FormEvent } from 'react'
import { LIMITS } from '../lib/types'
import { useLabels } from '../store/hooks'
import { useStore } from '../store/store'
import { LabelChip } from './LabelChip'
import { Modal } from './Modal'
import styles from './CreateSubboard.module.css'

/**
 * Un subtablero se crea eligiendo una o varias etiquetas del tablero: muestra solo las tarjetas que
 * las tengan (alguna de ellas, o todas si se pide).
 */
export function CreateSubboard({
  parentId,
  parentTitle,
  onClose,
  onCreated,
}: {
  parentId: string
  parentTitle: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const labels = useLabels(parentId)
  const createSubboard = useStore((s) => s.createSubboard)
  const [picked, setPicked] = useState<string[]>(labels[0] ? [labels[0].id] : [])
  const [mode, setMode] = useState<'any' | 'all'>('any')
  const [name, setName] = useState(labels[0]?.name ?? '')
  const [edited, setEdited] = useState(false)
  const [error, setError] = useState(false)

  const namesOf = (ids: string[]) =>
    labels
      .filter((l) => ids.includes(l.id))
      .map((l) => l.name)
      .join(', ')
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    setPicked(next)
    setError(false)
    // El nombre sigue a las etiquetas mientras no lo hayas escrito tú.
    if (!edited) setName(namesOf(next).slice(0, LIMITS.board))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = createSubboard(parentId, picked, name, mode)
    if (id) onCreated(id)
    else setError(true)
  }

  return (
    <Modal label="Crear subtablero" onClose={onClose}>
      <h2 className={styles.title}>Crear subtablero</h2>
      <p className={styles.hint}>
        Muestra las columnas de “{parentTitle}” con solo las tarjetas que tengan las etiquetas que
        elijas. Si mueves una tarjeta ahí, se mueve también en “{parentTitle}”.
      </p>
      {labels.length === 0 ? (
        <>
          <p className={styles.empty}>
            Este tablero aún no tiene etiquetas. Crea una desde cualquier tarjeta (por ejemplo, el
            nombre de un cliente) y vuelve aquí.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} aria-label="Crear subtablero">
          <fieldset className={styles.field}>
            <legend>Etiquetas (puedes elegir varias)</legend>
            <ul className={styles.labels}>
              {labels.map((l) => (
                <li key={l.id}>
                  <label className={styles.option}>
                    <input
                      type="checkbox"
                      checked={picked.includes(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label={`Etiqueta ${l.name}`}
                    />
                    <LabelChip label={l} />
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {picked.length > 1 && (
            <fieldset className={styles.field}>
              <legend>Mostrar tarjetas que tengan</legend>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'any'}
                  onChange={() => setMode('any')}
                />
                Alguna de las etiquetas
              </label>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                />
                Todas las etiquetas
              </label>
            </fieldset>
          )}
          <label className={styles.field}>
            <span>Nombre del subtablero</span>
            <input
              className={styles.input}
              value={name}
              maxLength={LIMITS.board}
              onChange={(e) => {
                setName(e.target.value)
                setEdited(true)
              }}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              Ya existe un subtablero con esa combinación de etiquetas.
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={picked.length === 0 || !name.trim()}
            >
              Crear subtablero
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
