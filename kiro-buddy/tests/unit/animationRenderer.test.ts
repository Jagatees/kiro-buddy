/**
 * @jest-environment jsdom
 */

import { SpriteAnimationRenderer } from '../../src/renderer/animationRenderer'
import fs from 'fs'
import path from 'path'
import type { AnimationKey } from '../../src/shared/types'

const projectRoot = path.resolve(__dirname, '..', '..')
const animationKeys: AnimationKey[] = ['idle', 'working', 'asking', 'done', 'requirements-working']

describe('SpriteAnimationRenderer', () => {
  let container: HTMLElement
  let renderer: SpriteAnimationRenderer

  beforeEach(() => {
    jest.useFakeTimers()
    container = document.createElement('div')
    renderer = new SpriteAnimationRenderer(container)
  })

  afterEach(() => {
    renderer.stop()
    jest.useRealTimers()
  })

  it('loads and tracks the requested sprite animation', () => {
    renderer.play({ key: 'working', loop: true, speed: 1.25 })

    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.className).toBe('pet-sprite-frame')
    expect(image?.getAttribute('src')).toBe('../assets/pet/working/working_000.png')
    expect(renderer.getCurrentAnimation()).toBe('working')
  })

  it('advances sprite frames on a timer', () => {
    renderer.play({ key: 'idle', loop: true, speed: 1 })

    const image = container.querySelector('img')
    jest.advanceTimersByTime(83)

    expect(image?.getAttribute('src')).toBe('../assets/pet/idle/idle_001.png')
  })

  it('stops the previous animation before starting another', () => {
    renderer.play({ key: 'working', loop: true, speed: 1 })
    const first = container.querySelector('img')

    renderer.play({ key: 'asking', loop: true, speed: 1 })
    const second = container.querySelector('img')

    expect(first).not.toBe(second)
    expect(second?.getAttribute('src')).toBe('../assets/pet/asking/asking_000.png')
    expect(renderer.getCurrentAnimation()).toBe('asking')
  })

  it('clears sprite state on stop', () => {
    renderer.play({ key: 'idle', loop: true, speed: 1 })
    renderer.stop()

    expect(container.innerHTML).toBe('')
    expect(renderer.getCurrentAnimation()).toBeNull()
  })
  it('marks the distinct error presentation and clears it on recovery', () => {
    renderer.play({ key: 'error', loop: true, speed: 1 })
    expect(container.dataset.animation).toBe('error')
    expect(renderer.getCurrentAnimation()).toBe('error')
    expect(container.querySelector('img')?.getAttribute('src')).toContain('idle_000.png')
    renderer.play({ key: 'working', loop: true, speed: 1 })
    expect(container.dataset.animation).toBe('working')
  })

  it('plays non-looping animations once and holds the final frame', () => {
    const onComplete = jest.fn()

    renderer.play({ key: 'idle', loop: false, speed: 1, onComplete })
    jest.advanceTimersByTime(83 * 12 * 3)

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container.querySelector('img')?.getAttribute('src')).toContain('idle_011.png')
  })

  it('does not call an old onComplete after a new animation starts', () => {
    const onComplete = jest.fn()

    renderer.play({ key: 'idle', loop: false, speed: 1, onComplete })
    jest.advanceTimersByTime(83)
    renderer.play({ key: 'idle', loop: true, speed: 1 })
    jest.advanceTimersByTime(83 * 12 * 3)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('keeps its frame and cadence during repeated status updates', () => {
    renderer.play({ key: 'requirements-working', loop: true, speed: 1 })
    jest.advanceTimersByTime(83 * 4 + 40)
    const image = container.querySelector('img')
    renderer.play({ key: 'requirements-working', loop: true, speed: 1 })
    expect(container.querySelector('img')).toBe(image)
    expect(image?.getAttribute('src')).toContain('_004.png')
    jest.advanceTimersByTime(43)
    expect(image?.getAttribute('src')).toContain('_005.png')
  })

  it('blends transitions and cleans up during rapid state changes', () => {
    renderer.play({ key: 'idle', loop: true, speed: 1 })
    renderer.play({ key: 'working', loop: true, speed: 1 })
    expect(container.children).toHaveLength(2)
    jest.advanceTimersByTime(60)
    renderer.play({ key: 'asking', loop: true, speed: 1 })
    expect(container.children).toHaveLength(2)
    jest.advanceTimersByTime(140)
    expect(container.children).toHaveLength(1)
    expect(renderer.getCurrentAnimation()).toBe('asking')
    renderer.stop()
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each(animationKeys)('has all sprite frames for %s', (key) => {
    for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
      const framePath = path.join(
        projectRoot,
        'assets',
        'pet',
        key,
        `${key}_${String(frameIndex).padStart(3, '0')}.png`,
      )

      expect(fs.existsSync(framePath)).toBe(true)
    }
  })

  it.each(animationKeys)('plays the first frame for %s', (key) => {
    renderer.play({ key, loop: true, speed: 1 })

    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe(`../assets/pet/${key}/${key}_000.png`)
    expect(renderer.getCurrentAnimation()).toBe(key)
  })
})
