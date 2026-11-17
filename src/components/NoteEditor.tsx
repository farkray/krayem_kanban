import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown as MarkdownExt } from '@tiptap/markdown'
import { CodeIcon, LinkIcon, ListIcon, OrderedListIcon, TaskListIcon } from './Icons'
import mdStyles from './Markdown.module.css'
import styles from './NoteEditor.module.css'

interface Props {
  initial: string
  /** Se llama con el Markdown cada vez que cambia el texto. */
  onChange: (markdown: string) => void
  /** Ctrl/Cmd+Enter o Escape: el usuario terminó de editar. */
  onDone: () => void
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = mac ? '⌘' : 'Ctrl+'

/**
 * Editor de una nota: texto con formato que se ve ya aplicado y responde a los atajos de teclado
 * (Ctrl/Cmd+B negrita, +I cursiva, +K enlace, +Shift+S tachado, +Shift+8 viñetas…). Guarda Markdown.
 */
export function NoteEditor({ initial, onChange, onDone }: Props) {
  const doneRef = useRef(onDone)
  const changeRef = useRef(onChange)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('https://')

  useEffect(() => {
    doneRef.current = onDone
    changeRef.current = onChange
  })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [2, 3] } }),
      MarkdownExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Escribe una nota…' }),
    ],
    content: initial,
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Nota',
        class: styles.content,
      },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          doneRef.current()
          return true
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          setLinkOpen(true)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => changeRef.current(ed.getMarkdown()),
  })

  // Al abrir la nota el cursor queda listo para escribir (sin tener que hacer clic otra vez)
  useEffect(() => {
    editor?.commands.focus('end')
  }, [editor])

  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      strike: !!ed?.isActive('strike'),
      ul: !!ed?.isActive('bulletList'),
      ol: !!ed?.isActive('orderedList'),
      task: !!ed?.isActive('taskList'),
      code: !!ed?.isActive('code'),
      link: !!ed?.isActive('link'),
    }),
  })

  if (!editor) return null
  const chain = () => editor.chain().focus()

  const tools = [
    {
      label: 'Negrita',
      hint: `${MOD}B`,
      on: on.bold,
      icon: <b className={styles.glyph}>B</b>,
      run: () => chain().toggleBold().run(),
    },
    {
      label: 'Cursiva',
      hint: `${MOD}I`,
      on: on.italic,
      icon: <i className={styles.glyph}>I</i>,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: 'Tachado',
      hint: `${MOD}Shift+S`,
      on: on.strike,
      icon: <s className={styles.glyph}>S</s>,
      run: () => chain().toggleStrike().run(),
    },
    {
      label: 'Lista con viñetas',
      hint: `${MOD}Shift+8`,
      on: on.ul,
      icon: <ListIcon width={16} height={16} />,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: 'Lista numerada',
      hint: `${MOD}Shift+7`,
      on: on.ol,
      icon: <OrderedListIcon width={16} height={16} />,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: 'Lista de tareas',
      hint: `${MOD}Shift+9`,
      on: on.task,
      icon: <TaskListIcon width={16} height={16} />,
      run: () => chain().toggleTaskList().run(),
    },
    {
      label: 'Código',
      hint: `${MOD}E`,
      on: on.code,
      icon: <CodeIcon width={16} height={16} />,
      run: () => chain().toggleCode().run(),
    },
    {
      label: 'Enlace',
      hint: `${MOD}K`,
      on: on.link,
      icon: <LinkIcon width={16} height={16} />,
      run: () => (on.link ? chain().unsetLink().run() : setLinkOpen(true)),
    },
  ]

  const applyLink = () => {
    const href = url.trim()
    if (!/^(https?:\/\/|mailto:)\S+$/i.test(href) || href === 'https://') return
    if (editor.state.selection.empty) {
      chain()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    } else {
      chain().setLink({ href }).run()
    }
    setLinkOpen(false)
    setUrl('https://')
  }

  return (
    <div className={styles.box}>
      <div className={styles.bar} role="toolbar" aria-label="Formato de la nota">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            className={t.on ? styles.toolOn : styles.tool}
            aria-label={t.label}
            aria-pressed={t.on}
            title={`${t.label} (${t.hint})`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            {t.icon}
          </button>
        ))}
      </div>
      {linkOpen && (
        <div className={styles.linkBar}>
          <input
            type="url"
            value={url}
            aria-label="Dirección del enlace"
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setLinkOpen(false)
                editor.commands.focus()
              }
            }}
          />
          <button type="button" className={styles.linkBtn} onClick={applyLink}>
            Aplicar
          </button>
        </div>
      )}
      <div className={`${mdStyles.md} ${styles.surface}`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
