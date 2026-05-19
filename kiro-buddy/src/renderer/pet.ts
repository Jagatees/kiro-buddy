import type {
  AnimationKey,
  KiroBuddyDebugInfo,
  StatusPayload,
  ToastNotifier,
} from '../shared/types'
import { DRAG_THROTTLE_MS } from '../shared/constants'
import { createAnimationRenderer } from './animationRenderer'
import { createPetStateMachine } from './stateMachine'
import { createTooltipBubble } from './tooltipBubble'

const STATUS_LABELS: Record<StatusPayload['status'], string> = {
  idle: 'Kiro Ready',
  working: 'Kiro Working',
  waiting: 'Kiro Waiting',
  asking: 'Kiro Asking',
  done: 'Kiro Done',
  error: 'Kiro Error',
}

const PHASE_LABELS: Record<NonNullable<StatusPayload['phase']>, string> = {
  design: 'Design',
  requirements: 'Requirements',
  tasks: 'Task List',
}

export function formatStatusLabel(payload: StatusPayload): string {
  if (!payload.phase) {
    return STATUS_LABELS[payload.status]
  }

  const phase = PHASE_LABELS[payload.phase]
  if (payload.status === 'working') {
    return `${phase} Working`
  }
  if (payload.status === 'done') {
    return `${phase} Done`
  }
  if (payload.status === 'error') {
    return `${phase} Error`
  }
  if (payload.status === 'waiting') {
    return `${phase} Waiting`
  }
  if (payload.status === 'asking') {
    return `${phase} Asking`
  }

  return phase
}

export function animationKeyForPayload(payload: StatusPayload): AnimationKey {
  if (payload.phase && (payload.status === 'working' || payload.status === 'done')) {
    return `${payload.phase}-${payload.status}`
  }

  return payload.status
}

export function shouldLoopPayload(payload: StatusPayload): boolean {
  return (
    payload.status === 'idle' ||
    payload.status === 'working' ||
    payload.status === 'waiting' ||
    payload.status === 'asking'
  )
}

export function formatDebugTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'never'
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function debugInfoForPayload(
  payload: StatusPayload,
  statusFilePath: string,
  lastSlashCommand?: string,
): KiroBuddyDebugInfo {
  return {
    status: payload.status,
    message: payload.message,
    timestamp: payload.timestamp,
    phase: payload.phase,
    context: payload.context,
    statusFilePath,
    lastSlashCommand,
  }
}

function idlePayload(): StatusPayload {
  return {
    status: 'idle',
    message: '',
    timestamp: Date.now(),
  }
}

declare global {
  interface Window {
    kiroBuddy?: {
      onStatusUpdate(handler: (payload: StatusPayload) => void): () => void
      moveWindow(position: { x: number; y: number }): void
      closeApp(): void
      getDebugInfo(): Promise<KiroBuddyDebugInfo>
    }
  }
}

class RendererToastNotifier implements ToastNotifier {
  configure(): void {}
  notify(): void {}
}

class DragHandler {
  private dragging = false
  private offsetX = 0
  private offsetY = 0
  private lastSentAt = 0

  constructor(private readonly element: HTMLElement) {}

  attach(): void {
    this.element.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('mouseup', this.handleMouseUp)
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    this.dragging = true
    this.offsetX = event.clientX
    this.offsetY = event.clientY
    this.element.classList.add('is-dragging')
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragging) {
      return
    }

    const now = performance.now()
    if (now - this.lastSentAt < DRAG_THROTTLE_MS) {
      return
    }

