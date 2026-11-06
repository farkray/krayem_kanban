import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { MENTION_SCHEME } from '../lib/mentions'
import { ATTACHMENT_SCHEME, AttachmentImage } from './AttachmentImage'
import { MentionChip } from './Mention'
import styles from './Markdown.module.css'

// Además de http(s), se admiten las imágenes propias de la tarjeta: ![x](attachment:ID)
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'attachment'],
    href: [...(defaultSchema.protocols?.href ?? []), 'mention'],
  },
}

/** Markdown seguro: sin HTML crudo (sanitizado) y enlaces que abren en pestaña nueva. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={(url) =>
          url.startsWith(ATTACHMENT_SCHEME) || url.startsWith(MENTION_SCHEME)
            ? url
            : defaultUrlTransform(url)
        }
        components={{
          a: ({ node: _node, children, ...props }) =>
            props.href?.startsWith(MENTION_SCHEME) ? (
              <MentionChip
                id={props.href.slice(MENTION_SCHEME.length)}
                label={String(children).replace(/^@/, '')}
              />
            ) : (
              <a {...props} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
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
