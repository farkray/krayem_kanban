import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  adminGetDelivery,
  adminNewSecret,
  adminRetryDelivery,
  adminSaveDelivery,
  adminTestDelivery,
  deliveryWorkflowUrl,
  type DeliveryAdmin,
} from '../sync/admin'
import styles from './AdminNotifications.module.css'

const MESSAGES: Record<string, string> = {
  invalid_url: 'La URL del webhook no es válida (usa http o https, sin usuario ni contraseña).',
  url_required: 'Escribe la URL del webhook antes de activar el envío.',
  invalid_timezone: 'Esa zona horaria no existe (por ejemplo America/Mexico_City).',
  webhook_failed: 'El webhook no aceptó la prueba.',
  offline: 'No hay conexión con el servidor.',
  forbidden: 'Tu cuenta no tiene permiso de administrador.',
}

const timeZones = (): string[] => {
  try {
    return (
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        'timeZone',
      ) ?? []
    )
  } catch {
    return []
  }
}

/** Sección del panel de control: a dónde se mandan los avisos para correo y WhatsApp (n8n). */
export function AdminNotifications() {
  const [cfg, setCfg] = useState<DeliveryAdmin | null>(null)
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [timezone, setTimezone] = useState('America/Mexico_City')
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const apply = useCallback((c: DeliveryAdmin) => {
    setCfg(c)
    setUrl(c.url)
    setEnabled(c.enabled)
    setTimezone(c.timezone)
  }, [])

  useEffect(() => {
    void adminGetDelivery().then((res) => {
      if (res.ok && res.data) apply(res.data)
      else if (!res.ok)
        setInfo({ tone: 'error', text: MESSAGES[res.error] ?? 'No se pudo cargar.' })
    })
  }, [apply])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setInfo(null)
    const res = await adminSaveDelivery({
      url: url.trim(),
      enabled,
      timezone: timezone.trim(),
      publicUrl: window.location.origin, // para los enlaces de los avisos
    })
    setBusy(false)
    if (res.ok) {
      apply(res.data)
      setInfo({ tone: 'ok', text: 'Guardado.' })
    } else setInfo({ tone: 'error', text: MESSAGES[res.error] ?? 'No se pudo guardar.' })
  }

  const newSecret = async () => {
    setBusy(true)
    const res = await adminNewSecret()
    setBusy(false)
    if (res.ok) {
      setSecret(res.data.secret)
      setCopied(false)
      apply(res.data)
    } else setInfo({ tone: 'error', text: MESSAGES[res.error] ?? 'No se pudo generar.' })
  }

  const copy = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      /* sin portapapeles: queda visible para copiarlo a mano */
    }
  }

  const test = async () => {
    setBusy(true)
    setInfo(null)
    const res = await adminTestDelivery()
    setBusy(false)
    setInfo(
      res.ok
        ? { tone: 'ok', text: 'Prueba enviada. Revisa tu correo y tu WhatsApp (si los activaste).' }
        : {
            tone: 'error',
            text: `${MESSAGES[res.error] ?? 'No se pudo enviar la prueba.'}${res.detail ? ` ${res.detail}` : ''}`,
          },
    )
  }

  const retry = async () => {
    setBusy(true)
    const res = await adminRetryDelivery()
    setBusy(false)
    if (res.ok) apply(res.data)
  }

  const zones = timeZones()
  const s = cfg?.stats

  return (
    <section className={styles.card} aria-labelledby="notif-title">
      <h2 id="notif-title" className={styles.sub}>
        Avisos por correo y WhatsApp
      </h2>
      <p className={styles.hint}>
        El kanban envía cada aviso a un webhook de n8n, que lo reparte por correo y WhatsApp según
        lo que elija cada persona. Descarga el flujo, impórtalo en n8n y pega aquí su URL.
      </p>

      <form onSubmit={save}>
        <label className={styles.check}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enviar avisos al webhook
        </label>
        <label className={styles.label}>
          URL del webhook de n8n
          <input
            type="url"
            className={styles.input}
            value={url}
            placeholder="https://tu-n8n/webhook/kanban-avisos"
            autoComplete="off"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          Zona horaria del resumen diario
          <input
            type="text"
            className={styles.input}
            value={timezone}
            list="kanban-zones"
            autoComplete="off"
            onChange={(e) => setTimezone(e.target.value)}
          />
          {zones.length > 0 && (
            <datalist id="kanban-zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          )}
        </label>
        <div className={styles.row}>
          <button type="submit" className={styles.primary} disabled={busy}>
            Guardar configuración
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy || !cfg?.enabled}
            onClick={test}
          >
            Enviar prueba
          </button>
        </div>
      </form>

      <div className={styles.block}>
        <h3 className={styles.small}>Secreto del webhook</h3>
        <p className={styles.hint}>
          {cfg?.hasSecret
            ? 'Hay un secreto guardado. n8n lo usa para comprobar que los avisos vienen de este kanban.'
            : 'Se crea solo al activar el envío.'}
        </p>
        <button type="button" className={styles.secondary} disabled={busy} onClick={newSecret}>
          {cfg?.hasSecret ? 'Generar secreto nuevo' : 'Generar secreto'}
        </button>
        {secret && (
          <div className={styles.secret} role="status" aria-label="Secreto nuevo">
            <p>
              Cópialo ahora: no se vuelve a mostrar. En n8n crea una credencial <em>Header Auth</em>{' '}
              con nombre <code>Authorization</code> y valor <code>Bearer </code> seguido del
              secreto.
            </p>
            <div className={styles.secretRow}>
              <code className={styles.code}>{secret}</code>
              <button type="button" className={styles.secondary} onClick={copy}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.small}>Flujo de n8n</h3>
        <p className={styles.hint}>
          Incluye el webhook, el correo, WhatsApp y el resumen diario. No lleva secretos.
        </p>
        <a
          className={styles.secondary}
          href={deliveryWorkflowUrl()}
          download="kanban-avisos-n8n.json"
        >
          Descargar flujo de n8n
        </a>
      </div>

      {s && (
        <p className={styles.stats}>
          En cola: {s.pending} · Enviados: {s.sent} · Fallidos: {s.failed}
          {s.failed > 0 && (
            <>
              {' '}
              <button type="button" className={styles.link} disabled={busy} onClick={retry}>
                Reintentar fallidos
              </button>
            </>
          )}
          {s.lastError && <span className={styles.errorText}> Último error: {s.lastError}</span>}
        </p>
      )}

      {info && (
        <p
          className={info.tone === 'error' ? styles.error : styles.ok}
          role={info.tone === 'error' ? 'alert' : 'status'}
        >
          {info.text}
        </p>
      )}
    </section>
  )
}
