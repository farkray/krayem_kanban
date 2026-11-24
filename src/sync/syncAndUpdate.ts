import { create } from 'zustand'
import { flushDrafts } from '../lib/drafts'
import { applyUpdate } from '../pwa/store'
import { checkForUpdate } from '../pwa/register'
import { useStore } from '../store/store'
import { syncNow } from './boot'
import { useSync } from './status'

interface ActionState {
  busy: boolean
}

/** El botón «Sincronizar» está trabajando (para girar el icono y evitar toques repetidos). */
export const useSyncAction = create<ActionState>(() => ({ busy: false }))

const say = (message: string) => useStore.getState().announce(message)

/**
 * Botón «Sincronizar»: envía y descarga los datos ahora y busca una versión nueva de la app. Si la hay y no quedan cambios sin
 * enviar, la activa (el texto en borrador y la cola de envío están a salvo en el dispositivo).
 */
export async function syncAndUpdate(): Promise<void> {
  if (useSyncAction.getState().busy) return
  useSyncAction.setState({ busy: true })
  try {
    const result = await syncNow()
    const hasUpdate = await checkForUpdate()
    if (hasUpdate && useSync.getState().pending === 0) {
      say('Hay una versión nueva de la app: actualizando…')
      await flushDrafts()
      applyUpdate()
      return
    }
    if (hasUpdate) {
      say('Hay una versión nueva: se instalará en cuanto se envíen tus cambios pendientes.')
    } else if (result === 'offline') {
      say('Sin conexión: tus cambios se enviarán cuando vuelva la red.')
    } else if (result === 'error') {
      say('No se pudo sincronizar ahora. Se reintentará solo.')
    } else {
      say('Todo al día.')
    }
  } finally {
    useSyncAction.setState({ busy: false })
  }
}
