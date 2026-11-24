import { vi } from 'vitest'

const syncNow = vi.fn()
const checkForUpdate = vi.fn()
const applyUpdate = vi.fn()
const flushDrafts = vi.fn(async () => {})
const announce = vi.fn()

vi.mock('./boot', () => ({ syncNow: () => syncNow() }))
vi.mock('../pwa/register', () => ({ checkForUpdate: () => checkForUpdate() }))
vi.mock('../pwa/store', () => ({ applyUpdate: () => applyUpdate() }))
vi.mock('../lib/drafts', () => ({ flushDrafts: () => flushDrafts() }))
vi.mock('../store/store', () => ({ useStore: { getState: () => ({ announce }) } }))

import { syncAndUpdate, useSyncAction } from './syncAndUpdate'
import { setSync } from './status'

beforeEach(() => {
  vi.clearAllMocks()
  setSync({ pending: 0, enabled: true, online: true, error: null, syncing: false })
  useSyncAction.setState({ busy: false })
})

describe('botón Sincronizar', () => {
  it('sin versión nueva y todo en orden avisa que está al día', async () => {
    syncNow.mockResolvedValue('ok')
    checkForUpdate.mockResolvedValue(false)
    await syncAndUpdate()
    expect(announce).toHaveBeenCalledWith('Todo al día.')
    expect(applyUpdate).not.toHaveBeenCalled()
    expect(useSyncAction.getState().busy).toBe(false)
  })

  it('con versión nueva y sin cambios pendientes: guarda borradores y activa la actualización', async () => {
    syncNow.mockResolvedValue('ok')
    checkForUpdate.mockResolvedValue(true)
    await syncAndUpdate()
    expect(flushDrafts).toHaveBeenCalled()
    expect(applyUpdate).toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/versión nueva/))
  })

  it('con versión nueva pero cambios sin enviar: no recarga todavía', async () => {
    setSync({ pending: 3 })
    syncNow.mockResolvedValue('error')
    checkForUpdate.mockResolvedValue(true)
    await syncAndUpdate()
    expect(applyUpdate).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/se instalará en cuanto se envíen/))
  })

  it('sin conexión o con error lo dice, y el botón vuelve a quedar libre', async () => {
    checkForUpdate.mockResolvedValue(false)
    syncNow.mockResolvedValue('offline')
    await syncAndUpdate()
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/Sin conexión/))
    syncNow.mockResolvedValue('error')
    await syncAndUpdate()
    expect(announce).toHaveBeenLastCalledWith(expect.stringMatching(/No se pudo sincronizar/))
    expect(useSyncAction.getState().busy).toBe(false)
  })

  it('un segundo toque mientras trabaja no lanza otra sincronización', async () => {
    let release!: (v: string) => void
    syncNow.mockReturnValue(new Promise((r) => (release = r)))
    checkForUpdate.mockResolvedValue(false)
    const first = syncAndUpdate()
    await syncAndUpdate() // ignorado
    expect(syncNow).toHaveBeenCalledTimes(1)
    release('ok')
    await first
  })
})
