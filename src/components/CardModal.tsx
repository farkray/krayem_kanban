import { useEffect, useMemo, useRef, useState } from 'react'
import { byPosition } from '../lib/position'
import { LIMITS } from '../lib/types'
import { useColumns, useComments } from '../store/hooks'
import { CanEditContext } from '../lib/CanEdit'
import { displayName } from '../lib/people'
import { peopleOf } from '../lib/mentions'
import { MentionContext } from './Mention'
import { useStore } from '../store/store'
import { useBoardAccess, useParticipants } from '../sync/access'
import { useAuth } from '../sync/auth'
import { Attachments } from './Attachments'
import { Checklist } from './Checklist'
import { LabelPicker } from './LabelPicker'
import { Comments } from './Comments'
import { Modal } from './Modal'
import { MoveCard } from './MoveCard'
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
  const { canEdit } = useBoardAccess(card?.boardId)
  const people = useParticipants(card?.boardId)
  const me = useAuth((s) => s.userId)

  const [title, setTitle] = useState(card?.title ?? '')
  const [showDates, setShowDates] = useState(false)
  const [tab, setTab] = useState<'details' | 'updates'>('details')
  // Se cuentan las actualizaciones, no sus respuestas.
  const updatesCount = useComments(cardId).filter((c) => !c.parentId).length
  const [dateError, setDateError] = useState<string | null>(null)

  // La descripción ya no existe como campo aparte: lo que había pasa a ser la primera actualización.
  const migrated = useRef(false)
  useEffect(() => {
    if (migrated.current || !card?.description?.trim()) return
    migrated.current = true
    const st = useStore.getState()
    if (st.addComment(cardId, card.description) !== null) st.updateCard(cardId, { description: '' })
  }, [cardId, card?.description])

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

  /** "Listo": guarda el título pendiente y cierra. */
  const finish = () => {
    commitTitle()
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
    <MentionContext.Provider value={{ people: peopleOf(people), me }}>
      <CanEditContext.Provider value={canEdit}>
        <Modal label="Detalle de la tarjeta" onClose={onClose} size="lg" flush>
          <header className={styles.head}>
            <input
              className={styles.title}
              readOnly={!canEdit}
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

          <div className={styles.tabs} role="tablist" aria-label="Secciones de la tarjeta">
            {(
              [
                ['details', 'Detalles'],
                ['updates', `Actualizaciones${updatesCount > 0 ? ` / ${updatesCount}` : ''}`],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={tab === id ? styles.tabOn : styles.tab}
                onClick={() => setTab(id)}
              >
                {text}
              </button>
            ))}
          </div>

          {tab === 'updates' ? (
            <div
              className={styles.body}
              role="tabpanel"
              id="panel-updates"
              aria-labelledby="tab-updates"
            >
              <fieldset className={styles.fieldset} disabled={!canEdit}>
                <Comments cardId={card.id} variant="updates" />
              </fieldset>
            </div>
          ) : (
            <div
              className={styles.body}
              role="tabpanel"
              id="panel-details"
              aria-labelledby="tab-details"
            >
              <fieldset className={styles.fieldset} disabled={!canEdit}>
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
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => setShowDates(true)}
                    >
                      + Agregar fechas
                    </button>
                  )}
                  {dateError && (
                    <p className={styles.error} role="alert">
                      {dateError}
                    </p>
                  )}
                  <MoveCard card={card} />
                </section>

                {people.length > 1 && (
                  <section className={styles.section}>
                    <label className={styles.field}>
                      <span>Asignado a</span>
                      <select
                        value={card.assigneeId ?? ''}
                        onChange={(e) =>
                          updateCard(card.id, { assigneeId: e.target.value || undefined })
                        }
                      >
                        <option value="">Sin asignar</option>
                        {card.assigneeId && !people.some((p) => p.userId === card.assigneeId) && (
                          <option value={card.assigneeId}>Ya no participa en el tablero</option>
                        )}
                        {people.map((p) => (
                          <option key={p.userId} value={p.userId}>
                            {displayName(p)}
                            {p.alias ? ` · ${p.email}` : ''}
                            {p.userId === me ? ' (tú)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                )}

                <section className={styles.section}>
                  <h3>Etiquetas</h3>
                  <LabelPicker
                    cardId={card.id}
                    boardId={card.boardId}
                    labelIds={card.labelIds ?? []}
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
                  <h3>Actualización</h3>
                  <Comments cardId={card.id} variant="composer" />
                </section>
              </fieldset>

              {canEdit && (
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
                  <span className={styles.dangerHint}>
                    Podrás deshacerlo durante unos segundos.
                  </span>
                </section>
              )}
            </div>
          )}

          <footer className={styles.footer}>
            <span className={styles.autosave}>Los cambios se guardan solos</span>
            <button type="button" className={styles.done} onClick={finish}>
              Listo
            </button>
          </footer>
        </Modal>
      </CanEditContext.Provider>
    </MentionContext.Provider>
  )
}
