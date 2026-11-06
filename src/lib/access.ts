/** Rol de la persona en un tablero. `owner` también cubre el modo solo-local (sin cuentas). */
export type Role = 'owner' | 'editor' | 'viewer'

type Resolver = (boardId: string) => Role

let resolver: Resolver = () => 'owner'

/** El módulo de acceso (sync/access) registra aquí cómo saber el rol; el store solo pregunta. */
export const setRoleResolver = (fn: Resolver | null) => {
  resolver = fn ?? (() => 'owner')
}

export const roleOf = (boardId: string): Role => resolver(boardId)
export const canEditBoard = (boardId: string) => roleOf(boardId) !== 'viewer'
