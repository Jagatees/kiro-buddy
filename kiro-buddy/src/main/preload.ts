import { contextBridge, ipcRenderer } from 'electron'
import type { StatusPayload } from '../shared/types'

type StatusUpdateHandler = (payload: StatusPayload) => void

contextBridge.exposeInMainWorld('kiroBuddy', {
  onStatusUpdate(handler: StatusUpdateHandler): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: StatusPayload) => {
      handler(payload)
    }

    ipcRenderer.on('status-update', listener)
    return () => ipcRenderer.removeListener('status-update', listener)
  },

  moveWindow(position: { x: number; y: number }): void {
    ipcRenderer.send('move-window', position)
  },
})
