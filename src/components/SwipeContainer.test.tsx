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

  it('allows a swipe starting on a textarea when the gesture begins near the screen edge (edge-swipe)', () => {
    // メモ編集画面ではtextareaがほぼ全面を占めるため、画面端からのジェスチャーだけは
    // textarea上であってもスワイプとして扱う(通常のテキスト選択と衝突しないよう、
    // 画面端ちょうどから始まる操作に限定している)
    const onSwipeLeft = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft}>
        <textarea aria-label="メモ本文" defaultValue="入力テキスト" />
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, width: 400 } as DOMRect)
    const textarea = screen.getByRole('textbox')

    fireEvent.pointerDown(textarea, { clientX: 390, clientY: 100 }) // 右端から10px
    fireEvent.pointerUp(textarea, { clientX: 300, clientY: 100 }) // deltaX = -90

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })

  it('still ignores a textarea gesture that does not start near the screen edge', () => {
    const onSwipeLeft = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={onSwipeLeft}>
        <textarea aria-label="メモ本文" defaultValue="入力テキスト" />
      </SwipeContainer>,
    )

    const container = screen.getByTestId('swipe-container')
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 400, width: 400 } as DOMRect)
    const textarea = screen.getByRole('textbox')

    fireEvent.pointerDown(textarea, { clientX: 200, clientY: 100 }) // 画面中央
    fireEvent.pointerUp(textarea, { clientX: 100, clientY: 100 })

    expect(onSwipeLeft).not.toHaveBeenCalled()
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

  it('updates --drag-offset CSS variable and adds .is-dragging class during pointermove', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 150, clientY: 100 })

    expect(container.style.getPropertyValue('--drag-offset')).toBe('50px')
    expect(container).toHaveClass('is-dragging')

    fireEvent.pointerUp(container, { clientX: 150, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('stops tracking and resets --drag-offset if vertical scroll becomes dominant during pointermove', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    // まず横に少し動かす
    fireEvent.pointerMove(container, { clientX: 120, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('20px')
    expect(container).toHaveClass('is-dragging')

    // 縦スクロール優勢に動かす (deltaX=20, deltaY=60)
    fireEvent.pointerMove(container, { clientX: 120, clientY: 160 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')

    // 以降の横移動でも追従しない
    fireEvent.pointerMove(container, { clientX: 200, clientY: 160 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
  })

  it('releases pointer capture when vertical scroll becomes dominant during pointermove', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    const releasePointerCapture = vi.fn()
    container.releasePointerCapture = releasePointerCapture

    fireEvent.pointerDown(container, { pointerId: 42, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { pointerId: 42, clientX: 105, clientY: 180 }) // 縦スクロール優勢

    expect(releasePointerCapture).toHaveBeenCalledWith(42)
  })

  it('resets --drag-offset and removes .is-dragging on pointercancel', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('60px')

    fireEvent.pointerCancel(container)
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('dampens offset when dragging beyond boundaries (canSwipeLeft/Right is false)', () => {
    // 右方向(戻る画面がない: canSwipeRight=false)へのドラッグ
    const { rerender } = render(
      <SwipeContainer onSwipeLeft={vi.fn()} canSwipeRight={false}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 200, clientY: 100 }) // rawDeltaX = +100
    // 0.2倍に減衰される (100 * 0.2 = 20px)
    expect(container.style.getPropertyValue('--drag-offset')).toBe('20px')

    fireEvent.pointerUp(container, { clientX: 200, clientY: 100 })

    // 左方向(進む画面がない: canSwipeLeft=false)へのドラッグ
    rerender(
      <SwipeContainer onSwipeRight={vi.fn()} canSwipeLeft={false}>
        <div>Content</div>
      </SwipeContainer>,
    )
    fireEvent.pointerDown(container, { clientX: 200, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 100, clientY: 100 }) // rawDeltaX = -100
    // 0.2倍に減衰される (-100 * 0.2 = -20px)
    expect(container.style.getPropertyValue('--drag-offset')).toBe('-20px')
  })
})
