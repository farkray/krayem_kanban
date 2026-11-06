import { getConfig } from '../lib/config'

export interface DirectoryUser {
  id: string
  email: string
  alias: string
}

/** Usuarios registrados (menos uno mismo), para elegir con quién compartir. `null` si no se pudo cargar. */
export async function fetchDirectory(): Promise<DirectoryUser[] | null> {
  try {
    const res = await fetch(`${getConfig().API_URL}/users/directory`, {
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    return ((await res.json()) as { users: DirectoryUser[] }).users
  } catch {
    return null
  }
}
