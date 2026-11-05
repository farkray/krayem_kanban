export interface AppConfig {
  /** Base de la API de sincronización (p. ej. "/api"). Vacío = modo solo local, sin cuenta. */
  API_URL: string
}

declare global {
  interface Window {
    __CONFIG__?: Partial<AppConfig>
  }
}

/** Config en runtime (config.js del contenedor) con fallback a variables Vite en dev. */
export function getConfig(): AppConfig {
  const w = window.__CONFIG__ ?? {}
  return { API_URL: (w.API_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') }
}

/** ¿Hay servidor de sincronización configurado? Sin él la app funciona solo en local. */
export function isConfigured(): boolean {
  return Boolean(getConfig().API_URL)
}
