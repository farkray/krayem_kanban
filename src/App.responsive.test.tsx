import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import App from './App'
import { resetStore } from './store/store'

type Listener = () => void
let width = 390
const listeners = new Set<Listener>()

/** matchMedia mínimo: evalúa solo min-width / max-width contra `width`. */
function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => {
    const test = () =>
      query
        .split(',')
        .some(
          (part) =>
            [...part.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([, k, n]) =>
              k === 'min' ? width >= Number(n) : width <= Number(n),
            ) && /width/.test(part),
        )
    return {
      get matches() {
        return test()
      },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    }
  })
}

async function setup(w: number) {
  width = w
  stubMatchMedia()
  window.history.replaceState(null, '', '/')
  await resetStore()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('heading', { name: 'Mis tableros' })
  return user
}

afterEach(() => {
  vi.unstubAllGlobals()
  listeners.clear()
})

describe('pantalla angosta: la barra lateral es un panel', () => {
  it('empieza cerrado; el menú lo abre y elegir un tablero lo cierra', async () => {
    const user = await setup(390)
    expect(screen.queryByRole('complementary', { name: 'Tableros' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar barra lateral' }))
    const panel = screen.getByRole('complementary', { name: 'Tableros' })
    expect(panel).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveFocus() // el foco entra al panel

    await user.click(within(panel).getByRole('button', { name: /Mi tablero/ }))
    expect(screen.queryByRole('complementary', { name: 'Tableros' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mi tablero' })).toBeInTheDocument()
  })

  it('Escape y "Cerrar menú" lo cierran', async () => {
    const user = await setup(390)
    await user.click(screen.getByRole('button', { name: 'Mostrar barra lateral' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Tableros' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar barra lateral' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar menú' }))
    expect(screen.queryByRole('complementary', { name: 'Tableros' })).not.toBeInTheDocument()
  })

  it('el buscador usa un texto corto en teléfonos', async () => {
    await setup(390)
    expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveAttribute(
      'placeholder',
      'Buscar',
    )
  })

  it('al ensanchar la ventana la barra lateral pasa a ser fija', async () => {
    await setup(390)
    expect(screen.queryByRole('complementary', { name: 'Tableros' })).not.toBeInTheDocument()
    width = 1280
    await act(async () => listeners.forEach((l) => l()))
    expect(screen.getByRole('complementary', { name: 'Tableros' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostrar barra lateral' })).not.toBeInTheDocument()
  })
})

describe('pantalla ancha', () => {
  it('barra lateral fija y texto de búsqueda completo', async () => {
    await setup(1280)
    expect(screen.getByRole('complementary', { name: 'Tableros' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveAttribute(
      'placeholder',
      'Buscar tableros, columnas y tarjetas',
    )
  })
})
