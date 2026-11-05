import { useEffect, useMemo, useRef, useState } from 'react'
import { byPosition } from '../lib/position'
import { LIMITS } from '../lib/types'
import { useColumns } from '../store/hooks'
import { useStore } from '../store/store'
import { Attachments } from './Attachments'
import { Checklist } from './Checklist'
import { LabelPicker } from './LabelPicker'
import { Comments } from './Comments'
import { Modal } from './Modal'
import styles from './CardModal.module.css'

interface Props {
  cardId: string
  onClose: () => void
}

export function CardModal({ cardId, onClose }: Props) {
  const card = useStore((s) => s.cards.find((c) => c.id === cardId))
  const updateCard = useStore((s) => s.updateCard)
  const moveCard = useStore((s) => s.moveCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const columns = useColumns(card?.boardId ?? null)

  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [showDates, setShowDates] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)

  // Guarda la descripción pendiente al cerrar (Esc, clic fuera, etc.).
  const draft = useRef(description)
  useEffect(() => {
    draft.current = description
  }, [description])
  const saved = useRef(card?.description ?? '')
  useEffect(
    () => () => {
      if (draft.current !== saved.current)
        useStore.getState().updateCard(cardId, { description: draft.current })
    },
    [cardId],
  )

  useEffect(() => {
    if (!card || card.deletedAt) onClose()
  }, [card, onClose])

  const hasDates = useMemo(() => !!(card?.startDate || card?.endDate), [card])
  if (!card || card.deletedAt) return null

  const commitTitle = () => {
    const t = title.trim()
    if (t === card.title) return
    if (!updateCard(card.id, { title: t })) setTitle(card.title)
  }

  const commitDescription = () => {
    if (description === (card.description ?? '')) return
    if (updateCard(card.id, { description })) saved.current = description
  }

  /** "Listo": guarda lo pendiente (título y descripción) y cierra. */
  const finish = () => {
    commitTitle()
    commitDescription()
    onClose()
  }

  const setDate = (field: 'startDate' | 'endDate', value: string) => {
    const ok = updateCard(card.id, { [field]: value || undefined })
    setDateError(ok ? null : 'La fecha final no puede ser anterior a la de inicio.')
  }

  const changeColumn = (columnId: string) => {
    if (columnId === card.columnId) return
    const count = useStore
      .getState()
      .cards.filter((c) => c.columnId === columnId && !c.deletedAt && c.id !== card.id).length
    moveCard(card.id, columnId, count)
  }

  const showDateFields = hasDates || showDates

  return (
    <Modal label="Detalle de la tarjeta" onClose={onClose} size="lg" flush>
      <header className={styles.head}>
        <input
          className={styles.title}
          value={title}
          maxLength={LIMITS.card}
          aria-label="Título de la tarjeta"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </header>

      <div className={styles.body}>
        <section className={styles.details} aria-label="Detalles">
          <label className={styles.field}>
            <span>Columna</span>
            <select value={card.columnId} onChange={(e) => changeColumn(e.target.value)}>
              {[...columns].sort(byPosition).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {showDateFields ? (
            <>
              <label className={styles.field}>
                <span>Inicio</span>
                <input
                  type="date"
                  value={card.startDate ?? ''}
                  onChange={(e) => setDate('startDate', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Final</span>
                <input
                  type="date"
                  value={card.endDate ?? ''}
                  min={card.startDate}
                  onChange={(e) => setDate('endDate', e.target.value)}
                />
              </label>
            </>
          ) : (
            <button type="button" className={styles.link} onClick={() => setShowDates(true)}>
              + Agregar fechas
            </button>
          )}
          {dateError && (
            <p className={styles.error} role="alert">
              {dateError}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h3>Etiquetas</h3>
          <LabelPicker cardId={card.id} labelIds={card.labelIds ?? []} />
        </section>

        <section className={styles.section}>
          <h3>Descripción</h3>
          <textarea
            className={styles.textarea}
            rows={4}
            value={description}
            maxLength={LIMITS.description}
            placeholder="Agrega una descripción…"
            aria-label="Descripción"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
          />
        </section>

        <section className={styles.section}>
          <h3>Lista de tareas</h3>
          <Checklist cardId={card.id} />
        </section>

        <section className={styles.section}>
          <h3>Imágenes</h3>
          <Attachments cardId={card.id} coverId={card.coverAttachmentId} />
        </section>

        <section className={styles.section}>
          <h3>Comentarios</h3>
          <Comments cardId={card.id} />
        </section>

        <section className={styles.dangerZone} aria-label="Eliminar">
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              deleteCard(card.id)
              onClose()
            }}
          >
            Eliminar tarjeta
          </button>
          <span className={styles.dangerHint}>Podrás deshacerlo durante unos segundos.</span>
        </section>
      </div>

      <footer className={styles.footer}>
        <span className={styles.autosave}>Los cambios se guardan solos</span>
        <button type="button" className={styles.done} onClick={finish}>
          Listo
        </button>
      </footer>
    </Modal>
  )
}
