/**
 * @jest-environment jsdom
 */

import { SpriteAnimationRenderer } from '../../src/renderer/animationRenderer'

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

    renderer.play({ key: 'waiting', loop: true, speed: 1 })
    const second = container.querySelector('img')

    expect(first).not.toBe(second)
    expect(second?.getAttribute('src')).toBe('../assets/pet/waiting/waiting_000.png')
    expect(renderer.getCurrentAnimation()).toBe('waiting')
  })

  it('clears sprite state on stop', () => {
    renderer.play({ key: 'idle', loop: true, speed: 1 })
    renderer.stop()

    expect(container.innerHTML).toBe('')
    expect(renderer.getCurrentAnimation()).toBeNull()
  })

  it('calls onComplete after a finite animation finishes its repeats', () => {
    const onComplete = jest.fn()

    renderer.play({ key: 'done', loop: false, speed: 1, onComplete })
    jest.advanceTimersByTime(83 * 12 * 3)

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not call an old onComplete after a new animation starts', () => {
    const onComplete = jest.fn()

    renderer.play({ key: 'done', loop: false, speed: 1, onComplete })
    jest.advanceTimersByTime(83)
    renderer.play({ key: 'idle', loop: true, speed: 1 })
    jest.advanceTimersByTime(83 * 12 * 3)

    expect(onComplete).not.toHaveBeenCalled()
  })
})
