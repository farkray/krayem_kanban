import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import styles from './InlineInput.module.css'

interface Props {
  initial?: string
  placeholder?: string
  label: string
  maxLength: number
  /** Si se mantiene abierto tras enviar (para encadenar tarjetas). */
  keepOpen?: boolean
  /** Enviar al perder el foco (renombrar) en lugar de cancelar (alta). */
  submitOnBlur?: boolean
  className?: string
  onSubmit: (text: string) => void
  onCancel: () => void
}

export function InlineInput({
  initial = '',
  placeholder,
  label,
  maxLength,
  keepOpen = false,
  submitOnBlur = false,
  className,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const submit = () => {
    if (done.current) return
    const text = value.trim()
    if (!text) return onCancel()
    if (keepOpen) {
      onSubmit(text)
      setValue('')
      return
    }
    done.current = true
    onSubmit(text)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      done.current = true
      onCancel()
    }
  }

  const onBlur = () => {
    if (done.current) return
    if (submitOnBlur) submit()
    else {
      done.current = true
      onCancel()
    }
  }

  return (
    <input
      ref={ref}
      className={`${styles.input} ${className ?? ''}`}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  )
}
