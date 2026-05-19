import { contextBridge, ipcRenderer } from 'electron'
import type { KiroBuddyDebugInfo, KiroBuddyReplyResult, StatusPayload } from '../shared/types'

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

  closeApp(): void {
    ipcRenderer.send('close-app')
  },

  showContextMenu(): void {
    ipcRenderer.send('show-context-menu')
  },

  getDebugInfo(): Promise<KiroBuddyDebugInfo> {
    return ipcRenderer.invoke('get-debug-info')
  },

  getPetScale(): Promise<number> {
    return ipcRenderer.invoke('get-pet-scale')
  },

  setPetScale(scale: number): Promise<number> {
    return ipcRenderer.invoke('set-pet-scale', scale)
  },

  copyReply(text: string): Promise<KiroBuddyReplyResult> {
    return ipcRenderer.invoke('copy-reply', text)
  },

  replyToKiro(text: string): Promise<KiroBuddyReplyResult> {
    return ipcRenderer.invoke('reply-to-kiro', text)
  },
})
