import { useEffect, useRef, useState } from 'react'
import { relativeTime } from '../lib/format'
import { type Note } from '../lib/types'
import { useNotes } from '../store/hooks'
import { useStore } from '../store/store'
import { CloseIcon, EditIcon, PinIcon, TrashIcon } from './Icons'
import { Markdown } from './Markdown'
import { NoteEditor } from './NoteEditor'
import styles from './NotesPanel.module.css'

interface Props {
  /** Tablero dueño de las notas (en un subtablero, el tablero de origen). */
  boardId: string
  canEdit: boolean
  onClose: () => void
}

/** Resumen en texto plano de una nota (para su nombre accesible). */
function snippetOf(md: string) {
  const plain = md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>\-[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain
}

/** Una nota en edición: guarda sola mientras escribes; "Listo" (o Escape) vuelve a la tarjeta. */
function EditingNote({ note, onFinish }: { note: Note; onFinish: () => void }) {
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const latest = useRef(note.bodyMd)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    updateNote(note.id, latest.current)
  }
  // Si el panel se cierra con la nota abierta, lo escrito no se pierde
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        updateNote(note.id, latest.current)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note.id],
  )

  const finish = () => {
    flush()
    if (!latest.current.trim()) deleteNote(note.id, true) // una nota vacía no se conserva
    onFinish()
  }

  return (
    <div className={styles.editing}>
      <NoteEditor
        initial={note.bodyMd}
        onChange={(md) => {
          latest.current = md
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, 350)
        }}
        onDone={finish}
      />
      <div className={styles.editFoot}>
        <span className={styles.hint}>Se guarda sola · Esc o Listo para volver</span>
        <button type="button" className={styles.primary} onClick={finish}>
          Listo
        </button>
      </div>
    </div>
  )
}

function NoteCard({ note, canEdit, onEdit }: { note: Note; canEdit: boolean; onEdit: () => void }) {
  const togglePin = useStore((s) => s.togglePinNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const pinned = !!note.pinned

  return (
    <article
      className={`${styles.card} ${pinned ? styles.cardPinned : ''}`}
      aria-label={`Nota${pinned ? ' fijada' : ''}: ${snippetOf(note.bodyMd)}`}
    >
      {/* Doble clic = editar; los enlaces dentro de la nota siguen siendo clicables */}
      <div className={styles.content} onDoubleClick={() => canEdit && onEdit()}>
        <Markdown source={note.bodyMd} />
      </div>
      <footer className={styles.cardFoot}>
        <span className={styles.meta}>{relativeTime(note.updatedAt)}</span>
        {canEdit && (
          <span className={styles.actions}>
            <button
              type="button"
              className={`${styles.iconBtn} ${pinned ? styles.iconOn : ''}`}
              aria-pressed={pinned}
              aria-label={pinned ? 'Quitar de fijadas' : 'Fijar nota'}
              title={pinned ? 'Quitar de fijadas' : 'Fijar arriba'}
              onClick={() => togglePin(note.id)}
            >
              <PinIcon width={16} height={16} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Editar nota"
              title="Editar"
              onClick={onEdit}
            >
              <EditIcon width={16} height={16} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Eliminar nota"
              title="Eliminar (puedes deshacer)"
              onClick={() => deleteNote(note.id)}
            >
              <TrashIcon width={16} height={16} />
            </button>
          </span>
        )}
      </footer>
    </article>
  )
}

/**
 * Panel lateral de notas del tablero, al estilo de Google Keep: cada nota es una tarjeta;
 * las fijadas van arriba (en el orden en que se fijaron); se edita en el sitio y se vuelve a las tarjetas.
 */
export function NotesPanel({ boardId, canEdit, onClose }: Props) {
  const { pinned, others } = useNotes(boardId)
  const addNote = useStore((s) => s.addNote)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Las notas vacías (que nadie escribió) no se muestran, salvo la que se está editando
  const visible = (list: Note[]) => list.filter((n) => n.bodyMd.trim() || n.id === editingId)
  const pinnedNotes = visible(pinned)
  const otherNotes = visible(others)
  const none = pinnedNotes.length + otherNotes.length === 0

  const create = () => {
    const id = addNote(boardId)
    if (id) setEditingId(id)
  }

  const renderNote = (n: Note) => (
    <li key={n.id}>
      {n.id === editingId ? (
        <EditingNote note={n} onFinish={() => setEditingId(null)} />
      ) : (
        <NoteCard note={n} canEdit={canEdit} onEdit={() => setEditingId(n.id)} />
      )}
    </li>
  )

  return (
    <aside id="board-notes" className={styles.panel} aria-label="Notas del tablero">
      <header className={styles.head}>
        <h2 className={styles.title}>Notas del tablero</h2>
        <button type="button" className={styles.close} aria-label="Cerrar notas" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </button>
      </header>

      {canEdit && !editingId && (
        <button type="button" className={styles.composer} onClick={create}>
          Tomar una nota…
        </button>
      )}

      {none && !editingId && (
        <p className={styles.empty}>
          {canEdit
            ? 'Aún no hay notas. Guarda aquí enlaces (por ejemplo, la carpeta de Google Drive), acuerdos o lo que el equipo necesite.'
            : 'Aún no hay notas en este tablero.'}
        </p>
      )}

      {pinnedNotes.length > 0 && (
        <section aria-labelledby="notes-pinned">
          <h3 id="notes-pinned" className={styles.section}>
            Fijadas
          </h3>
          <ul className={styles.list}>{pinnedNotes.map(renderNote)}</ul>
        </section>
      )}

      {otherNotes.length > 0 && (
        <section aria-labelledby="notes-others">
          {pinnedNotes.length > 0 ? (
            <h3 id="notes-others" className={styles.section}>
              Otras
            </h3>
          ) : (
            <h3 id="notes-others" className={styles.sr}>
              Notas
            </h3>
          )}
          <ul className={styles.list}>{otherNotes.map(renderNote)}</ul>
        </section>
      )}
    </aside>
  )
}
