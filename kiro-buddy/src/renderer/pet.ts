import type { AnimationKey, StatusPayload, ToastNotifier } from '../shared/types'
import type { KiroBuddySettings, MoveWindowPayload } from '../shared/ipc'
import {
  DRAG_THROTTLE_MS,
  PET_OPACITY_MAX,
  PET_OPACITY_MIN,
  PET_OPACITY_STEP,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  PET_SCALE_STEP,
} from '../shared/constants'
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
  if (payload.status === 'working') {
    if (payload.phase === 'requirements') {
      return 'requirements-working'
    }

    return 'working'
  }

  if (payload.status === 'waiting' || payload.status === 'asking') {
    return 'asking'
  }

  if (payload.status === 'done') {
    return 'done'
  }

  return 'idle'
}

export function shouldLoopPayload(_payload: StatusPayload): boolean {
  return true
}

declare global {
  interface Window {
    kiroBuddy?: {
      onStatusUpdate(handler: (payload: StatusPayload) => void): () => void
      moveWindow(position: MoveWindowPayload): void
      getSettings(): Promise<KiroBuddySettings>
      setPetScale(scale: number): Promise<KiroBuddySettings | null>
      setPetOpacity(opacity: number): Promise<KiroBuddySettings | null>
      setPositionLocked(locked: boolean): Promise<KiroBuddySettings | null>
      setSettingsMenuOpen(open: boolean): void
      resetWindowPosition(): Promise<KiroBuddySettings>
    }
  }
}

class RendererToastNotifier implements ToastNotifier {
  configure(): void {}
  notify(): void {}
}

class DragHandler {
  private dragging = false
  private locked = false
  private offsetX = 0
  private offsetY = 0
  private lastSentAt = 0

  constructor(private readonly element: HTMLElement) {}

  attach(): void {
    this.element.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('mouseup', this.handleMouseUp)
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.element.classList.toggle('is-locked', locked)

    if (locked && this.dragging) {
      this.dragging = false
      this.element.classList.remove('is-dragging')
    }
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || this.locked) {
      return
    }

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

class ContextMenuController {
  private scaleRequestId = 0
  private opacityRequestId = 0

  constructor(
    private readonly shell: HTMLElement,
    private readonly menu: HTMLElement,
    private readonly slider: HTMLInputElement,
    private readonly value: HTMLOutputElement,
    private readonly opacitySlider: HTMLInputElement,
    private readonly opacityValue: HTMLOutputElement,
    private readonly lockPositionToggle: HTMLInputElement,
    private readonly projectLocationValue: HTMLOutputElement,
    private readonly resetScaleButton: HTMLButtonElement,
    private readonly resetPositionButton: HTMLButtonElement,
    private readonly dragHandler: DragHandler,
  ) {}

  attach(): void {
    this.slider.min = String(Math.round(PET_SCALE_MIN * 100))
    this.slider.max = String(Math.round(PET_SCALE_MAX * 100))
    this.slider.step = String(Math.round(PET_SCALE_STEP * 100))
    this.opacitySlider.min = String(Math.round(PET_OPACITY_MIN * 100))
    this.opacitySlider.max = String(Math.round(PET_OPACITY_MAX * 100))
    this.opacitySlider.step = String(Math.round(PET_OPACITY_STEP * 100))

    this.shell.addEventListener('contextmenu', this.handleContextMenu)
    this.menu.addEventListener('contextmenu', this.handleMenuContextMenu)
    this.slider.addEventListener('input', this.handleScaleInput)
    this.opacitySlider.addEventListener('input', this.handleOpacityInput)
    this.lockPositionToggle.addEventListener('change', this.handleLockPositionInput)
    this.resetScaleButton.addEventListener('click', this.handleResetScale)
    this.resetPositionButton.addEventListener('click', this.handleResetPosition)
    document.addEventListener('mousedown', this.handleDocumentMouseDown)
    window.addEventListener('keydown', this.handleKeyDown)

    void this.loadSettings()
  }

  private async loadSettings(): Promise<void> {
    const settings = await window.kiroBuddy?.getSettings?.()
    this.applyScale(settings?.petScale ?? 1)
    this.applyOpacity(settings?.petOpacity ?? 1)
    this.applyPositionLocked(settings?.positionLocked ?? false)
    this.applyProjectLocation(settings?.projectPath ?? null, settings?.statusFilePath ?? '')
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    this.show()
  }

  private readonly handleMenuContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  private readonly handleScaleInput = (): void => {
    const scale = Number(this.slider.value) / 100
    this.applyScale(scale)

    const requestId = ++this.scaleRequestId
    void window.kiroBuddy?.setPetScale?.(scale).then((settings) => {
      if (settings && requestId === this.scaleRequestId) {
        this.applyScale(settings.petScale)
      }
    })
  }

  private readonly handleResetScale = (): void => {
    this.applyScale(1)

    const requestId = ++this.scaleRequestId
    void window.kiroBuddy?.setPetScale?.(1).then((settings) => {
      if (settings && requestId === this.scaleRequestId) {
        this.applyScale(settings.petScale)
      }
    })
  }