    this.lastSentAt = now
    this.sendPosition(event)
  }

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (!this.dragging) {
      return
    }

    this.dragging = false
    this.element.classList.remove('is-dragging')
    this.sendPosition(event)
  }

  private sendPosition(event: MouseEvent): void {
    const nextX = window.screenX + event.clientX - this.offsetX
    const nextY = window.screenY + event.clientY - this.offsetY
    window.kiroBuddy?.moveWindow({ x: nextX, y: nextY })
  }
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing required element: ${id}`)
  }

  return element
}

function setText(element: HTMLElement, value: string | undefined): void {
  element.textContent = value && value.length > 0 ? value : 'none'
}

window.addEventListener('DOMContentLoaded', () => {
  const pet = requiredElement('pet')
  const animation = requiredElement('animation')
  const tooltip = requiredElement('tooltip')
  const statusLabel = requiredElement('status-label')
  const closeButton = requiredElement('close-button')
  const panelToggle = requiredElement('panel-toggle') as HTMLButtonElement
  const panelClose = requiredElement('panel-close') as HTMLButtonElement
  const debugPanel = requiredElement('debug-panel')
  const panelMessage = requiredElement('panel-message')
  const debugStatus = requiredElement('debug-status')
  const debugPhase = requiredElement('debug-phase')
  const debugUpdated = requiredElement('debug-updated')
  const debugSlash = requiredElement('debug-slash')
  const debugContext = requiredElement('debug-context')
  const debugAutomation = requiredElement('debug-automation')
  const debugSource = requiredElement('debug-source')

  const animationRenderer = createAnimationRenderer(animation)
  const tooltipBubble = createTooltipBubble(tooltip)
  const stateMachine = createPetStateMachine(
    animationRenderer,
    tooltipBubble,
    new RendererToastNotifier(),
  )

  animationRenderer.play({ key: 'idle', loop: true, speed: 1 })
  new DragHandler(pet).attach()
  closeButton.addEventListener('mousedown', (event) => event.stopPropagation())
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation()
    window.kiroBuddy?.closeApp()
  })
  let latestDebugInfo = debugInfoForPayload(idlePayload(), '~/.kiro/status.json')
  let statusVersion = 0

  function applyPayload(payload: StatusPayload): void {
    const label = formatStatusLabel(payload)
    pet.dataset.status = payload.status
    if (payload.phase) {
      pet.dataset.phase = payload.phase
    } else {
      delete pet.dataset.phase
    }
    statusLabel.textContent = label
    pet.setAttribute('aria-label', label)
    latestDebugInfo = {
      ...latestDebugInfo,
      status: payload.status,
      message: payload.message,
      phase: payload.phase,
      context: payload.context,
      timestamp: payload.timestamp,
    }
    renderDebugInfo(latestDebugInfo)
  }

  function renderDebugInfo(info: KiroBuddyDebugInfo): void {
    latestDebugInfo = info
    panelMessage.textContent = info.message || 'Kiro is ready'
    setText(debugStatus, info.status)
    setText(debugPhase, info.phase)
    setText(debugUpdated, formatDebugTimestamp(info.timestamp))
    setText(debugSlash, info.lastSlashCommand)
    setText(debugContext, info.context)
    setText(debugAutomation, info.automationStatus)
    setText(debugSource, info.statusFilePath)
  }

  async function refreshDebugInfo(): Promise<void> {
    try {
      const info = await window.kiroBuddy?.getDebugInfo()
      if (info) {
        renderDebugInfo(info)
      }
    } catch {
      renderDebugInfo(latestDebugInfo)
    }
  }

  function setPanelOpen(open: boolean): void {
    debugPanel.hidden = !open
    pet.classList.toggle('is-panel-open', open)
    panelToggle.setAttribute('aria-expanded', String(open))
    if (open) {
      void refreshDebugInfo()
    }
  }

  panelToggle.addEventListener('mousedown', (event) => event.stopPropagation())
  panelToggle.addEventListener('click', (event) => {
    event.stopPropagation()
    setPanelOpen(true)
  })

  panelClose.addEventListener('mousedown', (event) => event.stopPropagation())
  panelClose.addEventListener('click', (event) => {
    event.stopPropagation()
    setPanelOpen(false)
  })

  for (const element of [debugPanel]) {
    element.addEventListener('mousedown', (event) => event.stopPropagation())
  }

  renderDebugInfo(latestDebugInfo)

  window.kiroBuddy?.onStatusUpdate((payload) => {
    statusVersion += 1
    const version = statusVersion
    applyPayload(payload)
    stateMachine.dispatch(payload.status, payload.message)
    animationRenderer.play({
      key: animationKeyForPayload(payload),
      loop: shouldLoopPayload(payload),
      speed: 1,
      onComplete:
        payload.status === 'done'
          ? () => {
              if (statusVersion !== version) {
                return
              }

              const nextPayload = idlePayload()
              applyPayload(nextPayload)
              stateMachine.dispatch(nextPayload.status, nextPayload.message)
            }
          : undefined,
    })
  })
})
