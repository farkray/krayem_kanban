import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MentionContext, MentionText } from './Mention'
import { MentionInput } from './MentionInput'
import { Markdown } from './Markdown'

const people = [
  { userId: 'u1', name: 'Jorge Menéndez' },
  { userId: 'u2', name: 'Ana López' },
]

describe('menciones en el texto', () => {
  it('Markdown dibuja la mención como chip con el nombre actual, no como enlace', () => {
    render(
      <MentionContext.Provider value={{ people, me: 'u2' }}>
        <Markdown source="hola [@Jorge viejo](mention:u1) y [@Ana](mention:u2)" />
      </MentionContext.Provider>,
    )
    expect(screen.getByText('@Jorge Menéndez')).toBeInTheDocument() // alias vigente
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByTitle('Te mencionan')).toHaveTextContent('@Ana López') // la mía
  })

  it('un enlace normal sigue siendo enlace', () => {
    render(<Markdown source="[docs](https://example.com)" />)
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('MentionText dibuja chips dentro de texto plano (ítems de la lista)', () => {
    render(
      <MentionContext.Provider value={{ people, me: null }}>
        <MentionText text="revisar con [@Jorge](mention:u1) mañana" />
      </MentionContext.Provider>,
    )
    expect(screen.getByText('@Jorge Menéndez')).toBeInTheDocument()
    expect(screen.getByText(/revisar con/)).toBeInTheDocument()
  })
})

function Harness({ onKey }: { onKey?: (e: { key: string }) => void }) {
  const [v, setV] = useState('')
  return <MentionInput value={v} onChange={setV} people={people} label="Ítem" onKeyDown={onKey} />
}

describe('MentionInput', () => {
  it('al escribir "@" ofrece personas; se elige con el teclado y no envía el campo', async () => {
    const onKey = vi.fn()
    const user = userEvent.setup()
    render(<Harness onKey={onKey} />)
    const input = screen.getByRole('combobox', { name: 'Ítem' })
    await user.type(input, 'hola @jor')
    const list = await screen.findByRole('listbox', { name: 'Mencionar a' })
    expect(list).toHaveTextContent('Jorge Menéndez')
    expect(list).not.toHaveTextContent('Ana López')
    await user.keyboard('{Enter}')
    expect(input).toHaveValue('hola @Jorge Menéndez ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    // Enter eligió a la persona: el campo (que enviaría con Enter) no lo recibió
    expect(onKey.mock.calls.some(([e]) => e.key === 'Enter')).toBe(false)
  })

  it('se elige con el mouse y Escape cierra el menú', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Ítem' })
    await user.type(input, '@')
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.type(input, 'a')
    await user.click(await screen.findByRole('option', { name: /Ana López/ }))
    expect(input).toHaveValue('@Ana López ')
  })

  it('un correo (x@y) no abre el menú', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('combobox', { name: 'Ítem' }), 'a@jor')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
