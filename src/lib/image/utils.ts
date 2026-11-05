/** Escala (w, h) para que el lado largo no pase de `max`, sin agrandar. Mantiene la proporción. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { width: w, height: h }
  const k = max / longest
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** "512 B", "380 KB", "4,2 MB". */
export function formatBytes(n: number): string {
  const fmt = (v: number) => v.toLocaleString('es', { maximumFractionDigits: 1 })
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${fmt(n / 1024)} KB`
  return `${fmt(n / (1024 * 1024))} MB`
}

/** "4,2 MB → 380 KB (−91 %)"; si no hubo ahorro, solo el tamaño. */
export function savingLabel(original: number, compressed: number): string {
  if (compressed >= original) return formatBytes(compressed)
  const pct = Math.round((1 - compressed / original) * 100)
  return `${formatBytes(original)} → ${formatBytes(compressed)} (−${pct} %)`
}
