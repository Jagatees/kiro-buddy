import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, isMoveWindowPayload, type MoveWindowPayload } from '../shared/ipc'
import type { StatusPayload } from '../shared/types'
import { validateStatusPayload } from '../shared/validation'

type StatusUpdateHandler = (payload: StatusPayload) => void

contextBridge.exposeInMainWorld('kiroBuddy', {
  onStatusUpdate(handler: StatusUpdateHandler): () => void {
    if (typeof handler !== 'function') {
      return () => {}
    }

    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (!validateStatusPayload(payload)) {
        return
      }

      handler(payload)
    }

    ipcRenderer.on(IPC_CHANNELS.statusUpdate, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.statusUpdate, listener)
  },

  moveWindow(position: MoveWindowPayload): void {
    if (!isMoveWindowPayload(position)) {
      return
    }

    ipcRenderer.send(IPC_CHANNELS.moveWindow, position)
  },
})
