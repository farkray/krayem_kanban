import { useEffect, useRef, useState } from 'react'
import { formatShortDate, relativeTime } from '../lib/format'
import { TODAY_GROUPS, type TodayItem } from '../lib/today'
import { markSeen, useTodaySummary, wasSeen } from '../store/today'
import { useAuth } from '../sync/auth'
import {
  markAllRead,
  markRead,
  refreshNotifications,
  useNotifications,
  type AppNotification,
} from '../sync/notifications'
import { BellIcon } from './Icons'
import styles from './NotificationsBell.module.css'

type Filter = 'all' | 'mention' | 'assignment'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'mention', label: 'Menciones' },
  { id: 'assignment', label: 'Asignaciones' },
]

/** Frase del aviso: quién hizo qué. */
function describe(n: AppNotification): string {
  const who = n.actorName || 'Alguien'
  switch (n.type) {
    case 'mention':
      return n.count > 1 ? `${who} te mencionó ${n.count} veces` : `${who} te mencionó`
    case 'assignment':
      return `${who} te asignó una tarjeta`
    case 'access_granted':
      return `${who} te compartió un tablero (${n.excerpt || 'acceso'})`
    case 'access_role':
      return `${who} cambió tu permiso a ${n.excerpt || 'otro'}`
    case 'access_removed':
      return `${who} te quitó el acceso a un tablero`
  }
}

const matches = (n: AppNotification, f: Filter) => f === 'all' || n.type === f

const MAX_PER_GROUP = 5

/** Campana con contador y panel con los avisos; al pulsar uno se abre su tarjeta o tablero. */
export function NotificationsBell({
  onOpen,
  onOpenCard,
}: {
  onOpen: (n: AppNotification) => void
  /** Se pulsó una tarjeta del resumen "Hoy". */
  onOpenCard: (item: TodayItem) => void
}) {
  const items = useNotifications((s) => s.items)
  const unread = useNotifications((s) => s.unread)
  const me = useAuth((s) => s.userId)
  const { items: today, day } = useTodaySummary()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  // El resumen "Hoy" suma 1 al contador hasta que se abre el panel; el día siguiente vuelve a sumar.
  const [seenDay, setSeenDay] = useState(() => (wasSeen(day, me) ? day : ''))
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void refreshNotifications()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const shown = items.filter((n) => matches(n, filter))
  const showToday = filter === 'all' && today.length > 0
  const badge = unread + (today.length > 0 && seenDay !== day ? 1 : 0)
  const label = badge > 0 ? `Notificaciones, ${badge} sin leer` : 'Notificaciones'

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.bell}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          if (!open) {
            markSeen(day, me)
            setSeenDay(day)
          }
          setOpen((v) => !v)
        }}
      >
        <BellIcon />
        {badge > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      {open && (
        <div className={styles.panel} role="group" aria-label="Notificaciones">
          <div className={styles.head}>
            <h2 className={styles.title}>Notificaciones</h2>
            <button
              type="button"
              className={styles.readAll}
              disabled={unread === 0}
              onClick={markAllRead}
            >
              Marcar todo como leído
            </button>
          </div>
          <div className={styles.tabs} role="group" aria-label="Filtrar">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? `${styles.tab} ${styles.active}` : styles.tab}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {showToday && (
            <section className={styles.today} aria-label="Hoy">
              <h3 className={styles.todayTitle}>Hoy</h3>
              {TODAY_GROUPS.map((g) => {
                const rows = today.filter((i) => i.group === g.id)
                if (rows.length === 0) return null
                return (
                  <div key={g.id} className={styles.group}>
                    <p
                      className={`${styles.groupLabel} ${g.id === 'overdue' ? styles.overdue : ''}`}
                    >
                      {g.label} · {rows.length}
                    </p>
                    <ul className={styles.todayList}>
                      {rows.slice(0, MAX_PER_GROUP).map((i) => (
                        <li key={i.cardId}>
                          <button
                            type="button"
                            className={styles.todayItem}
                            onClick={() => {
                              setOpen(false)
                              onOpenCard(i)
                            }}
                          >
                            <span className={styles.todayName}>{i.title}</span>
                            <span className={styles.todayDate}>{formatShortDate(i.date)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {rows.length > MAX_PER_GROUP && (
                      <p className={styles.more}>y {rows.length - MAX_PER_GROUP} más</p>
                    )}
                  </div>
                )
              })}
            </section>
          )}
          {shown.length === 0 ? (
            showToday ? null : (
              <p className={styles.empty}>
                {items.length === 0 ? 'Todavía no tienes avisos.' : 'No hay avisos de este tipo.'}
              </p>
            )
          ) : (
            <ul className={styles.list}>
              {shown.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.readAt ? styles.item : `${styles.item} ${styles.unread}`}
                    onClick={() => {
                      markRead([n.id])
                      setOpen(false)
                      onOpen(n)
                    }}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.body}>
                      <span className={styles.what}>{describe(n)}</span>
                      {n.title && <span className={styles.card}>{n.title}</span>}
                      {n.type === 'mention' && n.excerpt && (
                        <span className={styles.excerpt}>{n.excerpt}</span>
                      )}
                      <span className={styles.time}>{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className={styles.sr}>Sin leer</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
