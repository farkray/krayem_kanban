import type { SearchResult } from '../lib/search'
import type { AppNotification } from '../sync/notifications'
import { FilterMenu } from './FilterMenu'
import { HelpIcon, HomeIcon, SidebarIcon } from './Icons'
import { NotificationsBell } from './NotificationsBell'
import { InstallButton } from './PwaPrompts'
import { SearchBox } from './SearchBox'
import { SyncStatus } from './SyncStatus'
import styles from './Topbar.module.css'

interface Props {
  /** Mostrar el botón de menú (barra lateral oculta o panel deslizable). */
  menuVisible: boolean
  onToggleSidebar: () => void
  onHome: () => void
  onPick: (r: SearchResult) => void
  /** Tablero abierto (el filtro por etiquetas es de ese tablero). */
  boardId: string | null
  /** Se pulsó un aviso del centro de notificaciones. */
  onOpenNotification: (n: AppNotification) => void
}

export function Topbar({
  menuVisible,
  onToggleSidebar,
  onHome,
  onPick,
  boardId,
  onOpenNotification,
}: Props) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {menuVisible && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onToggleSidebar}
            aria-label="Mostrar barra lateral"
          >
            <SidebarIcon />
          </button>
        )}
        <button type="button" className={styles.iconBtn} onClick={onHome} aria-label="Inicio">
          <HomeIcon />
        </button>
      </div>
      <div className={styles.right}>
        <SyncStatus />
        <span className={styles.install}>
          <InstallButton />
        </span>
        <button type="button" className={`${styles.iconBtn} ${styles.extra}`} aria-label="Ayuda">
          <HelpIcon />
        </button>
        <FilterMenu boardId={boardId} />
        <SearchBox onPick={onPick} />
        <NotificationsBell onOpen={onOpenNotification} />
      </div>
    </header>
  )
}
