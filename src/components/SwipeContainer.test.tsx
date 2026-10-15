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

  it('ignores pointer interaction starting inside a horizontally-scrollable element (e.g. a wide code block)', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
        <pre data-testid="code-block" style={{ overflowX: 'auto' }}>
          <code>とても長い1行のコード...</code>
        </pre>
      </SwipeContainer>,
    )

    const pre = screen.getByTestId('code-block')
    // jsdomはレイアウトを計算しないため、scrollWidth/clientWidthを明示的にモックする
    Object.defineProperty(pre, 'scrollWidth', { value: 2000, configurable: true })
    Object.defineProperty(pre, 'clientWidth', { value: 300, configurable: true })

    fireEvent.pointerDown(pre, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(pre, { clientX: 100, clientY: 100 }) // deltaX = -100 (通常ならスワイプ判定される量)

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('still swipes when starting on an element whose scrollWidth exceeds clientWidth but overflow-x is not scrollable', () => {
    // overflow-xがvisible(既定)のままだと、要素自体は横スクロール領域として機能しない
    // ため、スワイプを妨げてはならない
    const onSwipeRight = vi.fn()
    render(
      <SwipeContainer onSwipeRight={onSwipeRight}>
        <div data-testid="overflowing-but-not-scrollable">はみ出すが横スクロールはしない要素</div>
      </SwipeContainer>,
    )

    const el = screen.getByTestId('overflowing-but-not-scrollable')
    Object.defineProperty(el, 'scrollWidth', { value: 2000, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true })

    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 180, clientY: 100 })

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })
})
