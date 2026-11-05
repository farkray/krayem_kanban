import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangePasswordDialog } from './ChangePasswordDialog'

const changePassword = vi.hoisted(() => vi.fn())
vi.mock('../sync/boot', () => ({ changePassword }))

beforeEach(() => changePassword.mockReset())

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  cur: string,
  next: string,
  again = next,
) {
  await user.type(screen.getByLabelText('Contraseña actual'), cur)
  await user.type(screen.getByLabelText('Nueva contraseña'), next)
  await user.type(screen.getByLabelText('Repite la nueva contraseña'), again)
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
}

describe('ChangePasswordDialog', () => {
  it('cambia la contraseña y confirma', async () => {
    changePassword.mockResolvedValue(null)
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ChangePasswordDialog onClose={onClose} />)
    await fill(user, 'temporal-123', 'mi-nueva-contraseña-1')
    expect(changePassword).toHaveBeenCalledWith('temporal-123', 'mi-nueva-contraseña-1')
    expect(await screen.findByRole('status')).toHaveTextContent('Listo.')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('valida en el cliente: confirmación distinta y contraseña corta (sin llamar al servidor)', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog onClose={() => {}} />)
    await fill(user, 'temporal-123', 'mi-nueva-contraseña-1', 'otra-distinta-12345')
    expect(await screen.findByRole('alert')).toHaveTextContent('no coincide')
    expect(changePassword).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid_credentials', 'La contraseña actual no es correcta.'],
    ['same_password', 'distinta de la actual'],
    ['too_many_attempts', 'Demasiados intentos'],
    ['offline', 'No hay conexión'],
  ])('muestra el error %s del servidor', async (code, text) => {
    changePassword.mockResolvedValue(code)
    const user = userEvent.setup()
    render(<ChangePasswordDialog onClose={() => {}} />)
    await fill(user, 'temporal-123', 'mi-nueva-contraseña-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('Escape cierra el diálogo', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ChangePasswordDialog onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
