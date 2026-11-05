/** Acciones de formato de la barra del editor. Todas operan sobre texto Markdown plano. */
export type FormatKind =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'heading'
  | 'ul'
  | 'ol'
  | 'task'
  | 'quote'
  | 'link'
  | 'rule'

export interface Edit {
  value: string
  start: number
  end: number
}

const WRAP: Partial<Record<FormatKind, [string, string]>> = {
  bold: ['**', '**'],
  italic: ['_', '_'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
}

const PREFIX: Partial<Record<FormatKind, string>> = {
  heading: '## ',
  ul: '- ',
  ol: '1. ',
  task: '- [ ] ',
  quote: '> ',
}

const ANY_PREFIX = /^(#{1,6} |[-*] \[[ xX]\] |[-*] |\d+\. |> )/

/** Aplica `kind` a la selección [start, end) y devuelve el nuevo texto y la nueva selección. */
export function applyFormat(kind: FormatKind, value: string, start: number, end: number): Edit {
  const wrap = WRAP[kind]
  if (wrap) {
    const [open, close] = wrap
    const sel = value.slice(start, end)
    // ya envuelto por fuera ("**|texto|**") o por dentro ("|**texto**|"): se quita
    if (
      value.slice(start - open.length, start) === open &&
      value.slice(end, end + close.length) === close
    ) {
      return {
        value: value.slice(0, start - open.length) + sel + value.slice(end + close.length),
        start: start - open.length,
        end: end - open.length,
      }
    }
    if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
      const inner = sel.slice(open.length, sel.length - close.length)
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        start,
        end: start + inner.length,
      }
    }
    const text = sel || ''
    const out = value.slice(0, start) + open + text + close + value.slice(end)
    return { value: out, start: start + open.length, end: start + open.length + text.length }
  }

  if (kind === 'link') {
    const sel = value.slice(start, end) || 'texto'
    const url = 'https://'
    const out = `${value.slice(0, start)}[${sel}](${url})${value.slice(end)}`
    const urlStart = start + sel.length + 3
    return { value: out, start: urlStart, end: urlStart + url.length }
  }

  if (kind === 'rule') {
    const before = value.slice(0, end)
    const lead =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const ins = `${lead}---\n`
    const out = before + ins + value.slice(end)
    return { value: out, start: before.length + ins.length, end: before.length + ins.length }
  }

  // Formatos de línea: afectan a todas las líneas tocadas por la selección
  const prefix = PREFIX[kind]!
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const nl = value.indexOf('\n', end)
  const lineEnd = nl === -1 ? value.length : nl
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const allHave = lines.every((l) => l.startsWith(prefix))
  const next = lines.map((l) => {
    if (allHave) return l.slice(prefix.length)
    return prefix + l.replace(ANY_PREFIX, '')
  })
  const joined = next.join('\n')
  const out = value.slice(0, lineStart) + joined + value.slice(lineEnd)
  const stop = lineStart + joined.length
  // Sin selección: el cursor queda al final de la línea para seguir escribiendo
  return start === end
    ? { value: out, start: stop, end: stop }
    : { value: out, start: lineStart, end: stop }
}
