import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { resetStore } from './store/store'

async function setup() {
  window.history.replaceState(null, '', '/')
  await resetStore()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Mis tableros' })
  return user
}

async function openFirstBoard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: /Mi tablero/ })[0])
  await screen.findByRole('heading', { level: 1, name: 'Mi tablero' })
}

describe('tableros', () => {
  it('primer uso: tablero inicial con 3 columnas y URL /b/:id', async () => {
    const user = await setup()
    await openFirstBoard(user)
    expect(window.location.pathname).toMatch(/^\/b\//)
    for (const name of ['Por hacer', 'En curso', 'Listo']) {
      expect(screen.getByRole('region', { name })).toHaveTextContent('0 tarjetas')
    }
    expect(screen.getByRole('button', { name: /Agregar columna/ })).toHaveTextContent(
      '3 de 5 columnas',
    )
  })

  it('crea un tablero desde la barra lateral y lo abre', async () => {
    const user = await setup()
    await user.click(screen.getAllByRole('button', { name: 'Nuevo tablero' })[0])
    await user.type(screen.getByLabelText('Nombre del tablero'), 'Casa{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Casa' })).toBeInTheDocument()
  })

  it('renombra y elimina con deshacer', async () => {
    const user = await setup()
    await openFirstBoard(user)
    await user.click(within(screen.getByRole('heading', { level: 1 })).getByRole('button'))
    await user.clear(screen.getByLabelText('Nombre del tablero'))
    await user.type(screen.getByLabelText('Nombre del tablero'), 'Trabajo{Enter}')
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Eliminar tablero' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar tablero' }),
    )
    expect(await screen.findByRole('heading', { name: 'Mis tableros' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Trabajo/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getAllByRole('button', { name: /Trabajo/ }).length).toBeGreaterThan(0)
  })
})

describe('columnas y tarjetas', () => {
  it('agrega tarjetas encadenadas con Enter y actualiza contador', async () => {
    const user = await setup()
    await openFirstBoard(user)
    const col = screen.getByRole('region', { name: 'Por hacer' })
    await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
    await user.type(
      within(col).getByLabelText('Título de la tarjeta'),
      'Uno{Enter}Dos{Enter}{Escape}',
    )
    expect(within(col).getByText('Uno')).toBeInTheDocument()
    expect(within(col).getByText('Dos')).toBeInTheDocument()
    expect(col).toHaveTextContent('2 tarjetas')
  })

  it('no crea tarjeta con título vacío', async () => {
    const user = await setup()
    await openFirstBoard(user)
    const col = screen.getByRole('region', { name: 'Por hacer' })
    await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
    await user.type(within(col).getByLabelText('Título de la tarjeta'), '   {Enter}')
    expect(col).toHaveTextContent('0 tarjetas')
  })

  it('agrega columnas hasta el límite de 5', async () => {
    const user = await setup()
    await openFirstBoard(user)
    for (const n of ['Cuarta', 'Quinta']) {
      await user.click(screen.getByRole('button', { name: /Agregar columna/ }))
      await user.type(screen.getByLabelText('Nombre de la columna'), `${n}{Enter}`)
    }
    expect(screen.getByRole('button', { name: /Agregar columna/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Agregar columna/ })).toHaveTextContent(
      '5 de 5 columnas',
    )
  })

  it('elimina columna con tarjetas moviéndolas', async () => {
    const user = await setup()
    await openFirstBoard(user)
    const col = screen.getByRole('region', { name: 'Por hacer' })
    await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
    await user.type(within(col).getByLabelText('Título de la tarjeta'), 'A{Enter}{Escape}')
    await user.click(screen.getByRole('button', { name: 'Eliminar columna Por hacer' }))
    await user.selectOptions(screen.getByLabelText('Destino de las tarjetas'), 'Mover a “En curso”')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByRole('region', { name: 'Por hacer' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'En curso' })).toHaveTextContent('1 tarjeta')
  })
})