  private readonly handleOpacityInput = (): void => {
    const opacity = Number(this.opacitySlider.value) / 100
    this.applyOpacity(opacity)

    const requestId = ++this.opacityRequestId
    void window.kiroBuddy?.setPetOpacity?.(opacity).then((settings) => {
      if (settings && requestId === this.opacityRequestId) {
        this.applyOpacity(settings.petOpacity)
      }
    })
  }

  private readonly handleLockPositionInput = (): void => {
    const locked = this.lockPositionToggle.checked
    this.applyPositionLocked(locked)

    void window.kiroBuddy?.setPositionLocked?.(locked).then((settings) => {
      if (settings) {
        this.applyPositionLocked(settings.positionLocked)
      }
    })
  }

  private readonly handleResetPosition = (): void => {
    void window.kiroBuddy?.resetWindowPosition?.()
    this.hide()
  }

  private readonly handleDocumentMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || this.menu.hidden) {
      return
    }

    const target = event.target
    if (target instanceof Node && !this.menu.contains(target)) {
      this.hide()
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide()
    }
  }

  private show(): void {
    this.menu.hidden = false
    this.shell.classList.add('is-menu-open')
    window.kiroBuddy?.setSettingsMenuOpen?.(true)
  }

  private hide(): void {
    this.menu.hidden = true
    this.shell.classList.remove('is-menu-open')
    window.kiroBuddy?.setSettingsMenuOpen?.(false)
  }

  private applyScale(scale: number): void {
    const clampedScale = Math.max(PET_SCALE_MIN, Math.min(scale, PET_SCALE_MAX))
    const percent = Math.round(clampedScale * 100)

    document.documentElement.style.setProperty('--pet-scale', String(clampedScale))
    this.slider.value = String(percent)
    this.value.value = `${percent}%`
    this.value.textContent = `${percent}%`
  }

  private applyOpacity(opacity: number): void {
    const clampedOpacity = Math.max(PET_OPACITY_MIN, Math.min(opacity, PET_OPACITY_MAX))
    const percent = Math.round(clampedOpacity * 100)

    document.documentElement.style.setProperty('--pet-opacity', String(clampedOpacity))
    this.opacitySlider.value = String(percent)
    this.opacityValue.value = `${percent}%`
    this.opacityValue.textContent = `${percent}%`
  }

  private applyPositionLocked(locked: boolean): void {
    this.lockPositionToggle.checked = locked
    this.shell.classList.toggle('is-position-locked', locked)
    this.dragHandler.setLocked(locked)
  }

  private applyProjectLocation(projectPath: string | null, statusFilePath: string): void {
    const sourcePath = projectPath || statusFilePath
    const location = compactPath(sourcePath, projectPath ? 'No project' : 'No status file')
    this.projectLocationValue.value = location
    this.projectLocationValue.textContent = location
    this.projectLocationValue.title = sourcePath
    this.projectLocationValue.parentElement?.setAttribute('title', sourcePath)
  }
}

function compactPath(filePath: string, emptyLabel: string): string {
  if (!filePath) {
    return emptyLabel
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 4) {
    return filePath
  }

  return `...\\${parts.slice(-3).join('\\')}`
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing required element: ${id}`)
  }

  return element
}

window.addEventListener('DOMContentLoaded', () => {
  const pet = requiredElement('pet')
  const dragZone = requiredElement('drag-zone')
  const animation = requiredElement('animation')
  const tooltip = requiredElement('tooltip')
  const statusLabel = requiredElement('status-label')
  const contextMenu = requiredElement('context-menu')
  const scaleSlider = requiredElement('scale-slider') as HTMLInputElement
  const scaleValue = requiredElement('scale-value') as HTMLOutputElement
  const opacitySlider = requiredElement('opacity-slider') as HTMLInputElement
  const opacityValue = requiredElement('opacity-value') as HTMLOutputElement
  const lockPositionToggle = requiredElement('lock-position-toggle') as HTMLInputElement
  const projectLocationValue = requiredElement('project-location-value') as HTMLOutputElement
  const resetScale = requiredElement('reset-scale') as HTMLButtonElement
  const resetPosition = requiredElement('reset-position') as HTMLButtonElement

  const animationRenderer = createAnimationRenderer(animation)
  const tooltipBubble = createTooltipBubble(tooltip)
  const stateMachine = createPetStateMachine(
    animationRenderer,
    tooltipBubble,
    new RendererToastNotifier(),
  )

  animationRenderer.play({ key: 'idle', loop: true, speed: 1 })
  const dragHandler = new DragHandler(dragZone)
  dragHandler.attach()
  new ContextMenuController(
    pet,
    contextMenu,
    scaleSlider,
    scaleValue,
    opacitySlider,
    opacityValue,
    lockPositionToggle,
    projectLocationValue,
    resetScale,
    resetPosition,
    dragHandler,
  ).attach()

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
  }

  window.kiroBuddy?.onStatusUpdate((payload) => {
    const accepted = stateMachine.dispatch(payload.status, payload.message)
    if (!accepted) {
      return
    }

    applyPayload(payload)
    animationRenderer.play({
      key: animationKeyForPayload(payload),
      loop: shouldLoopPayload(payload),
      speed: 1,
    })
  })
})
