import { useRef, useState, type DragEvent } from 'react'
import { compressImage } from '../lib/image/compress'
import { savingLabel } from '../lib/image/utils'
import { LIMITS, type Attachment } from '../lib/types'
import { useAttachments } from '../store/hooks'
import { useStore } from '../store/store'
import { useAttachmentUrl } from '../store/useAttachmentUrl'
import styles from './Attachments.module.css'

function Item({
  att,
  isCover,
  onToggleCover,
}: {
  att: Attachment
  isCover: boolean
  onToggleCover: () => void
}) {
  const deleteAttachment = useStore((s) => s.deleteAttachment)
  const url = useAttachmentUrl(att)
  return (
    <li className={styles.item}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.thumbLink}>
          <img src={url} alt={att.name} className={styles.thumb} />
        </a>
      ) : (
        <span className={`${styles.thumb} ${styles.placeholder}`} aria-label="Cargando imagen" />
      )}
      <div className={styles.info}>
        <span className={styles.name} title={att.name}>
          {att.name}
        </span>
        <span className={styles.size}>
          {savingLabel(att.sizeOriginal, att.sizeCompressed)} · {att.width}×{att.height}
        </span>
        <span className={styles.actions}>
          <button type="button" onClick={onToggleCover} aria-pressed={isCover}>
            {isCover ? 'Quitar portada' : 'Usar de portada'}
          </button>
          <button type="button" onClick={() => deleteAttachment(att.id)}>
            Eliminar
          </button>
        </span>
      </div>
    </li>
  )
}

export function Attachments({ cardId, coverId }: { cardId: string; coverId?: string }) {
  const attachments = useAttachments(cardId)
  const addAttachment = useStore((s) => s.addAttachment)
  const updateCard = useStore((s) => s.updateCard)
  const inputRef = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [over, setOver] = useState(false)

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      const room =
        LIMITS.attachments -
        useStore.getState().attachments.filter((a) => a.cardId === cardId && !a.deletedAt).length
      if (room <= 0) {
        setErrors((e) => [...e, `Máximo ${LIMITS.attachments} imágenes por tarjeta.`])
        break
      }
      setWorking((w) => [...w, file.name])
      try {
        const out = await compressImage(file)
        addAttachment(
          cardId,
          {
            name: file.name,
            mime: out.mime,
            sizeOriginal: out.sizeOriginal,
            sizeCompressed: out.sizeCompressed,
            width: out.width,
            height: out.height,
          },
          out.blob,
        )
      } catch (e) {
        setErrors((list) => [
          ...list,
          `${file.name}: ${e instanceof Error ? e.message : 'no se pudo procesar'}`,
        ])
      } finally {
        setWorking((w) => w.filter((_, i) => i !== w.indexOf(file.name)))
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    setErrors([])
    void addFiles([...e.dataTransfer.files])
  }

  return (
    <div
      className={`${styles.zone} ${over ? styles.over : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <ul className={styles.list} aria-label="Imágenes">
          {attachments.map((a) => (
            <Item
              key={a.id}
              att={a}
              isCover={coverId === a.id}
              onToggleCover={() =>
                updateCard(cardId, { coverAttachmentId: coverId === a.id ? undefined : a.id })
              }
            />
          ))}
        </ul>
      )}

      {working.map((name, i) => (
        <p key={`${name}-${i}`} className={styles.working} role="status">
          Comprimiendo {name}…
        </p>
      ))}
      {errors.map((msg, i) => (
        <p key={i} className={styles.error} role="alert">
          {msg}
        </p>
      ))}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Seleccionar imágenes"
        onChange={(e) => {
          setErrors([])
          void addFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <button type="button" className={styles.add} onClick={() => inputRef.current?.click()}>
        + Agregar imagen
      </button>
      <span className={styles.hint}>
        o suéltala aquí · se reduce a 1600 px y se guarda como WebP
      </span>
    </div>
  )
}