describe('modal de tarjeta', () => {
  async function withCard(user: ReturnType<typeof userEvent.setup>) {
    await openFirstBoard(user)
    const col = screen.getByRole('region', { name: 'Por hacer' })
    await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
    await user.type(within(col).getByLabelText('Título de la tarjeta'), 'Tarea{Enter}{Escape}')
    await user.click(within(col).getByText('Tarea'))
    return screen.findByRole('dialog', { name: 'Detalle de la tarjeta' })
  }

  it('comentarios con Markdown, editar y eliminar', async () => {
    const user = await setup()
    const dialog = await withCard(user)
    await user.type(within(dialog).getByLabelText('Comentario'), 'Hola **mundo**')
    await user.click(within(dialog).getByRole('button', { name: 'Comentar' }))
    const strong = within(dialog).getByText('mundo')
    expect(strong.tagName).toBe('STRONG')

    await user.click(within(dialog).getByRole('button', { name: 'Editar' }))
    await user.clear(within(dialog).getByLabelText('Editar comentario'))
    await user.type(within(dialog).getByLabelText('Editar comentario'), 'Editado')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(within(dialog).getByText('Editado')).toBeInTheDocument()
    expect(within(dialog).getByText('(editado)')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(within(dialog).queryByText('Editado')).not.toBeInTheDocument()
  })

  it('no ejecuta HTML crudo en comentarios', async () => {
    const user = await setup()
    const dialog = await withCard(user)
    await user.type(
      within(dialog).getByLabelText('Comentario'),
      '<img src=x onerror=alert(1)> hola',
      {
        skipAutoClose: true,
      },
    )
    await user.click(within(dialog).getByRole('button', { name: 'Comentar' }))
    expect(dialog.querySelector('img')).toBeNull()
  })

  it('lista de tareas opcional con progreso', async () => {
    const user = await setup()
    const dialog = await withCard(user)
    await user.click(within(dialog).getByRole('button', { name: /Agregar lista de tareas/ }))
    await user.type(within(dialog).getByLabelText('Nuevo ítem de la lista'), 'uno{Enter}dos{Enter}')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Completar: uno' }))
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('fechas opcionales con validación final >= inicio', async () => {
    const user = await setup()
    const dialog = await withCard(user)
    await user.click(within(dialog).getByRole('button', { name: /Agregar fechas/ }))
    await user.type(within(dialog).getByLabelText('Inicio'), '2026-11-10')
    await user.type(within(dialog).getByLabelText('Final'), '2026-11-05')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('no puede ser anterior')
  })

  it('cierra con Escape y elimina con deshacer', async () => {
    const user = await setup()
    const dialog = await withCard(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByText('Tarea'))
    await user.click(await screen.findByRole('button', { name: 'Eliminar tarjeta' }))
    expect(screen.queryByText('Tarea')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByText('Tarea')).toBeInTheDocument()
    expect(dialog).toBeDefined()
  })
})

describe('búsqueda', () => {
  it('encuentra tarjetas sin acentos y abre el modal', async () => {
    const user = await setup()
    await openFirstBoard(user)
    const col = screen.getByRole('region', { name: 'Por hacer' })
    await user.click(within(col).getByRole('button', { name: 'Agregar tarjeta' }))
    await user.type(
      within(col).getByLabelText('Título de la tarjeta'),
      'Presentación{Enter}{Escape}',
    )
    await user.click(screen.getByRole('button', { name: 'Inicio' }))
    await user.type(screen.getByRole('combobox', { name: 'Buscar' }), 'presentacion')
    await user.click(await screen.findByRole('option', { name: /Tarjeta.*Presentación/ }))
    expect(await screen.findByRole('dialog', { name: 'Detalle de la tarjeta' })).toBeInTheDocument()
  })

  it('"/" enfoca la búsqueda', async () => {
    const user = await setup()
    await user.keyboard('/')
    expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveFocus()
  })
})
