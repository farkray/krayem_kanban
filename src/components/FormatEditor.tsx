import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { applyFormat, type FormatKind } from '../lib/mdFormat'
import {
  CodeIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  QuoteIcon,
  RuleIcon,
  TaskListIcon,
} from './Icons'
import styles from './FormatEditor.module.css'

const TOOLS: { kind: FormatKind; label: string; icon: ReactNode; key?: string }[] = [
  { kind: 'heading', label: 'Título', icon: <span className={styles.glyph}>H</span> },
  { kind: 'bold', label: 'Negrita', icon: <b className={styles.glyph}>B</b>, key: 'b' },
  { kind: 'italic', label: 'Cursiva', icon: <i className={styles.glyph}>I</i>, key: 'i' },
  { kind: 'strike', label: 'Tachado', icon: <s className={styles.glyph}>S</s> },
  { kind: 'ul', label: 'Lista con viñetas', icon: <ListIcon width={16} height={16} /> },
  { kind: 'ol', label: 'Lista numerada', icon: <OrderedListIcon width={16} height={16} /> },
  { kind: 'task', label: 'Lista de tareas', icon: <TaskListIcon width={16} height={16} /> },
  { kind: 'quote', label: 'Cita', icon: <QuoteIcon width={16} height={16} /> },
  { kind: 'code', label: 'Código', icon: <CodeIcon width={16} height={16} /> },
  { kind: 'link', label: 'Enlace', icon: <LinkIcon width={16} height={16} />, key: 'k' },
  { kind: 'rule', label: 'Línea separadora', icon: <RuleIcon width={16} height={16} /> },
]

interface Props {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder?: string
  rows?: number
  maxLength?: number
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  /** Pie del editor (p. ej. el botón de enviar), dentro del mismo recuadro. */
  footer?: ReactNode
}

/** Editor de texto con barra de formato. Guarda Markdown plano: el resultado se ve en el feed. */
export function FormatEditor({
  value,
  onChange,
  label,
  placeholder,
  rows = 4,
  maxLength,
  autoFocus,
  onKeyDown,
  footer,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ start: number; end: number } | null>(null)

  // Tras cambiar el texto desde la barra se restaura la selección (el valor es controlado).
  useLayoutEffect(() => {
    const sel = pending.current
    if (!sel || !ref.current) return
    pending.current = null
    ref.current.focus()
    ref.current.setSelectionRange(sel.start, sel.end)
  })

  const run = (kind: FormatKind) => {
    const el = ref.current
    if (!el) return
    const r = applyFormat(kind, value, el.selectionStart, el.selectionEnd)
    if (maxLength && r.value.length > maxLength) return
    pending.current = { start: r.start, end: r.end }
    onChange(r.value)
  }

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const tool = TOOLS.find((t) => t.key && t.key === e.key.toLowerCase())
      if (tool) {
        e.preventDefault()
        run(tool.kind)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className={styles.box}>
      <div className={styles.bar} role="toolbar" aria-label="Formato del texto">
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            type="button"
            className={styles.tool}
            aria-label={t.label}
            title={t.key ? `${t.label} (Ctrl+${t.key.toUpperCase()})` : t.label}
            // mousedown no debe quitar el foco ni la selección del texto
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.kind)}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
      />
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
