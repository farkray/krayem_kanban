import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { setIdentityResolver, setRoleResolver } from '../lib/access'
import { resetDrafts, updateDraftKey, useDrafts } from '../lib/drafts'
import { LIMITS } from '../lib/types'
import { resetStore, useStore } from '../store/store'
import { useAccess } from '../sync/access'
import { useAuth } from '../sync/auth'
import { CardModal } from './CardModal'

const ts = '2026-11-01T10:00:00.000Z'
const base = { createdAt: ts, updatedAt: ts }
const ME = 'u-me'
const S = () => useStore.getState()

async function setup() {
  await resetStore()
  resetDrafts()
  useStore.setState({
    boards: [{ ...base, id: 'b1', title: 'B', position: 'a0' }],
    columns: [{ ...base, id: 'c1', boardId: 'b1', title: 'C', position: 'a0' }],
    cards: [{ ...base, id: 'k1', boardId: 'b1', columnId: 'c1', title: 'Tarjeta', position: 'a0' }],
    comments: [],
  })
  useAuth.setState({ status: 'signedIn', userId: ME, email: 'yo@correo.com', alias: 'Yo' })
  useAccess.setState({
    shared: [],
    members: [],
    participants: [{ boardId: 'b1', userId: ME, email: 'yo@correo.com', alias: 'Yo', role: 'owner' }],
    loaded: true,
  })
  setIdentityResolver(() => ME)
  setRoleResolver(() => 'owner')
  const onClose = vi.fn()
  render(<CardModal cardId="k1" onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

describe('detalle de tarjeta: actualización sin enviar', () => {
  it('sin borrador, Listo solo cierra y no crea actualizaciones', async () => {
    const { onClose, user } = await setup()
    expect(screen.getByText('Los cambios se guardan solos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onClose).toHaveBeenCalled()
    expect(S().comments).toHaveLength(0)
  })

  it('con un borrador avisa y Listo (Actualizar y cerrar) lo publica, lo borra y cierra', async () => {
    const { onClose, user } = await setup()
    useDrafts.getState().set(updateDraftKey('k1'), 'Quedó **listo** para revisión')
    expect(await screen.findByText('Hay una actualización sin enviar')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Actualizaciones.*borrador/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualizar y cerrar' }))
    expect(S().comments).toHaveLength(1)
    expect(S().comments[0]).toMatchObject({
      cardId: 'k1',
      bodyMd: 'Quedó **listo** para revisión',
    })
    expect(useDrafts.getState().items[updateDraftKey('k1')]).toBeUndefined()
    expect(onClose).toHaveBeenCalled()
  })

  it('si no se puede publicar, el diálogo sigue abierto y el borrador intacto', async () => {
    const { onClose, user } = await setup()
    const long = 'x'.repeat(LIMITS.comment + 10)
    useDrafts.getState().set(updateDraftKey('k1'), long)
    await user.click(await screen.findByRole('button', { name: 'Actualizar y cerrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sigue guardada como borrador/)
    expect(onClose).not.toHaveBeenCalled()
    expect(S().comments).toHaveLength(0)
    expect(useDrafts.getState().items[updateDraftKey('k1')]).toBe(long)
  })

  it('la × y Esc cierran sin publicar: el borrador queda guardado y se avisa', async () => {
    const { onClose, user } = await setup()
    useDrafts.getState().set(updateDraftKey('k1'), 'a medias')
    await screen.findByText('Hay una actualización sin enviar')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(S().comments).toHaveLength(0)
    expect(useDrafts.getState().items[updateDraftKey('k1')]).toBe('a medias')
    expect(S().toast?.message).toMatch(/Borrador guardado/)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(useDrafts.getState().items[updateDraftKey('k1')]).toBe('a medias')
  })
})
