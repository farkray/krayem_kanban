import { useEffect, useState } from 'react'

/** Ancho a partir del cual la barra lateral es fija; por debajo, un panel deslizable. */
export const WIDE_QUERY = '(min-width: 900px)'
/** Teléfonos (y ventanas muy angostas): barra superior compacta. */
export const PHONE_QUERY = '(max-width: 640px)'

const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/** Se mantiene al día con una media query. Sin `matchMedia` (tests) devuelve `fallback`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    supported() ? window.matchMedia(query).matches : fallback,
  )

  useEffect(() => {
    if (!supported()) return
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
