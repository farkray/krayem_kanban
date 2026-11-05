import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

export interface Positioned {
  position: string
}

export const byPosition = (a: Positioned, b: Positioned): number =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0

/** Clave de orden para insertar en `index` dentro de `sorted` (ya ordenada, sin el elemento movido). */
export function positionAt(sorted: Positioned[], index: number): string {
  const i = Math.max(0, Math.min(index, sorted.length))
  return generateKeyBetween(sorted[i - 1]?.position ?? null, sorted[i]?.position ?? null)
}

export const positionsFor = (n: number): string[] => generateNKeysBetween(null, null, n)
