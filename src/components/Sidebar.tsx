import { useState } from 'react'
import { pluralize } from '../lib/format'
import { LIMITS } from '../lib/types'
import type { BoardSummary } from '../store/hooks'
import { BoardTile } from './BoardTile'
import { PlusIcon, SidebarIcon } from './Icons'
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
    /** Estás en el panel de control. */
    adminActive?: boolean
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
  const mine = boards.filter((b) => !b.sharedBy)
  const sharedWithMe = boards.filter((b) => b.sharedBy)

  const renderItem = (b: BoardSummary) => (
    <li key={b.id}>
      <button
        type="button"
        className={styles.item}
        aria-current={b.id === activeId ? 'page' : undefined}
        onClick={() => onSelect(b.id)}
      >
        <BoardTile className={styles.boardIcon} color={b.color} icon={b.icon} size={16} />
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{b.title}</span>
          <span className={styles.itemMeta}>
            {pluralize(b.columnCount, 'columna', 'columnas')} ·{' '}
            {pluralize(b.cardCount, 'tarjeta', 'tarjetas')}
          </span>
          {b.sharedBy && (
            <span className={styles.itemMeta}>
              De {b.sharedBy.name} · {b.sharedBy.role === 'editor' ? 'Editor' : 'Solo lectura'}
            </span>
          )}
          {b.memberCount > 0 && (
            <span className={styles.itemMeta}>
              Compartido con {pluralize(b.memberCount, 'persona', 'personas')}
            </span>
          )}
        </span>
      </button>
    </li>
  )

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
        <>
          <ul className={styles.list} aria-label="Mis tableros">
            {mine.map(renderItem)}
          </ul>
          {sharedWithMe.length > 0 && (
            <>
              <h3 className={styles.subheading}>Compartidos conmigo</h3>
              <ul className={styles.list} aria-label="Compartidos conmigo">
                {sharedWithMe.map(renderItem)}
              </ul>
            </>
          )}
        </>
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
            <button
              type="button"
              className={styles.signOut}
              aria-current={account.adminActive ? 'page' : undefined}
              onClick={account.onManageUsers}
            >
              Panel de control
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
