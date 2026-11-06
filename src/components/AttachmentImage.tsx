import { useAttachmentIndex } from '../store/hooks'
import { useAttachmentUrl } from '../store/useAttachmentUrl'
import styles from './AttachmentImage.module.css'

export const ATTACHMENT_SCHEME = 'attachment:'
export const attachmentSrc = (id: string) => `${ATTACHMENT_SCHEME}${id}`

/** Imagen pegada en una actualización: en el Markdown vive como `![nombre](attachment:ID)`. */
export function AttachmentImage({ src, alt }: { src: string; alt?: string }) {
  const index = useAttachmentIndex()
  const att = index.get(src.slice(ATTACHMENT_SCHEME.length))
  const url = useAttachmentUrl(att)
  if (!att) return <span className={styles.missing}>Imagen no disponible</span>
  if (!url) return <span className={styles.loading} role="img" aria-label="Cargando imagen" />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.link}>
      <img src={url} alt={alt || att.name} className={styles.img} />
    </a>
  )
}
