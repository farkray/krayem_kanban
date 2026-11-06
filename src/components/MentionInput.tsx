import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { filterPeople, mentionQuery, type MentionPerson } from '../lib/mentions'
import { MentionMenu } from './MentionMenu'
import styles from './MentionInput.module.css'

interface Props {
  value: string
  onChange: (v: string) => void
  people: MentionPerson[]
  label: string
  placeholder?: string
  maxLength?: number
  className?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
}

/** Campo de una línea con autocompletado al escribir "@": se elige a una persona de la lista. */
export function MentionInput({
  value,
  onChange,
  people,
  label,
  placeholder,
  maxLength,
  className,
  autoFocus,
  onKeyDown,
  onPaste,
  onBlur,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const q = mentionQuery(value.slice(0, caret))
  const options = q ? filterPeople(people, q.query) : []
  const open = !dismissed && options.length > 0

  const pick = (p: MentionPerson) => {
    if (!q) return
    const inserted = `@${p.name} `
    const next = value.slice(0, q.start) + inserted + value.slice(caret)
    onChange(next)
    const pos = q.start + inserted.length
    setCaret(pos)
    setActive(0)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation() // Enter elige a la persona; no envía el campo
        pick(options[Math.min(active, options.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(true)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <span className={styles.wrap}>
      <input
        ref={ref}
        className={className}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${Math.min(active, options.length - 1)}` : undefined}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setActive(0)
          setDismissed(false)
        }}
        onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyDown={keyDown}
        onPaste={onPaste}
        onBlur={() => {
          setDismissed(true)
          onBlur?.()
        }}
      />
      {open && (
        <MentionMenu
          id={id}
          options={options}
          active={Math.min(active, options.length - 1)}
          onPick={pick}
          style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}
        />
      )}
    </span>
  )
}
