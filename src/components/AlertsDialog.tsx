import { useEffect, useState, type FormEvent } from 'react'
import { getAlertPrefs, saveAlertPrefs, type AlertPrefs } from '../sync/alerts'
import { Modal } from './Modal'
import styles from './ChangePasswordDialog.module.css'
import own from './AlertsDialog.module.css'

const MESSAGES: Record<string, string> = {
  invalid_phone: 'El teléfono debe ir con código de país, por ejemplo +52 55 1234 5678.',
  phone_required: 'Para recibir avisos por WhatsApp escribe tu teléfono.',
  offline: 'No hay conexión con el servidor.',
}

/** "Mis avisos": qué canales usa cada persona para enterarse fuera de la app. */
export function AlertsDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(false)
  const [whatsapp, setWhatsapp] = useState(false)
  const [digest, setDigest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getAlertPrefs().then((res) => {
      if (!res.ok) return setError(MESSAGES[res.error] ?? 'No se pudo cargar.')
      setPrefs(res.data)
      setPhone(res.data.phone)
      setEmail(res.data.email)
      setWhatsapp(res.data.whatsapp)
      setDigest(res.data.digest)
    })
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setBusy(true)
    const res = await saveAlertPrefs({ phone: phone.trim(), email, whatsapp, digest })
    setBusy(false)
    if (res.ok) {
      setPrefs(res.data)
      setPhone(res.data.phone)
      setSaved(true)
    } else setError(MESSAGES[res.error] ?? 'No se pudo guardar. Inténtalo de nuevo.')
  }

  return (
    <Modal label="Avisos por correo y WhatsApp" onClose={onClose}>
      <form onSubmit={submit}>
        <h2 className={styles.title}>Avisos por correo y WhatsApp</h2>
        {prefs && !prefs.available ? (
          <p className={styles.text}>
            Quien administra este kanban todavía no activó los avisos fuera de la app. Mientras
            tanto los verás en la campana.
          </p>
        ) : (
          <>
            <p className={styles.text}>
              Además de la campana, te avisamos cuando te mencionan, te asignan una tarjeta o te
              comparten un tablero.
            </p>
            <label className={own.check}>
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              Por correo
            </label>
            <label className={own.check}>
              <input
                type="checkbox"
                checked={whatsapp}
                onChange={(e) => setWhatsapp(e.target.checked)}
              />
              Por WhatsApp
            </label>
            <label className={styles.label}>
              Teléfono (con código de país)
              <input
                type="tel"
                className={styles.input}
                value={phone}
                placeholder="+52 55 1234 5678"
                autoComplete="tel"
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className={own.check}>
              <input
                type="checkbox"
                checked={digest}
                onChange={(e) => setDigest(e.target.checked)}
              />
              Resumen cada mañana de lo que vence o empieza hoy
            </label>
            <p className={styles.hint}>
              El resumen y los avisos llegan por los canales que marcaste arriba.
            </p>
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className={own.ok} role="status">
            Guardado.
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {prefs && !prefs.available ? 'Entendido' : 'Cancelar'}
          </button>
          {prefs?.available && (
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
