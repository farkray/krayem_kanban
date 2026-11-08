import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  BOARD_COLORS,
  BOARD_COLOR_NAMES,
  BOARD_ICONS,
  BOARD_ICON_NAMES,
  DEFAULT_BOARD_COLOR,
  DEFAULT_BOARD_ICON,
  boardColorOf,
  boardIconOf,
  type Board,
} from '../lib/types'
import { useStore } from '../store/store'
import { BoardGlyph, BoardTile } from './BoardTile'
import { CheckIcon } from './Icons'
import styles from './BoardAppearance.module.css'

interface GridProps<T extends string> {
  label: string
  values: readonly T[]
  names: Record<T, string>
  current: T
  onPick: (v: T) => void
  render: (v: T, selected: boolean) => React.ReactNode
  className: string
}

/** Grupo de opciones tipo radio: una sola parada de Tab y flechas para moverse (y elegir). */
function RadioGrid<T extends string>({
  label,
  values,
  names,
  current,
  onPick,
  render,
  className,
}: GridProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (e: KeyboardEvent, index: number) => {
    const last = values.length - 1
    let next = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else return
    e.preventDefault()
    onPick(values[next])
    refs.current[next]?.focus()
  }
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {values.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={v === current}
          aria-label={names[v]}
          title={names[v]}
          tabIndex={v === current ? 0 : -1}
          className={v === current ? `${styles.opt} ${styles.on}` : styles.opt}
          onClick={() => onPick(v)}
          onKeyDown={(e) => move(e, i)}
        >
          {render(v, v === current)}
        </button>
      ))}
    </div>
  )
}

/**
 * Cuadro del tablero en su encabezado. El dueño lo pulsa para elegir color e icono; para los demás
 * es solo la imagen del tablero (no pueden escribirlo).
 */
export function BoardAppearance({
  board,
  editable,
  className,
}: {
  board: Board
  editable: boolean
  className: string
}) {
  const setLook = useStore((s) => s.setBoardAppearance)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const color = boardColorOf(board)
  const icon = boardIconOf(board)

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  if (!editable)
    return <BoardTile className={className} color={board.color} icon={board.icon} size={22} />

  const vars = {
    '--tile-from': `var(--board-${color})`,
    '--tile-to': `var(--board-${color}-deep)`,
  } as CSSProperties
  const isDefault = color === DEFAULT_BOARD_COLOR && icon === DEFAULT_BOARD_ICON

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className={styles.trigger}
        aria-label="Cambiar color e icono del tablero"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <BoardTile className={className} color={board.color} icon={board.icon} size={22} />
      </button>
      {open && (
        <div
          id={id}
          className={styles.panel}
          role="group"
          aria-label="Aspecto del tablero"
          style={vars}
        >
          <p className={styles.head}>
            <span className={styles.title}>Color</span>
            <span className={styles.name}>{BOARD_COLOR_NAMES[color]}</span>
          </p>
          <RadioGrid
            label="Color"
            className={styles.grid}
            values={BOARD_COLORS}
            names={BOARD_COLOR_NAMES}
            current={color}
            onPick={(c) => setLook(board.id, { color: c })}
            render={(c, on) => (
              <span
                className={styles.swatch}
                style={{
                  background: `linear-gradient(180deg, var(--board-${c}), var(--board-${c}-deep))`,
                }}
              >
                {on && <CheckIcon width={16} height={16} />}
              </span>
            )}
          />
          <p className={styles.head}>
            <span className={styles.title}>Icono</span>
            <span className={styles.name}>{BOARD_ICON_NAMES[icon]}</span>
          </p>
          <RadioGrid
            label="Icono"
            className={styles.grid}
            values={BOARD_ICONS}
            names={BOARD_ICON_NAMES}
            current={icon}
            onPick={(i) => setLook(board.id, { icon: i })}
            render={(i) => (
              <span className={styles.glyph}>
                <BoardGlyph name={i} size={20} />
              </span>
            )}
          />
          <button
            type="button"
            className={styles.reset}
            disabled={isDefault}
            onClick={() =>
              setLook(board.id, { color: DEFAULT_BOARD_COLOR, icon: DEFAULT_BOARD_ICON })
            }
          >
            Restablecer
          </button>
        </div>
      )}
    </div>
  )
}
