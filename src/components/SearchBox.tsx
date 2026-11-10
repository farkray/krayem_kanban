import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchAll, type SearchResult } from '../lib/search'
import { useMediaQuery, WIDE_QUERY } from '../lib/useMediaQuery'
import { useStore } from '../store/store'
import { SearchIcon } from './Icons'
import styles from './SearchBox.module.css'

const LABEL: Record<SearchResult['type'], string> = {
  board: 'Tablero',
  column: 'Columna',
  card: 'Tarjeta',
  item: 'Ítem',
  comment: 'Comentario',
}

interface Props {
  onPick: (r: SearchResult) => void
}

export function SearchBox({ onPick }: Props) {
  const boards = useStore((s) => s.boards)
  const columns = useStore((s) => s.columns)
  const cards = useStore((s) => s.cards)
  const labels = useStore((s) => s.labels)
  const items = useStore((s) => s.items)
  const comments = useStore((s) => s.comments)

  // El texto largo no cabe por debajo del ancho de escritorio (tabletas incluidas)
  const compact = !useMediaQuery(WIDE_QUERY, true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () =>
      searchAll(
        { boards, labels, columns, cards, attachments: [], items, comments, likes: [] },
        query,
      ),
    [boards, labels, columns, cards, items, comments, query],
  )

  // Atajos: "/" y Cmd/Ctrl+K enfocan la búsqueda.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing =
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const pick = (r: SearchResult) => {
    onPick(r)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault()
      pick(results[cursor])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div className={styles.wrap}>
      <label className={styles.box}>
        <SearchIcon width={16} height={16} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
          className={styles.input}
          placeholder={compact ? 'Buscar' : 'Buscar tableros, columnas y tarjetas'}
          aria-label="Buscar"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </label>
      {showPanel &&
        (results.length === 0 ? (
          <p id="search-results" className={styles.none} role="status">
            Sin resultados para “{query.trim()}”
          </p>
        ) : (
          <ul id="search-results" role="listbox" aria-label="Resultados" className={styles.panel}>
            {results.map((r, i) => (
              <li
                key={r.key}
                role="option"
                aria-selected={i === cursor}
                className={`${styles.result} ${i === cursor ? styles.active : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
              >
                <span className={styles.tag}>{LABEL[r.type]}</span>
                <span className={styles.rTitle}>{r.title}</span>
                <span className={styles.rContext}>{r.context}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
