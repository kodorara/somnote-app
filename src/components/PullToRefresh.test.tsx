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
})
