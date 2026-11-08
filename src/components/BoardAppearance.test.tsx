import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetStore, useStore } from '../store/store'
import type { Board } from '../lib/types'
import { BoardAppearance } from './BoardAppearance'

const board = (extra: Partial<Board> = {}): Board => ({
  id: 'b1',
  title: 'Casa',
  position: 'a0',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
})

async function setup(extra: Partial<Board> = {}, editable = true) {
  await resetStore()
  useStore.setState({ boards: [board(extra)] })
  const Live = () => {
    const b = useStore((s) => s.boards[0])
    return <BoardAppearance board={b} editable={editable} className="t" />
  }
  return render(<Live />)
}
const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Cambiar color e icono del tablero' }))
const look = () => useStore.getState().boards[0]

describe('BoardAppearance', () => {
  it('quien no es dueño ve el cuadro pero no puede cambiarlo', async () => {
    await setup({}, false)
    expect(
      screen.queryByRole('button', { name: 'Cambiar color e icono del tablero' }),
    ).not.toBeInTheDocument()
  })

  it('ofrece 10 colores y 10 iconos con nombre, y marca los actuales', async () => {
    await setup({ color: 'rojo', icon: 'cohete' })
    await open()
    const colors = within(screen.getByRole('radiogroup', { name: 'Color' })).getAllByRole('radio')
    const icons = within(screen.getByRole('radiogroup', { name: 'Icono' })).getAllByRole('radio')
    expect(colors).toHaveLength(10)
    expect(icons).toHaveLength(10)
    expect(screen.getByRole('radio', { name: 'Rojo' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Lanzamiento' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Petróleo' })).not.toBeChecked()
  })

  it('elegir un color o un icono se aplica al instante, sin botón de guardar', async () => {
    await setup()
    await open()
    await userEvent.click(screen.getByRole('radio', { name: 'Verde' }))
    expect(look().color).toBe('verde')
    await userEvent.click(screen.getByRole('radio', { name: 'Estudio' }))
    expect(look()).toMatchObject({ color: 'verde', icon: 'estudio' })
    expect(screen.getByRole('radio', { name: 'Verde' })).toBeChecked()
  })

  it('las flechas mueven la selección dentro del grupo (una sola parada de Tab)', async () => {
    await setup({ color: 'petroleo' })
    await open()
    expect(screen.getByRole('radio', { name: 'Petróleo' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Cielo' })).toHaveAttribute('tabindex', '-1')
    screen.getByRole('radio', { name: 'Petróleo' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(look().color).toBe('cielo')
    expect(screen.getByRole('radio', { name: 'Cielo' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(look().color).toBe('grafito') // da la vuelta
    await userEvent.keyboard('{Home}')
    expect(look().color).toBe('petroleo')
  })

  it('"Restablecer" vuelve al aspecto por defecto y está desactivado si ya lo es', async () => {
    await setup({ color: 'rosa', icon: 'corazon' })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(look()).toMatchObject({ color: 'petroleo', icon: 'tablero' })
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeDisabled()
  })

  it('Escape cierra el panel y devuelve el foco al cuadro', async () => {
    await setup()
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Aspecto del tablero' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar color e icono del tablero' })).toHaveFocus()
  })
})
