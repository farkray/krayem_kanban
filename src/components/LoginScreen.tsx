import { useEffect, useState, type FormEvent } from 'react'
import { authConfig, signIn, signUp } from '../sync/boot'
import styles from './LoginScreen.module.css'

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  too_many_attempts: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  offline: 'No hay conexión con el servidor.',
  email_taken: 'Ya existe una cuenta con ese correo.',
  weak_password: 'La contraseña debe tener al menos 10 caracteres.',
  invalid_email: 'Escribe un correo válido.',
  signup_disabled: 'El registro está desactivado.',
}

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [allowSignup, setAllowSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void authConfig().then((c) => setAllowSignup(c.allowSignup))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const code = await (mode === 'login' ? signIn : signUp)(email.trim(), password)
    setBusy(false)
    // Si entra, la app cambia de pantalla sola (el estado de sesión pasa a "signedIn").
    if (code) setError(MESSAGES[code] ?? 'No se pudo completar la acción. Inténtalo de nuevo.')
  }

  const signup = mode === 'signup'
  return (
    <main className={styles.screen}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Kanban</h1>
        <p className={styles.text}>
          {signup ? 'Crea tu cuenta.' : 'Inicia sesión para sincronizar tus tableros.'}
        </p>
        <label className={styles.label}>
          Correo electrónico
          <input
            type="email"
            className={styles.input}
            value={email}
            autoComplete="username"
            autoFocus
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={`${styles.label} ${styles.gap}`}>
          Contraseña
          <input
            type="password"
            className={styles.input}
            value={password}
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 10 : undefined}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={styles.submit}
          disabled={busy || !email.trim() || !password}
        >
          {busy ? 'Entrando…' : signup ? 'Crear cuenta' : 'Entrar'}
        </button>
        {allowSignup && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setMode(signup ? 'login' : 'signup')
              setError(null)
            }}
          >
            {signup ? 'Ya tengo cuenta' : 'Crear una cuenta'}
          </button>
        )}
      </form>
    </main>
  )
}
