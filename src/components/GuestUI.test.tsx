import { render, screen } from '@testing-library/react'
import { HomeView } from './HomeView'
import { Sidebar } from './Sidebar'

describe('invitado: sin crear tableros', () => {
  it('la portada no ofrece "Nuevo tablero" y explica cómo llegan los tableros', () => {
    render(<HomeView boards={[]} onOpen={() => {}} onCreate={() => {}} canCreate={false} />)
    expect(screen.queryByRole('button', { name: /Nuevo tablero/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Aún no te han compartido ningún tablero/)).toBeInTheDocument()
  })

  it('la barra lateral no tiene el botón "+"', () => {
    render(
      <Sidebar
        boards={[]}
        activeId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        canCreate={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Nuevo tablero' })).not.toBeInTheDocument()
  })

  it('con cuenta normal sí se puede crear', () => {
    render(<HomeView boards={[]} onOpen={() => {}} onCreate={() => {}} />)
    expect(screen.getByRole('button', { name: /Nuevo tablero/ })).toBeInTheDocument()
  })
})
