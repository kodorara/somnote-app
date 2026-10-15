import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SwipeContainer } from './SwipeContainer'

describe('SwipeContainer', () => {
  it('calls onSwipeLeft when swiped to the left beyond threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <div>Content</div>
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(container, { clientX: 130, clientY: 105 }) // deltaX = -70 (< -50)

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('calls onSwipeRight when swiped to the right beyond threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <div>Content</div>
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(container, { clientX: 180, clientY: 105 }) // deltaX = +80 (> 50)

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('does not trigger swipe if vertical scroll movement is dominant', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <div>Content</div>
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(container, { clientX: 170, clientY: 200 }) // deltaX = 70, deltaY = 100

    expect(onSwipeRight).not.toHaveBeenCalled()
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('does not trigger swipe if deltaX is below threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} threshold={50}>
        <div>Content</div>
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(container, { clientX: 130, clientY: 100 }) // deltaX = 30 (< 50)

    expect(onSwipeRight).not.toHaveBeenCalled()
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('ignores pointer interaction originating on inputs or textareas', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <textarea aria-label="メモ本文" defaultValue="入力テキスト" />
      </SwipeContainer>,
    )

    const textarea = screen.getByRole('textbox')
    fireEvent.pointerDown(textarea, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(textarea, { clientX: 100, clientY: 100 })

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })
})
