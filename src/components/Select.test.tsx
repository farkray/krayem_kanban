import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Select } from './Select'

const options = [
  { value: 'a', label: 'Manzana' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cereza', disabled: true },
  { value: 'd', label: 'Durazno' },
]

function Harness({ onChange = () => {}, native }: { onChange?: (v: string) => void; native?: boolean }) {
  const [v, setV] = useState('a')
  return (
    <Select
      label="Fruta"
      value={v}
      options={options}
      native={native}
      onChange={(x) => {
        setV(x)
        onChange(x)
      }}
    />
  )
}

describe('Select (selector propio estilo Material)', () => {
  it('expone el patrón combobox + listbox y muestra el valor y la etiqueta', async () => {
    render(<Harness native={false} />)
    const box = screen.getByRole('combobox', { name: 'Fruta' })
    expect(box).toHaveTextContent('Manzana')
    expect(box).toHaveAttribute('aria-haspopup', 'listbox')
    expect(box).toHaveAttribute('aria-expanded', 'false')
    await userEvent.setup().click(box)
    expect(box).toHaveAttribute('aria-expanded', 'true')
    const opts = screen.getAllByRole('option')
    expect(opts.map((o) => o.textContent)).toEqual(['Manzana', 'Banana', 'Cereza', 'Durazno'])
    expect(opts[0]).toHaveAttribute('aria-selected', 'true')
    expect(opts[2]).toHaveAttribute('aria-disabled', 'true')
    expect(box.getAttribute('aria-activedescendant')).toBe(opts[0].id)
  })

  it('con el mouse: elegir una opción cambia el valor y cierra', async () => {
    const onChange = vi.fn()
    render(<Harness native={false} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Fruta' }))
    await user.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fruta' })).toHaveTextContent('Banana')
  })

  it('con teclado: flechas saltan las deshabilitadas, Enter elige, Esc cierra sin cambiar', async () => {
    const onChange = vi.fn()
    render(<Harness native={false} onChange={onChange} />)
    const user = userEvent.setup()
    screen.getByRole('combobox', { name: 'Fruta' }).focus()
    await user.keyboard('{ArrowDown}') // abre
    await user.keyboard('{ArrowDown}{ArrowDown}') // Banana → (salta Cereza) → Durazno
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('d')
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('Inicio y Fin, y escribir letras salta a la opción que empieza así', async () => {
    const onChange = vi.fn()
    render(<Harness native={false} onChange={onChange} />)
    const user = userEvent.setup()
    const box = screen.getByRole('combobox', { name: 'Fruta' })
    box.focus()
    await user.keyboard('{Enter}{End}')
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Durazno' }).id)
    await user.keyboard('{Home}')
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Manzana' }).id)
    await user.keyboard('b')
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Banana' }).id)
  })

  it('Esc dentro de un diálogo solo cierra el menú', async () => {
    const onClose = vi.fn()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    render(<Harness native={false} />)
    const user = userEvent.setup()
    screen.getByRole('combobox', { name: 'Fruta' }).focus()
    await user.keyboard('{Enter}{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    document.removeEventListener('keydown', onKey)
  })

  it('pulsar fuera cierra el menú', async () => {
    render(
      <div>
        <Harness native={false} />
        <button type="button">Fuera</button>
      </div>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Fruta' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fuera' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('con puntero táctil (o sin matchMedia) usa el <select> nativo con la misma etiqueta', async () => {
    const onChange = vi.fn()
    render(<Harness native onChange={onChange} />)
    const select = screen.getByLabelText('Fruta')
    expect(select.tagName).toBe('SELECT')
    await userEvent.setup().selectOptions(select, 'Durazno')
    expect(onChange).toHaveBeenCalledWith('d')
  })
})
