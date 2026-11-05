import type { CompressRequest, CompressResponse } from '../../workers/image.worker'
import { MAX_IMAGE_BYTES } from '../types'

export const MAX_SIDE = 1600
export const QUALITY = 80

export interface CompressedImage {
  blob: Blob
  mime: string
  width: number
  height: number
  sizeOriginal: number
  sizeCompressed: number
}

export class ImageError extends Error {}

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  number,
  { resolve: (r: CompressResponse & { ok: true }) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<CompressResponse>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.ok) p.resolve(e.data)
    else p.reject(new ImageError(e.data.error))
  }
  worker.onerror = () => {
    for (const p of pending.values())
      p.reject(new ImageError('Falló el procesamiento de la imagen'))
    pending.clear()
    worker?.terminate()
    worker = null // se recrea en la siguiente petición
  }
  return worker
}

/**
 * Comprime una imagen en un Web Worker (WASM): lado largo ≤ 1600 px, WebP calidad 80.
 * Si el resultado no es más pequeño que el original, se conserva el original.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new ImageError('El archivo no es una imagen.')
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError('La imagen supera el máximo de 15 MB.')

  const id = ++seq
  const req: CompressRequest = { id, file, maxSide: MAX_SIDE, quality: QUALITY }
  const res = await new Promise<CompressResponse & { ok: true }>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage(req)
  }).catch((e: Error) => {
    throw new ImageError(
      e.message.includes('decode') || e.message.includes('source image')
        ? 'Formato de imagen no admitido por este navegador.'
        : e.message,
    )
  })

  const compressed = new Blob([res.buffer], { type: 'image/webp' })
  if (compressed.size < file.size) {
    return {
      blob: compressed,
      mime: 'image/webp',
      width: res.width,
      height: res.height,
      sizeOriginal: file.size,
      sizeCompressed: compressed.size,
    }
  }
  return {
    blob: file,
    mime: file.type,
    width: res.originalWidth,
    height: res.originalHeight,
    sizeOriginal: file.size,
    sizeCompressed: file.size,
  }
}
