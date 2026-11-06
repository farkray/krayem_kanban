import { render, screen } from '@testing-library/react'
import { Markdown } from './Markdown'

describe('Markdown: imágenes', () => {
  it('una imagen propia desconocida muestra un aviso, no una imagen rota', () => {
    render(<Markdown source="![x](attachment:no-existe)" />)
    expect(screen.getByText('Imagen no disponible')).toBeInTheDocument()
  })

  it('no carga imágenes externas', () => {
    const { container } = render(<Markdown source="![x](https://example.com/a.png)" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('renderiza listas de tareas y negritas', () => {
    const { container } = render(<Markdown source={'**hola**\n\n- [x] hecho\n- [ ] falta'} />)
    expect(container.querySelector('strong')?.textContent).toBe('hola')
    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(2)
  })
})
