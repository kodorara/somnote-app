import { useState, useRef, type PointerEvent, type ReactNode } from 'react'
import { RefreshIcon } from './icons'

interface Props {
  onRefresh: () => Promise<void> | void
  isRefreshing: boolean
  disabled?: boolean
  children: ReactNode
  className?: string
  threshold?: number
}

export function PullToRefresh({
  onRefresh,
  isRefreshing,
  disabled = false,
  children,
  className = '',
  threshold = 60,
}: Props) {
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  const isPulling = useRef(false)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing) return
    // スクロール可能な子要素でスクロール位置が0でない場合はプルトゥリフレッシュを開始しない
    const target = e.target as HTMLElement | null
    if (target) {
      const scrollParent = target.closest(
        '.col-folders, .col-notes, .col-editor, .folder-list, .note-list, .preview',
      )
      if (scrollParent && scrollParent.scrollTop > 0) {
        return
      }
    }
    startY.current = e.clientY
    isPulling.current = true
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isPulling.current || startY.current === null || isRefreshing || disabled) return
    const deltaY = e.clientY - startY.current
    if (deltaY > 0) {
      // 抵抗感を持たせるため 0.5 の減衰係数をかける (最大 90px)
      const distance = Math.min(deltaY * 0.5, 90)
      setPullDistance(distance)
    } else {
      setPullDistance(0)
    }
  }

  const handlePointerUp = async () => {
    if (!isPulling.current) return
    isPulling.current = false
    startY.current = null

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
    setPullDistance(0)
  }

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
