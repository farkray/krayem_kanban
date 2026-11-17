import { useCallback, useState } from 'react'

const KEY = 'kanban-notes-open'

/** Si el panel de notas del tablero está abierto; se recuerda entre visitas (por navegador). */
export function useNotesOpen() {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
  }, [])
  return [open, setOpen] as const
}
