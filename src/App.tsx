import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Board } from './components/Board'
import { displayName } from './lib/people'
import { AdminPanel } from './components/AdminPanel'
import { AlertsDialog } from './components/AlertsDialog'
import { ChangePasswordDialog } from './components/ChangePasswordDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { HomeView } from './components/HomeView'
import { LoginScreen } from './components/LoginScreen'
import { PwaPrompts } from './components/PwaPrompts'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { Topbar } from './components/Topbar'
import { ADMIN_PATH, boardPath, useRoute } from './lib/route'
import { useMediaQuery, WIDE_QUERY } from './lib/useMediaQuery'
import type { SearchResult } from './lib/search'
import { useBoardSummaries, useBoards } from './store/hooks'
import { useAuth } from './sync/auth'
import { bootSync, signOut } from './sync/boot'
import { markCardRead, refreshNotifications, type AppNotification } from './sync/notifications'
import { useSync } from './sync/status'
import { useStore } from './store/store'
import styles from './App.module.css'

// El modal arrastra Markdown + sanitizado: se carga solo al abrir una tarjeta.
const CardModal = lazy(() =>
  import('./components/CardModal').then((m) => ({ default: m.CardModal })),
)

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const createBoard = useStore((s) => s.createBoard)
  const moveBoard = useStore((s) => s.moveBoard)
  const boards = useBoards()
  const summaries = useBoardSummaries()
  const { boardId, isAdminPage, navigate } = useRoute()
  const authStatus = useAuth((s) => s.status)
  const email = useAuth((s) => s.email)
  const alias = useAuth((s) => s.alias)
  const isAdmin = useAuth((s) => s.isAdmin)
  const pending = useSync((s) => s.pending)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [editingAlerts, setEditingAlerts] = useState(false)

  // Pantalla ancha: barra lateral fija (se puede ocultar). Angosta: panel deslizable, cerrado al inicio.
  const wide = useMediaQuery(WIDE_QUERY, true)
  const [sidebarOpen, setSidebarOpen] = useState(wide)
  // Al cruzar el ancho límite se reinicia (se ajusta durante el render, sin efecto)
  const [wasWide, setWasWide] = useState(wide)
  if (wasWide !== wide) {
    setWasWide(wide)
    setSidebarOpen(wide)
  }
  const closeDrawer = useCallback(() => {
    if (!wide) setSidebarOpen(false)
  }, [wide])
  const [openCardId, setOpenCardId] = useState<string | null>(null)

  useEffect(() => {
    if (wide || !sidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wide, sidebarOpen])

  useEffect(() => {
    void init()
    void bootSync()
  }, [init])

  // Al abrir una tarjeta se leen sus avisos (mención, asignación): la campana queda al día.
  useEffect(() => {
    if (openCardId) markCardRead(openCardId)
  }, [openCardId])

  // Con sesión iniciada se descarga la bandeja (después llegan los avisos en vivo).
  useEffect(() => {
    if (authStatus === 'signedIn') void refreshNotifications()
  }, [authStatus])

  const active = boards.find((b) => b.id === boardId) ?? null
  const closeCard = useCallback(() => setOpenCardId(null), [])

  const openBoard = (id: string) => {
    setOpenCardId(null)
    navigate(boardPath(id))
    closeDrawer()
  }

  const create = (title: string) => {
    const id = createBoard(title)
    if (id) openBoard(id)
  }

  const onPick = (r: SearchResult) => {
    closeDrawer()
    navigate(boardPath(r.boardId))
    setOpenCardId(r.cardId ?? null)
  }

  /** Un aviso abre su tarjeta; si es de acceso, el tablero (salvo que ya no tenga acceso). */
  const onOpenNotification = (n: AppNotification) => {
    closeDrawer()
    if (n.type === 'access_removed') return
    navigate(boardPath(n.boardId))
    setOpenCardId(n.cardId)
  }

  if (!ready || authStatus === 'loading') return <div className={styles.loading}>Cargando…</div>
  if (authStatus === 'signedOut') return <LoginScreen />

  const drawer = !wide
  const sidebar = (
    <Sidebar
      boards={summaries}
      activeId={isAdminPage ? null : (active?.id ?? null)}
      drawer={drawer}
      onSelect={openBoard}
      onCreate={create}
      onMove={moveBoard}
      onToggle={() => setSidebarOpen(false)}
      account={
        authStatus === 'signedIn'
          ? {
              email: email ? displayName({ email, alias }) : email,
              onSignOut: () => {
                closeDrawer()
                setConfirmSignOut(true)
              },
              onChangePassword: () => {
                closeDrawer()
                setChangingPassword(true)
              },
              onAlerts: () => {
                closeDrawer()
                setEditingAlerts(true)
              },
              onManageUsers: isAdmin
                ? () => {
                    setOpenCardId(null)
                    closeDrawer()
                    navigate(ADMIN_PATH)
                  }
                : undefined,
              adminActive: isAdminPage,
            }
          : undefined
      }
    />
  )

  return (
    <div className={sidebarOpen && !drawer ? styles.shell : `${styles.shell} ${styles.collapsed}`}>
      {sidebarOpen && !drawer && sidebar}
      {sidebarOpen && drawer && (
        <>
          <div className={styles.scrim} onClick={closeDrawer} aria-hidden="true" />
          {sidebar}
        </>
      )}
      <div className={styles.main}>
        <Topbar
          menuVisible={drawer || !sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onHome={() => {
            setOpenCardId(null)
            closeDrawer()
            navigate('/')
          }}
          onPick={onPick}
          boardId={isAdminPage ? null : (active?.id ?? null)}
          onOpenNotification={onOpenNotification}
          onOpenTodayCard={(item) => {
            closeDrawer()
            navigate(boardPath(item.boardId))
            setOpenCardId(item.cardId)
          }}
        />
        <main className={styles.content}>
          {isAdminPage ? (
            <AdminPanel me={email} isAdmin={isAdmin} onBack={() => navigate('/')} />
          ) : active ? (
            <Board
              key={active.id}
              board={active}
              onOpenCard={setOpenCardId}
              onDeleted={() => navigate('/')}
            />
          ) : (
            <HomeView boards={summaries} onOpen={openBoard} onCreate={create} onMove={moveBoard} />
          )}
        </main>
      </div>
      {openCardId && (
        <Suspense fallback={null}>
          <CardModal cardId={openCardId} onClose={closeCard} />
        </Suspense>
      )}
      <Toast />
      <PwaPrompts />
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      {editingAlerts && <AlertsDialog onClose={() => setEditingAlerts(false)} />}
      {confirmSignOut && (
        <ConfirmDialog
          title="Cerrar sesión"
          confirmLabel="Cerrar sesión"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            setConfirmSignOut(false)
            setOpenCardId(null)
            navigate('/', true)
            void signOut()
          }}
        >
          <p>
            Tus datos están en la nube; se borrarán de este dispositivo.
            {pending > 0 &&
              ` Hay ${pending} ${pending === 1 ? 'cambio' : 'cambios'} sin enviar: se intentará enviarlos antes de salir.`}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
