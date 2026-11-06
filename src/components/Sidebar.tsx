import { useState } from 'react'
import { pluralize } from '../lib/format'
import { LIMITS } from '../lib/types'
import type { BoardSummary } from '../store/hooks'
import { BoardIcon, PlusIcon, SidebarIcon } from './Icons'
import { InlineInput } from './InlineInput'
import { InstallButton } from './PwaPrompts'
import styles from './Sidebar.module.css'

interface Props {
  boards: BoardSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  onToggle: () => void
  /** Panel deslizable sobre el contenido (pantallas angostas). */
  drawer?: boolean
  /** Correo de la sesión y cierre de sesión (solo con nube configurada). */
  account?: {
    email: string | null
    onSignOut: () => void
    onChangePassword: () => void
    /** Solo administradores: abre la gestión de usuarios. */
    onManageUsers?: () => void
  }
}

export function Sidebar({
  boards,
  activeId,
  drawer = false,
  onSelect,
  onCreate,
  onToggle,
  account,
}: Props) {
  const [creating, setCreating] = useState(false)

  return (
    <aside className={`${styles.sidebar} ${drawer ? styles.drawer : ''}`} aria-label="Tableros">
      <div className={styles.chrome}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onToggle}
          aria-label={drawer ? 'Cerrar menú' : 'Ocultar barra lateral'}
          autoFocus={drawer}
        >
          <SidebarIcon />
        </button>
      </div>
      <header className={styles.header}>
        <h2 className={styles.heading}>Mis Tableros</h2>
        <button
          type="button"
          className={styles.add}
          aria-label="Nuevo tablero"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
        </button>
      </header>

      {creating && (
        <div className={styles.create}>
          <InlineInput
            label="Nombre del tablero"
            placeholder="Nombre del tablero"
            maxLength={LIMITS.board}
            onSubmit={(t) => {
              onCreate(t)
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {boards.length === 0 && !creating ? (
        <p className={styles.empty}>Aún no tienes tableros. Crea el primero con “+”.</p>
      ) : (
        <ul className={styles.list}>
          {boards.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className={styles.item}
                aria-current={b.id === activeId ? 'page' : undefined}
                onClick={() => onSelect(b.id)}
              >
                <span className={styles.boardIcon}>
                  <BoardIcon width={16} height={16} />
                </span>
                <span className={styles.itemText}>
                  <span className={styles.itemTitle}>{b.title}</span>
                  <span className={styles.itemMeta}>
                    {pluralize(b.columnCount, 'columna', 'columnas')} ·{' '}
                    {pluralize(b.cardCount, 'tarjeta', 'tarjetas')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {drawer && (
        <div className={styles.install}>
          <InstallButton />
        </div>
      )}
      {account && (
        <footer className={styles.account}>
          <span className={styles.email} title={account.email ?? undefined}>
            {account.email}
          </span>
          {account.onManageUsers && (
            <button type="button" className={styles.signOut} onClick={account.onManageUsers}>
              Usuarios
            </button>
          )}
          <button type="button" className={styles.signOut} onClick={account.onChangePassword}>
            Cambiar contraseña
          </button>
          <button type="button" className={styles.signOut} onClick={account.onSignOut}>
            Cerrar sesión
          </button>
        </footer>
      )}
    </aside>
  )
}
