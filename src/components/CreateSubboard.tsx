import { useMemo, useState, type FormEvent } from 'react'
import { LIMITS } from '../lib/types'
import { useBoards, useLabels } from '../store/hooks'
import { useStore } from '../store/store'
import { LabelChip } from './LabelChip'
import { Modal } from './Modal'
import styles from './CreateSubboard.module.css'

/** Un subtablero se crea eligiendo una etiqueta del tablero: muestra solo las tarjetas que la tienen. */
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
  const boards = useBoards()
  const createSubboard = useStore((s) => s.createSubboard)
  const used = useMemo(
    () => new Set(boards.filter((b) => b.parentId === parentId).map((b) => b.linkLabelId)),
    [boards, parentId],
  )
  const free = labels.filter((l) => !used.has(l.id))
  const [labelId, setLabelId] = useState(free[0]?.id ?? '')
  const [name, setName] = useState(free[0]?.name ?? '')
  const [edited, setEdited] = useState(false)

  const pick = (id: string) => {
    setLabelId(id)
    // El nombre sigue a la etiqueta mientras no lo hayas escrito tú.
    if (!edited) setName(free.find((l) => l.id === id)?.name ?? '')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = createSubboard(parentId, labelId, name)
    if (id) onCreated(id)
  }

  return (
    <Modal label="Crear subtablero" onClose={onClose}>
      <h2 className={styles.title}>Crear subtablero</h2>
      <p className={styles.hint}>
        Muestra las columnas de “{parentTitle}” con solo las tarjetas que tengan la etiqueta que
        elijas. Si mueves una tarjeta ahí, se mueve también en “{parentTitle}”.
      </p>
      {free.length === 0 ? (
        <>
          <p className={styles.empty}>
            {labels.length === 0
              ? 'Este tablero aún no tiene etiquetas. Crea una desde cualquier tarjeta (por ejemplo, el nombre de un cliente) y vuelve aquí.'
              : 'Todas las etiquetas de este tablero ya tienen su subtablero.'}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} aria-label="Crear subtablero">
          <div className={styles.field} role="radiogroup" aria-label="Etiqueta que lo vincula">
            <span>Etiqueta que lo vincula</span>
            <ul className={styles.labels}>
              {free.map((l) => (
                <li key={l.id}>
                  <label className={styles.option}>
                    <input
                      type="radio"
                      name="label"
                      checked={labelId === l.id}
                      onChange={() => pick(l.id)}
                      aria-label={`Etiqueta ${l.name}`}
                    />
                    <LabelChip label={l} />
                  </label>
                </li>
              ))}
            </ul>
          </div>
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
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={styles.primary} disabled={!labelId || !name.trim()}>
              Crear subtablero
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
