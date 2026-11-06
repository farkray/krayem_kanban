import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Editor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown as MarkdownExt } from '@tiptap/markdown'
import { compressImage } from '../lib/image/compress'
import { LIMITS } from '../lib/types'
import { useStore } from '../store/store'
import { AttachmentImage, attachmentSrc } from './AttachmentImage'
import {
  CodeIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  QuoteIcon,
  RuleIcon,
  TaskListIcon,
} from './Icons'
import mdStyles from './Markdown.module.css'
import styles from './RichEditor.module.css'

/** Imagen del documento: solo las propias (`attachment:ID`) y se dibuja con su archivo local. */
const InlineImage = Image.extend({
  parseHTML: () => [{ tag: 'img[src^="attachment:"]' }],
  addNodeView() {
    return ReactNodeViewRenderer(function View({ node }: NodeViewProps) {
      return (
        <NodeViewWrapper as="div" className={styles.imageNode} contentEditable={false}>
          <AttachmentImage src={String(node.attrs.src)} alt={String(node.attrs.alt ?? '')} />
        </NodeViewWrapper>
      )
    })
  },
})

const imagesIn = (files?: FileList | null) =>
  [...(files ?? [])].filter((f) => f.type.startsWith('image/'))

interface Props {
  /** Tarjeta a la que pertenecen las imágenes pegadas. */
  cardId: string
  initial?: string
  label: string
  placeholder?: string
  submitLabel: string
  onSubmit: (markdown: string) => boolean
  onCancel?: () => void
}

/**
 * Editor visual (WYSIWYG): lo que escribes se ve ya con formato. Guarda Markdown plano.
 * Se pueden pegar o soltar imágenes (se comprimen en el navegador igual que las de la tarjeta).
 */
export function RichEditor({
  cardId,
  initial = '',
  label,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [working, setWorking] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('https://')
  const editorRef = useRef<Editor | null>(null)
  const submitRef = useRef<() => void>(() => {})

  const addImages = async (files: File[]) => {
    for (const file of files) {
      setWorking((n) => n + 1)
      setError(null)
      try {
        const out = await compressImage(file)
        const id = useStore.getState().addAttachment(
          cardId,
          {
            name: file.name || 'captura',
            mime: out.mime,
            sizeOriginal: out.sizeOriginal,
            sizeCompressed: out.sizeCompressed,
            width: out.width,
            height: out.height,
            inline: true,
          },
          out.blob,
        )
        if (!id) throw new Error(`Máximo ${LIMITS.inlineImages} imágenes pegadas por tarjeta.`)
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: attachmentSrc(id), alt: file.name || 'captura' })
          .run()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen')
      } finally {
        setWorking((n) => n - 1)
      }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [2, 3] } }),
      MarkdownExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      InlineImage,
      Placeholder.configure({ placeholder }),
    ],
    content: initial,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: styles.content,
      },
      handlePaste: (_view, e) => {
        const imgs = imagesIn(e.clipboardData?.files)
        if (imgs.length === 0) return false
        e.preventDefault()
        void addImages(imgs)
        return true
      },
      handleDrop: (_view, e) => {
        const imgs = imagesIn(e.dataTransfer?.files)
        if (imgs.length === 0) return false
        e.preventDefault()
        void addImages(imgs)
        return true
      },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          submitRef.current()
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      empty: !ed || ed.getMarkdown().trim() === '',
      heading: !!ed?.isActive('heading'),
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      strike: !!ed?.isActive('strike'),
      ul: !!ed?.isActive('bulletList'),
      ol: !!ed?.isActive('orderedList'),
      task: !!ed?.isActive('taskList'),
      quote: !!ed?.isActive('blockquote'),
      code: !!ed?.isActive('code'),
      link: !!ed?.isActive('link'),
    }),
  })

  const submit = () => {
    if (!editor) return
    const md = editor.getMarkdown().trim()
    if (md === '') return
    if (md.length > LIMITS.comment) {
      setError(`El texto es demasiado largo (máximo ${LIMITS.comment} caracteres).`)
      return
    }
    if (onSubmit(md)) {
      editor.commands.clearContent(true)
      setError(null)
    }
  }
  useEffect(() => {
    submitRef.current = submit
  })

  if (!editor) return null
  const chain = () => editor.chain().focus()

  const tools: {
    label: string
    icon: ReactNode
    active: boolean
    run: () => void
    key?: string
  }[] = [
    {
      label: 'Título',
      icon: <span className={styles.glyph}>H</span>,
      active: on.heading,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Negrita',
      icon: <b className={styles.glyph}>B</b>,
      active: on.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      label: 'Cursiva',
      icon: <i className={styles.glyph}>I</i>,
      active: on.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: 'Tachado',
      icon: <s className={styles.glyph}>S</s>,
      active: on.strike,
      run: () => chain().toggleStrike().run(),
    },
    {
      label: 'Lista con viñetas',
      icon: <ListIcon width={16} height={16} />,
      active: on.ul,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: 'Lista numerada',
      icon: <OrderedListIcon width={16} height={16} />,
      active: on.ol,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: 'Lista de tareas',
      icon: <TaskListIcon width={16} height={16} />,
      active: on.task,
      run: () => chain().toggleTaskList().run(),
    },
    {
      label: 'Cita',
      icon: <QuoteIcon width={16} height={16} />,
      active: on.quote,
      run: () => chain().toggleBlockquote().run(),
    },
    {
      label: 'Código',
      icon: <CodeIcon width={16} height={16} />,
      active: on.code,
      run: () => chain().toggleCode().run(),
    },
    {
      label: 'Enlace',
      icon: <LinkIcon width={16} height={16} />,
      active: on.link,
      run: () => (on.link ? chain().unsetLink().run() : setLinkOpen(true)),
    },
    {
      label: 'Línea separadora',
      icon: <RuleIcon width={16} height={16} />,
      active: false,
      run: () => chain().setHorizontalRule().run(),
    },
  ]

  const applyLink = () => {
    const href = url.trim()
    if (/^(https?:\/\/|mailto:)\S+$/i.test(href) && href !== 'https://') {
      if (editor.state.selection.empty) {
        // sin texto seleccionado: se inserta la propia dirección como enlace
        chain()
          .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
          .run()
      } else {
        chain().setLink({ href }).run()
      }
      setLinkOpen(false)
      setUrl('https://')
    }
  }

  return (
    <div className={styles.box}>
      <div className={styles.bar} role="toolbar" aria-label="Formato del texto">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            className={t.active ? styles.toolOn : styles.tool}
            aria-label={t.label}
            aria-pressed={t.active}
            title={t.label}
            onMouseDown={(e) => e.preventDefault()} // no quitar el foco ni la selección del texto
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
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setLinkOpen(false)
              }
            }}
          />
          <button type="button" className={styles.linkBtn} onClick={applyLink}>
            Aplicar
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => setLinkOpen(false)}>
            Cancelar
          </button>
        </div>
      )}
      <div className={`${mdStyles.md} ${styles.surface}`}>
        <EditorContent editor={editor} />
      </div>
      {working > 0 && (
        <p className={styles.status} role="status">
          Comprimiendo imagen…
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.footer}>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={on.empty || working > 0}
          onClick={submit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
