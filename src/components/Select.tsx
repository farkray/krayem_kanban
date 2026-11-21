import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ChevronDownIcon } from './Icons'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  /** Nombre del campo: etiqueta flotante (variante `filled`) o nombre accesible (variante `pill`). */
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  /** `filled`: campo relleno con etiqueta flotante (Material 2). `pill`: compacto, para tablas y filas. */
  variant?: 'filled' | 'pill'
  className?: string
  /** Fuerza el selector nativo (true) o el propio (false). Por defecto: nativo con puntero táctil. */
  native?: boolean
}

const TOUCH = '(pointer: coarse)'
const MENU_MAX = 320
const ROW = 48

interface Pos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
  up: boolean
}

/**
 * Selector desplegable al estilo "exposed dropdown menu" de Material Design 2: campo relleno con etiqueta flotante
 * y menú elevado con ítems de 48 px. Sigue el patrón WAI-ARIA "select-only combobox" (el foco queda en el campo y
 * `aria-activedescendant` marca la opción resaltada). Con puntero táctil usa el `<select>` nativo del sistema.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  required = false,
  variant = 'filled',
  className = '',
  native,
}: Props) {
  const coarse = useMediaQuery(TOUCH, true) // sin matchMedia (pruebas) se usa el nativo
  const useNative = native ?? coarse
  return useNative ? (
    <NativeSelect
      {...{ label, value, options, onChange, disabled, required, variant, className }}
    />
  ) : (
    <CustomSelect {...{ label, value, options, onChange, disabled, required, variant, className }} />
  )
}

type Inner = Omit<Props, 'native'> & { variant: 'filled' | 'pill'; className: string }

function NativeSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  required,
  variant,
  className,
}: Inner) {
  const select = (
    <select
      className={styles.native}
      value={value}
      disabled={disabled}
      required={required}
      aria-label={variant === 'pill' ? label : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
  if (variant === 'pill') return <span className={`${styles.pillNative} ${className}`}>{select}</span>
  return (
    <label className={`${styles.nativeField} ${className}`}>
      <span className={styles.nativeLabel}>{label}</span>
      {select}
    </label>
  )
}

function CustomSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  variant,
  className,
}: Inner) {
  const uid = useId()
  const labelId = `${uid}-l`
  const listId = `${uid}-list`
  const optId = (i: number) => `${uid}-o${i}`
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<Pos | null>(null)
  const typed = useRef({ text: '', at: 0 })

  const selected = useMemo(() => options.findIndex((o) => o.value === value), [options, value])
  const current = options[selected]

  const place = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const want = Math.min(MENU_MAX, options.length * ROW + 16)
    const up = below < want && above > below
    setPos({
      left: r.left,
      width: Math.max(r.width, 112),
      ...(up ? { bottom: window.innerHeight - r.top } : { top: r.bottom }),
      maxHeight: Math.min(MENU_MAX, up ? above : below),
      up,
    })
  }, [options.length])

  const openMenu = () => {
    if (disabled) return
    setActive(selected >= 0 ? selected : firstEnabled(options, 0, 1))
    place()
    setOpen(true)
  }
  const close = useCallback(() => setOpen(false), [])
  const choose = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close()
  }

  // Cierra al pulsar fuera; si algo se desplaza o la ventana cambia de tamaño, el menú sigue pegado al campo
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) close()
    }
    const onMove = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) place()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close, place])

  // La opción resaltada siempre queda a la vista
  useLayoutEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => firstEnabled(options, Math.min(a + 1, last), 1, a))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => firstEnabled(options, Math.max(a - 1, 0), -1, a))
        break
      case 'Home':
        e.preventDefault()
        setActive(firstEnabled(options, 0, 1))
        break
      case 'End':
        e.preventDefault()
        setActive(firstEnabled(options, last, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        // solo cierra el menú: el diálogo que lo contenga no debe cerrarse con la misma tecla
        e.preventDefault()
        e.stopPropagation()
        close()
        break
      case 'Tab':
        close()
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // escribir letras salta a la opción que empieza así (como un selector nativo)
          const now = Date.now()
          const t = typed.current
          t.text = now - t.at > 500 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
          t.at = now
          const from = t.text.length === 1 ? active + 1 : active
          const order = [...options.keys()].map((_, k) => (from + k) % options.length)
          const hit = order.find(
            (i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(t.text),
          )
          if (hit !== undefined) setActive(hit)
        }
    }
  }

  const container =
    typeof document === 'undefined'
      ? null
      : (trigger.current?.closest('[role="dialog"],[role="alertdialog"]') ?? document.body)

  return (
    <div
      className={`${styles.root} ${variant === 'pill' ? styles.pillRoot : styles.filledRoot} ${className}`}
      data-open={open || undefined}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className={variant === 'pill' ? styles.pill : styles.field}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-labelledby={variant === 'pill' ? undefined : labelId}
        aria-label={variant === 'pill' ? label : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={close /* el menú no roba el foco (mousedown se cancela), así que perder el foco = salir del campo */}
      >
        {variant === 'filled' && (
          <span id={labelId} className={styles.label}>
            {label}
          </span>
        )}
        <span className={styles.value}>{current?.label ?? ''}</span>
        <ChevronDownIcon className={styles.arrow} width={24} height={24} />
      </button>
      {variant === 'filled' && <span className={styles.line} aria-hidden="true" />}

      {open &&
        pos &&
        container &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            className={`${styles.menu} ${pos.up ? styles.up : ''}`}
            style={{
              left: pos.left,
              minWidth: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            onMouseDown={(e) => e.preventDefault() /* el foco se queda en el campo */}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={i === selected}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                className={styles.option}
                onMouseMove={() => !o.disabled && i !== active && setActive(i)}
                onClick={() => choose(i)}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          container,
        )}
    </div>
  )
}

/** Primera opción habilitada desde `from` en la dirección `dir`; si no hay, `fallback`. */
function firstEnabled(options: SelectOption[], from: number, dir: 1 | -1, fallback = from): number {
  for (let i = from; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i
  return fallback
}
