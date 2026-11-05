import { db } from '../db/db'
import type { Attachment } from '../lib/types'

type Fetcher = (attachment: Attachment) => Promise<Blob>
let fetcher: Fetcher | null = null

/** El arranque de sync indica cómo bajar archivos de la nube (null al cerrar sesión). */
export const setBlobFetcher = (fn: Fetcher | null) => {
  fetcher = fn
}

/** Archivo de una imagen: del dispositivo si está; si no, de la nube (y se guarda para la próxima). */
export async function loadBlob(att: Attachment): Promise<Blob | null> {
  const local = await db.blobs.get(att.id)
  if (local) return local.blob
  if (!fetcher) return null
  const blob = await fetcher(att)
  await db.blobs.put({ id: att.id, blob, uploaded: true })
  return blob
}
