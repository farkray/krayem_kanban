import { create } from 'zustand'

export interface SyncState {
  /** Hay nube configurada y sesión iniciada. */
  enabled: boolean
  online: boolean
  /** Cambios locales aún sin enviar. */
  pending: number
  syncing: boolean
  error: string | null
}

export const useSync = create<SyncState>(() => ({
  enabled: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  error: null,
}))

export const setSync = (patch: Partial<SyncState>) => useSync.setState(patch)

/** Texto del indicador. `null` si no hay sincronización (modo solo local). */
export function syncLabel(s: SyncState): string | null {
  if (!s.enabled) return null
  const changes = `${s.pending} ${s.pending === 1 ? 'cambio pendiente' : 'cambios pendientes'}`
  if (!s.online) return s.pending > 0 ? `Sin conexión · ${changes}` : 'Sin conexión'
  if (s.error) return 'Error al guardar · reintentando'
  if (s.syncing || s.pending > 0) return 'Guardando…'
  return 'Guardado'
}
