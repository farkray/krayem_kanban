import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const syncAndUpdate = vi.fn(async () => {})
vi.mock('../sync/syncAndUpdate', async () => {
  const { create } = await import('zustand')
  return {
    syncAndUpdate: () => syncAndUpdate(),
    useSyncAction: create(() => ({ busy: false })),
  }
})

import { setSync } from '../sync/status'
import { SyncStatus } from './SyncStatus'

describe('indicador y botón de sincronización', () => {
  it('muestra el estado y un botón «Sincronizar ahora» que lanza la sincronización', async () => {
    setSync({ enabled: true, online: true, pending: 0, syncing: false, error: null })
    render(<SyncStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sincronizar ahora' }))
    expect(syncAndUpdate).toHaveBeenCalledTimes(1)
  })

  it('en modo solo local no hay indicador ni botón', () => {
    setSync({ enabled: false })
    const { container } = render(<SyncStatus />)
    expect(container).toBeEmptyDOMElement()
  })
})
