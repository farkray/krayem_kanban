import { getConfig } from '../lib/config'

export interface AdminUser {
  id: string
  email: string
  alias: string
  createdAt: string
  isAdmin: boolean
  /** Invitado: no crea tableros, solo participa en los que le comparten. */
  isGuest: boolean
  rows: number
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string; detail?: string }

const url = (path: string) => `${getConfig().API_URL}/admin${path}`

async function call<T>(method: string, path: string, body?: unknown): Promise<AdminResult<T>> {
  try {
    const res = await fetch(url(path), {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 204) return { ok: true, data: undefined as T }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string }
    return res.ok
      ? { ok: true, data }
      : { ok: false, error: data.error ?? 'error', detail: data.detail }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

export const adminListUsers = () => call<{ users: AdminUser[] }>('GET', '/users')

/** Sin `password` el servidor genera una temporal y la devuelve (solo esta vez). */
export const adminCreateUser = (
  email: string,
  password?: string,
  alias?: string,
  guest?: boolean,
  workspaceIds?: string[],
) =>
  call<{ user: AdminUser; password?: string }>('POST', '/users', {
    email,
    password,
    alias,
    guest,
    workspaceIds,
  })

export const adminSetGuest = (id: string, guest: boolean) =>
  call<{ user: AdminUser }>('PATCH', `/users/${encodeURIComponent(id)}`, { guest })

export const adminSetAlias = (id: string, alias: string) =>
  call<{ user: AdminUser }>('PATCH', `/users/${encodeURIComponent(id)}`, { alias })

export const adminResetPassword = (id: string) =>
  call<{ password: string }>('POST', `/users/${encodeURIComponent(id)}/password`)

export const adminDeleteUser = (id: string) =>
  call<void>('DELETE', `/users/${encodeURIComponent(id)}`)

/* ---------- avisos fuera de la app (webhook → n8n) ---------- */

export interface DeliveryAdmin {
  enabled: boolean
  url: string
  hasSecret: boolean
  publicUrl: string
  timezone: string
  stats: { pending: number; sent: number; failed: number; lastError: string }
}

export const adminGetDelivery = () => call<DeliveryAdmin>('GET', '/notifications')

export const adminSaveDelivery = (patch: {
  enabled?: boolean
  url?: string
  publicUrl?: string
  timezone?: string
}) => call<DeliveryAdmin>('PUT', '/notifications', patch)

/** Genera un secreto nuevo (el anterior deja de servir); se devuelve una sola vez. */
export const adminNewSecret = () =>
  call<DeliveryAdmin & { secret: string }>('POST', '/notifications/secret')

export const adminTestDelivery = () => call<{ ok: true }>('POST', '/notifications/test')

export const adminRetryDelivery = () => call<DeliveryAdmin>('POST', '/notifications/retry')

/** Dirección del flujo de n8n para descargar (JSON, sin secretos). */
export const deliveryWorkflowUrl = () => url('/notifications/workflow')

/* ---------- workspaces ---------- */

export interface AdminWorkspace {
  id: string
  name: string
  createdAt: string
  /** Ids de los usuarios que pertenecen. */
  members: string[]
  boards: number
}

export const adminListWorkspaces = () => call<{ workspaces: AdminWorkspace[] }>('GET', '/workspaces')

export const adminCreateWorkspace = (name: string) =>
  call<{ workspace: AdminWorkspace }>('POST', '/workspaces', { name })

export const adminRenameWorkspace = (id: string, name: string) =>
  call<{ workspace: AdminWorkspace }>('PATCH', `/workspaces/${encodeURIComponent(id)}`, { name })

export const adminSetWorkspaceMembers = (id: string, userIds: string[]) =>
  call<{ workspace: AdminWorkspace }>('PUT', `/workspaces/${encodeURIComponent(id)}/members`, {
    userIds,
  })

export const adminDeleteWorkspace = (id: string) =>
  call<void>('DELETE', `/workspaces/${encodeURIComponent(id)}`)

/* ---------- conexiones de agentes externos (API con token) ---------- */

export type AgentAccess = 'read' | 'write'

export interface AgentConnection {
  id: string
  name: string
  description: string
  tokenPrefix: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  canNotify: boolean
  canContacts: boolean
  boards: { boardId: string; access: AgentAccess; title: string; ownerName: string; available: boolean }[]
}

export interface AdminBoard {
  id: string
  title: string
  ownerEmail: string
  ownerName: string
  workspace: string
}

export interface AgentInput {
  name: string
  description: string
  expiresAt: string | null
  canNotify: boolean
  canContacts: boolean
  boards: { boardId: string; access: AgentAccess }[]
}

export interface AgentLogRow {
  at: string
  method: string
  path: string
  status: number
  boardId: string | null
}

export const adminListBoards = () => call<{ boards: AdminBoard[] }>('GET', '/boards')
export const adminListAgents = () => call<{ agents: AgentConnection[] }>('GET', '/agents')
export const adminCreateAgent = (input: AgentInput) =>
  call<{ agent: AgentConnection; token: string }>('POST', '/agents', input)
export const adminUpdateAgent = (id: string, input: Partial<AgentInput>) =>
  call<{ agent: AgentConnection }>('PATCH', `/agents/${encodeURIComponent(id)}`, input)
export const adminRotateAgent = (id: string) =>
  call<{ agent: AgentConnection; token: string }>('POST', `/agents/${encodeURIComponent(id)}/rotate`)
export const adminRevokeAgent = (id: string) =>
  call<{ agent: AgentConnection }>('POST', `/agents/${encodeURIComponent(id)}/revoke`)
export const adminDeleteAgent = (id: string) =>
  call<void>('DELETE', `/agents/${encodeURIComponent(id)}`)
export const adminAgentLog = (id: string) =>
  call<{ log: AgentLogRow[] }>('GET', `/agents/${encodeURIComponent(id)}/log?limit=50`)
