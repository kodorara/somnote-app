import { useState, useRef, useEffect, type PointerEvent, type ReactNode } from 'react'
import type { GestureLockRef } from '../lib/gestureLock'
import { RefreshIcon } from './icons'

interface Props {
  onRefresh: () => Promise<void> | void
  isRefreshing: boolean
  disabled?: boolean
  gestureLockRef?: GestureLockRef
  children: ReactNode
  className?: string
  threshold?: number
}

export function PullToRefresh({
  onRefresh,
  isRefreshing,
  disabled = false,
  gestureLockRef,
  children,
  className = '',
  threshold = 60,
}: Props) {
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  const startX = useRef<number | null>(null)
  const isPulling = useRef(false)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing) return
    // スクロール可能な子要素でスクロール位置が0でない場合はプルトゥリフレッシュを開始しない
    const target = e.target as HTMLElement | null
    if (target) {
      const scrollParent = target.closest(
        '.col-folders, .col-notes, .col-editor, .folder-list, .note-list, .preview',
      )
      if (scrollParent && scrollParent.scrollTop > 2) {
        return
      }
    }
    startY.current = e.clientY
    startX.current = e.clientX
    isPulling.current = true
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isPulling.current || startY.current === null || isRefreshing || disabled) return
    if (gestureLockRef?.current === 'horizontal') return // SwipeContainer側が既に確定済み

    const deltaY = e.clientY - startY.current
    const deltaX = startX.current !== null ? e.clientX - startX.current : 0

    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      // 下方向優勢でない、または横優勢 → 引っ張りとして扱わない
      setPullDistance(0)
      return
    }

    if (gestureLockRef) gestureLockRef.current = 'vertical'
    const distance = Math.min(deltaY * 0.5, 90)
    setPullDistance(distance)
  }

  const handlePointerUp = async () => {
    if (!isPulling.current) return
    isPulling.current = false
    startY.current = null
    startX.current = null
    if (gestureLockRef?.current === 'vertical') gestureLockRef.current = 'none'

    if (pullDistance >= threshold && !isRefreshing && !disabled) {
      setPullDistance(threshold)
      try {
        await onRefresh()
      } finally {
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }

  const handlePointerCancel = () => {
    isPulling.current = false
    startY.current = null
    startX.current = null
    setPullDistance(0)
    if (gestureLockRef?.current === 'vertical') gestureLockRef.current = 'none'
  }

  // 指を触れたままタブが非表示になる(通知を開く・他アプリへの切り替え・画面ロック等)と、
  // pointerup/pointercancelが発火しないまま中断され、引っ張りインジケータが表示されたまま
  // 固着することがある(SwipeContainer側の--drag-offset固着と同種の問題)。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        isPulling.current = false
        startY.current = null
        startX.current = null
        setPullDistance(0)
        if (gestureLockRef?.current === 'vertical') gestureLockRef.current = 'none'
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showIndicator = pullDistance > 0 || isRefreshing
  const reached = pullDistance >= threshold

  return (
    <div
      className={`pull-to-refresh-container ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      data-testid="pull-to-refresh"
    >
      {showIndicator && (
        <div
          className="pull-to-refresh-indicator"
          style={{ height: `${isRefreshing ? 48 : pullDistance}px` }}
          aria-live="polite"
        >
          <div className="pull-to-refresh-content">
            <RefreshIcon
              size={18}
              className={`pull-refresh-icon ${isRefreshing ? 'is-spinning' : ''} ${reached ? 'is-ready' : ''}`}
            />
            <span className="pull-refresh-text">
              {isRefreshing ? '同期中...' : reached ? '離して同期' : '引っ張って同期'}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
