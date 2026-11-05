import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { resetStore } from '../store/store'

type User = ReturnType<typeof userEvent.setup>

async function setup() {
  window.history.replaceState(null, '', '/')
  await resetStore()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Mis tableros' })
  await user.click(screen.getAllByRole('button', { name: /Mi tablero/ })[0])
  await screen.findByRole('heading', { level: 1, name: 'Mi tablero' })
  return user
}

async function addCard(user: User, title: string) {
  const col = screen.getByRole('region', { name: 'Por hacer' })
  await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
  await user.type(within(col).getByLabelText('Título de la tarjeta'), `${title}{Enter}{Escape}`)
}

const openCard = async (user: User, title: string) => {
  await user.click(screen.getByText(title))
  return screen.findByRole('dialog', { name: 'Detalle de la tarjeta' })
}

async function createLabel(user: User, dialog: HTMLElement, name: string, color: string) {
  await user.click(within(dialog).getByRole('button', { name: /Agregar etiqueta|\+ Etiqueta/ }))
  const form = within(dialog).getByRole('form', { name: 'Nueva etiqueta' })
  await user.type(within(form).getByLabelText('Nombre de la etiqueta'), name)
  await user.click(within(form).getByRole('radio', { name: color }))
  await user.click(within(form).getByRole('button', { name: 'Crear etiqueta' }))
}

describe('etiquetas', () => {
  it('crea "Coppel" en azul desde el detalle y queda puesta en la tarjeta', async () => {
    const user = await setup()
    await addCard(user, 'Banner')
    const dialog = await openCard(user, 'Banner')
    await createLabel(user, dialog, 'Coppel', 'Azul')

    const chip = within(dialog).getAllByText('Coppel')[0].closest('[data-color]')
    expect(chip).toHaveAttribute('data-color', 'blue')

    await user.keyboard('{Escape}')
    const card = screen.getByText('Banner').closest('article')!
    expect(within(card).getByText('Coppel').closest('[data-color]')).toHaveAttribute(
      'data-color',
      'blue',
    )
  })

  it('reutiliza una etiqueta en otra tarjeta y la quita con la ×', async () => {
    const user = await setup()
    await addCard(user, 'Uno')
    await addCard(user, 'Dos')
    let dialog = await openCard(user, 'Uno')
    await createLabel(user, dialog, 'Coppel', 'Azul')
    await user.keyboard('{Escape}')

    dialog = await openCard(user, 'Dos')
    await user.click(within(dialog).getByRole('button', { name: /Agregar etiqueta/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Etiqueta Coppel' }))
    expect(
      within(dialog).getByRole('button', { name: 'Quitar etiqueta Coppel' }),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Quitar etiqueta Coppel' }))
    expect(
      within(dialog).queryByRole('button', { name: 'Quitar etiqueta Coppel' }),
    ).not.toBeInTheDocument()
  })

  it('valida nombre vacío y duplicado', async () => {
    const user = await setup()
    await addCard(user, 'Tarjeta')
    const dialog = await openCard(user, 'Tarjeta')
    await createLabel(user, dialog, 'Coppel', 'Azul')

    // tras crear, el panel sigue abierto mostrando la lista
    await user.click(within(dialog).getByRole('button', { name: '+ Crear etiqueta' }))
    const form = within(dialog).getByRole('form', { name: 'Nueva etiqueta' })
    await user.click(within(form).getByRole('button', { name: 'Crear etiqueta' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Escribe un nombre')
    await user.type(within(form).getByLabelText('Nombre de la etiqueta'), 'COPPEL')
    await user.click(within(form).getByRole('button', { name: 'Crear etiqueta' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Ya existe una etiqueta')
  })

  it('edita el color y elimina con deshacer', async () => {
    const user = await setup()
    await addCard(user, 'Tarjeta')
    const dialog = await openCard(user, 'Tarjeta')
    await createLabel(user, dialog, 'Coppel', 'Azul')
    await user.click(within(dialog).getByRole('button', { name: 'Editar etiqueta Coppel' }))
    const form = within(dialog).getByRole('form', { name: 'Editar etiqueta' })
    await user.click(within(form).getByRole('radio', { name: 'Rojo' }))
    await user.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(within(dialog).getAllByText('Coppel')[0].closest('[data-color]')).toHaveAttribute(
      'data-color',
      'red',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Editar etiqueta Coppel' }))
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar etiqueta' }))
    expect(within(dialog).queryByText('Coppel')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(dialog).getAllByText('Coppel').length).toBeGreaterThan(0)
  })

  it('filtra el tablero por etiqueta y muestra "1 de 2 tarjetas"', async () => {
    const user = await setup()
    await addCard(user, 'Con etiqueta')
    await addCard(user, 'Sin etiqueta')
    const dialog = await openCard(user, 'Con etiqueta')
    await createLabel(user, dialog, 'Coppel', 'Azul')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar solo Coppel' }))
    expect(screen.getByText('Con etiqueta')).toBeInTheDocument()
    expect(screen.queryByText('Sin etiqueta')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Por hacer' })).toHaveTextContent('1 de 2 tarjetas')
    expect(screen.getByRole('button', { name: 'Filtros, 1 activo' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Limpiar filtro' })[0])
    expect(screen.getByText('Sin etiqueta')).toBeInTheDocument()
  })

  it('sin etiquetas, el filtro explica cómo crearlas', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    expect(screen.getByText(/Aún no tienes etiquetas/)).toBeInTheDocument()
  })
})
