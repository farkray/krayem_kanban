import { useEffect, useRef, type ReactNode } from 'react'
import styles from './Modal.module.css'

const stack: symbol[] = []

interface Props {
  label: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'lg'
  alert?: boolean
  /** Sin relleno: el contenido define su propia cabecera, cuerpo con scroll y pie. */
  flush?: boolean
}

export function Modal({
  label,
  onClose,
  children,
  size = 'sm',
  alert = false,
  flush = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const me = Symbol('modal')
    stack.push(me)
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={label}
        className={`${styles.dialog} ${size === 'lg' ? styles.lg : styles.sm} ${flush ? styles.flush : ''}`}
      >
        {children}
      </div>
    </div>
  )
}
