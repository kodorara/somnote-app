import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

describe('PullToRefresh', () => {
  it('does not show indicator when not pulling or refreshing', () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    expect(screen.queryByText('引っ張って同期')).not.toBeInTheDocument()
    expect(screen.queryByText('離して同期')).not.toBeInTheDocument()
    expect(screen.queryByText('同期中...')).not.toBeInTheDocument()
  })

  it('resets pullDistance when the tab becomes hidden mid-gesture (notification/app switch interrupts the touch)', () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} threshold={40}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientY: 100 })
    fireEvent.pointerMove(container, { clientY: 140 })
    expect(screen.getByText('引っ張って同期')).toBeInTheDocument()

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.queryByText('引っ張って同期')).not.toBeInTheDocument()

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('does not deadlock gestureLockRef at "vertical" when isPulling never started (scrollTop > 2) but SwipeContainer claimed the vertical lock', () => {
    // scrollTop > 2(または disabled)のため isPulling.current が false のままだと、
    // 従来はhandlePointerUpの「if (!isPulling.current) return」で早期終了し、
    // SwipeContainerが立てた'vertical'ロックを解放できず、以降の横スワイプ・
    // 長押しが全てブロックされる(デッドロック)不具合があった。
    const gestureLockRef = { current: 'none' as 'none' | 'horizontal' | 'vertical' }
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} gestureLockRef={gestureLockRef}>
        <div className="col-notes" data-scroll-top="3">
          コンテンツ
        </div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')
    const scrollable = container.querySelector('.col-notes') as HTMLElement
    Object.defineProperty(scrollable, 'scrollTop', { value: 3, configurable: true })

    fireEvent.pointerDown(scrollable, { clientY: 100 })
    // SwipeContainer側が縦スクロールと判定し、共有ロックを'vertical'にした状態を模す
    gestureLockRef.current = 'vertical'
    fireEvent.pointerUp(scrollable, { clientY: 140 })

    expect(gestureLockRef.current).toBe('none')
  })

  it('clears a stale "vertical" gestureLockRef on the next pointerdown', () => {
    const gestureLockRef = { current: 'vertical' as 'none' | 'horizontal' | 'vertical' }
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} gestureLockRef={gestureLockRef}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientY: 100 })

    expect(gestureLockRef.current).toBe('none')
  })

  it('shows pulling indicators as dragged down and calls onRefresh on release beyond threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <PullToRefresh onRefresh={onRefresh} isRefreshing={false} threshold={40}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )

    const container = screen.getByTestId('pull-to-refresh')

    // 下方向に少しドラッグ (deltaY = 40, distance = 20 < 40)
    fireEvent.pointerDown(container, { clientY: 100 })
    fireEvent.pointerMove(container, { clientY: 140 })
    expect(screen.getByText('引っ張って同期')).toBeInTheDocument()

    // さらにドラッグして閾値超え (deltaY = 100, distance = 50 >= 40)
    fireEvent.pointerMove(container, { clientY: 200 })
    expect(screen.getByText('離して同期')).toBeInTheDocument()

    // 離す -> onRefresh 実行
    await act(async () => {
      fireEvent.pointerUp(container)
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not trigger onRefresh if released below threshold', () => {
    const onRefresh = vi.fn()
    render(
      <PullToRefresh onRefresh={onRefresh} isRefreshing={false} threshold={40}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )

    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientY: 100 })
    fireEvent.pointerMove(container, { clientY: 140 }) // distance = 20 < 40
    fireEvent.pointerUp(container)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('shows refreshing state when isRefreshing is true', () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={true}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('同期中...')).toBeInTheDocument()
  })

  it('suppresses pull indicator when horizontal drag is dominant (deltaX > deltaY)', () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    // 斜めだが横優勢 (deltaX = 80, deltaY = 30)
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 180, clientY: 130 })

    expect(screen.queryByText('引っ張って同期')).not.toBeInTheDocument()
    expect(screen.queryByText('離して同期')).not.toBeInTheDocument()
  })

  it('respects gestureLockRef and ignores pull when locked to horizontal', () => {
    const lockRef = { current: 'horizontal' as const }
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} gestureLockRef={lockRef}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 100, clientY: 200 })

    expect(screen.queryByText('引っ張って同期')).not.toBeInTheDocument()
    expect(screen.queryByText('離して同期')).not.toBeInTheDocument()
  })

  it('updates gestureLockRef to vertical during vertical pull and resets to none on release', () => {
    const lockRef = { current: 'none' as const }
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} gestureLockRef={lockRef}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 100, clientY: 150 })
    expect(lockRef.current).toBe('vertical')

    fireEvent.pointerUp(container)
    expect(lockRef.current).toBe('none')
  })

  it('does not reset gestureLockRef on release if locked by another gesture (horizontal)', () => {
    const lockRef = { current: 'horizontal' as const }
    render(
      <PullToRefresh onRefresh={vi.fn()} isRefreshing={false} gestureLockRef={lockRef}>
        <div>コンテンツ</div>
      </PullToRefresh>,
    )
    const container = screen.getByTestId('pull-to-refresh')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(container)

    expect(lockRef.current).toBe('horizontal')
  })
})
