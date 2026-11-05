/// <reference lib="webworker" />
// Compresión de imágenes en un Web Worker con codecs WebAssembly (Squoosh vía @jsquash):
// decodifica con el navegador, reescala (WASM) y recodifica a WebP (WASM).
import resize from '@jsquash/resize'
import encode from '@jsquash/webp/encode'
import { fitWithin } from '../lib/image/utils'

export interface CompressRequest {
  id: number
  file: Blob
  maxSide: number
  quality: number
}

export type CompressResponse =
  | {
      id: number
      ok: true
      buffer: ArrayBuffer
      width: number
      height: number
      originalWidth: number
      originalHeight: number
    }
  | { id: number; ok: false; error: string }

self.onmessage = async (e: MessageEvent<CompressRequest>) => {
  const { id, file, maxSide, quality } = e.data
  try {
    const bitmap = await createImageBitmap(file) // respeta la orientación EXIF
    const { width: originalWidth, height: originalHeight } = bitmap
    const canvas = new OffscreenCanvas(originalWidth, originalHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    let pixels = ctx.getImageData(0, 0, originalWidth, originalHeight)

    const target = fitWithin(originalWidth, originalHeight, maxSide)
    if (target.width !== originalWidth || target.height !== originalHeight) {
      pixels = await resize(pixels, target)
    }
    const buffer = await encode(pixels, { quality })
    const res: CompressResponse = {
      id,
      ok: true,
      buffer,
      width: target.width,
      height: target.height,
      originalWidth,
      originalHeight,
    }
    self.postMessage(res, [buffer])
  } catch (err) {
    const res: CompressResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(res)
  }
}
