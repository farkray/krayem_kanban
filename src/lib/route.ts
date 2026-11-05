import { useCallback, useEffect, useState } from 'react'

export const boardPath = (id: string) => `/b/${id}`

export function parseBoardId(pathname: string): string | null {
  const m = /^\/b\/([^/]+)\/?$/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/** Ruta mínima basada en History API: `/` (inicio) y `/b/:id` (tablero). */
export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, replace = false) => {
    if (to === window.location.pathname) return
    if (replace) window.history.replaceState(null, '', to)
    else window.history.pushState(null, '', to)
    setPath(to)
  }, [])

  return { boardId: parseBoardId(path), navigate }
}
