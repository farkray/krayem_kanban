import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { ATTACHMENT_SCHEME, AttachmentImage } from './AttachmentImage'
import styles from './Markdown.module.css'

// Además de http(s), se admiten las imágenes propias de la tarjeta: ![x](attachment:ID)
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'attachment'],
  },
}

/** Markdown seguro: sin HTML crudo (sanitizado) y enlaces que abren en pestaña nueva. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={(url) => (url.startsWith(ATTACHMENT_SCHEME) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          img: ({ node: _node, src, alt }) =>
            typeof src === 'string' && src.startsWith(ATTACHMENT_SCHEME) ? (
              <AttachmentImage src={src} alt={alt} />
            ) : null, // imágenes externas: no se cargan (privacidad y CSP)
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
