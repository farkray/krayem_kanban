import { useMemo } from 'react'
import { create } from 'zustand'
import { db } from '../db/db'
import { setIdentityResolver, setRoleResolver, type Role } from '../lib/access'
import { displayName } from '../lib/people'
import { getConfig } from '../lib/config'
import { useStore } from '../store/store'
import { useAuth } from './auth'

export type ShareRole = 'editor' | 'viewer'

/** Un tablero que otra persona comparte conmigo. */
export interface SharedBoard {
  boardId: string
  role: ShareRole
  ownerId: string
  ownerEmail: string
  ownerAlias?: string
}

/** Quien participa en un tablero que veo (dueño incluido). */
export interface Participant {
  boardId: string
  userId: string
  email: string
  alias?: string
  role: 'owner' | ShareRole
}

/** Una persona con acceso a uno de MIS tableros. */
export interface Member {
  boardId: string
  userId: string
  email: string
  alias?: string
  role: ShareRole
}

interface AccessState {
  shared: SharedBoard[]
  members: Member[]
  participants: Participant[]
  loaded: boolean
}

export const useAccess = create<AccessState>(() => ({
  shared: [],
  members: [],
  participants: [],
  loaded: false,
}))

/** Rol en un tablero: dueño (propio o sin cuentas), editor o solo lectura. */
function resolve(boardId: string): Role {
  const board = useStore.getState().boards.find((b) => b.id === boardId)
  const me = useAuth.getState().userId
  if (!board?.ownerId || !me || board.ownerId === me) return 'owner'
  // Ajeno y sin permiso conocido (p. ej. aún sin descargar la lista): lo más seguro es solo lectura.
  return useAccess.getState().shared.find((s) => s.boardId === boardId)?.role ?? 'viewer'
}
setRoleResolver(resolve)
setIdentityResolver(() => useAuth.getState().userId)

const api = (path: string) => `${getConfig().API_URL}${path}`

async function send(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(api(path), {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.ok) return null
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'error'
  } catch {
    return 'offline'
  }
}

/** Al abrir sin red se usa lo último que se supo. */
export async function loadCachedAccess() {
  const cached = (await db.meta.get('access'))?.value as
    Pick<AccessState, 'shared' | 'members' | 'participants'> | undefined
  if (cached)
    useAccess.setState({ ...cached, participants: cached.participants ?? [], loaded: true })
}

export function resetAccess() {
  useAccess.setState({ shared: [], members: [], participants: [], loaded: false })
}

/**
 * Pide al servidor qué tableros comparten conmigo y quién ve los míos. Si ya no tengo acceso a
 * un tablero ajeno (me sacaron o lo dejaron de compartir), se borra del dispositivo.
 */
export async function refreshAccess(): Promise<void> {
  let data: Pick<AccessState, 'shared' | 'members' | 'participants'>
  try {
    const res = await fetch(api('/shares'), { credentials: 'same-origin' })
    if (!res.ok) return
    data = (await res.json()) as typeof data
  } catch {
    return // sin red: se queda con lo último que se supo
  }
  useAccess.setState({ ...data, participants: data.participants ?? [], loaded: true })
  await db.meta.put({ key: 'access', value: data })

  const me = useAuth.getState().userId
  const keep = new Set(data.shared.map((s) => s.boardId))
  const lost = useStore
    .getState()
    .boards.filter((b) => b.ownerId && b.ownerId !== me && !keep.has(b.id))
    .map((b) => b.id)
  await useStore.getState().purgeBoards(lost)
}

/** Comparte (o cambia el permiso de) un tablero con alguien por su correo. Devuelve el error o null. */
export async function shareBoard(boardId: string, email: string, role: ShareRole) {
  const err = await send('POST', `/boards/${encodeURIComponent(boardId)}/members`, {
    email: email.trim(),
    role,
  })
  if (!err) await refreshAccess()
  return err
}

/** El dueño quita a alguien, o un miembro se sale (su propio id). */
export async function removeMember(boardId: string, userId: string) {
  const err = await send(
    'DELETE',
    `/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`,
  )
  if (!err) await refreshAccess()
  return err
}

export interface BoardAccess {
  role: Role
  canEdit: boolean
  isOwner: boolean
  /** Solo en tableros ajenos: quién los comparte. */
  ownerEmail: string | null
  /** Nombre a mostrar del dueño (alias o correo). */
  ownerName: string | null
  /** Solo en tableros propios: con quién se comparten. */
  members: Member[]
}

/** Acceso a un tablero, reactivo (se actualiza al cambiar permisos). */
export function useBoardAccess(boardId: string | null | undefined): BoardAccess {
  const ownerId = useStore((s) => s.boards.find((b) => b.id === boardId)?.ownerId)
  const me = useAuth((s) => s.userId)
  const shared = useAccess((s) => s.shared)
  const members = useAccess((s) => s.members)
  const foreign = !!ownerId && !!me && ownerId !== me
  const mine = shared.find((x) => x.boardId === boardId)
  const role: Role = !foreign ? 'owner' : (mine?.role ?? 'viewer')
  return {
    role,
    canEdit: role !== 'viewer',
    isOwner: role === 'owner',
    ownerEmail: foreign ? (mine?.ownerEmail ?? null) : null,
    ownerName:
      foreign && mine ? displayName({ email: mine.ownerEmail, alias: mine.ownerAlias }) : null,
    members: foreign ? [] : members.filter((m) => m.boardId === boardId),
  }
}

/** Personas de un tablero (dueño primero). Vacío si es privado o no hay cuentas. */
export function useParticipants(boardId: string | null | undefined): Participant[] {
  const all = useAccess((s) => s.participants)
  return useMemo(() => {
    const rank = { owner: 0, editor: 1, viewer: 2 }
    return all
      .filter((p) => p.boardId === boardId)
      .sort(
        (a, b) => rank[a.role] - rank[b.role] || displayName(a).localeCompare(displayName(b), 'es'),
      )
  }, [all, boardId])
}
