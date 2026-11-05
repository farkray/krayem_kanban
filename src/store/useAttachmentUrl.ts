import { useEffect, useState } from 'react'
import type { Attachment } from '../lib/types'
import { loadBlob } from '../sync/blobs'

/** URL temporal (blob:) para mostrar una imagen; se libera al desmontar. `null` mientras carga o si falla. */
export function useAttachmentUrl(att: Attachment | undefined): string | null {
  const [state, setState] = useState<{ id: string; url: string } | null>(null)
  const id = att?.id

  useEffect(() => {
    if (!att) return
    let url: string | null = null
    let cancelled = false
    loadBlob(att)
      .then((blob) => {
        if (cancelled || !blob) return
        url = URL.createObjectURL(blob)
        setState({ id: att.id, url })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // Solo depende del id: el archivo de un adjunto no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return state && state.id === id ? state.url : null
}
