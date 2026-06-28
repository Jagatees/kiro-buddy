import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  isMoveWindowPayload,
  isSetPetOpacityPayload,
  isSetPetScalePayload,
  isSetPositionLockedPayload,
  isSetSettingsMenuOpenPayload,
  type KiroBuddySettings,
  type MoveWindowPayload,
  type SetPetOpacityPayload,
  type SetPetScalePayload,
  type SetPositionLockedPayload,
  type SetSettingsMenuOpenPayload,
} from '../shared/ipc'
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

  getSettings(): Promise<KiroBuddySettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.getSettings)
  },

  setPetScale(scale: number): Promise<KiroBuddySettings | null> {
    const payload: SetPetScalePayload = { scale }
    if (!isSetPetScalePayload(payload)) {
      return Promise.resolve(null)
    }

    return ipcRenderer.invoke(IPC_CHANNELS.setPetScale, payload)
  },

  setPetOpacity(opacity: number): Promise<KiroBuddySettings | null> {
    const payload: SetPetOpacityPayload = { opacity }
    if (!isSetPetOpacityPayload(payload)) {
      return Promise.resolve(null)
    }

    return ipcRenderer.invoke(IPC_CHANNELS.setPetOpacity, payload)
  },

  setPositionLocked(locked: boolean): Promise<KiroBuddySettings | null> {
    const payload: SetPositionLockedPayload = { locked }
    if (!isSetPositionLockedPayload(payload)) {
      return Promise.resolve(null)
    }

    return ipcRenderer.invoke(IPC_CHANNELS.setPositionLocked, payload)
  },

  setSettingsMenuOpen(open: boolean): void {
    const payload: SetSettingsMenuOpenPayload = { open }
    if (!isSetSettingsMenuOpenPayload(payload)) {
      return
    }

    ipcRenderer.send(IPC_CHANNELS.setSettingsMenuOpen, payload)
  },

  resetWindowPosition(): Promise<KiroBuddySettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.resetWindowPosition)
  },
})
