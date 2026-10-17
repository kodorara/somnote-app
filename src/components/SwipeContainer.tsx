import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import type { GestureLockRef } from '../lib/gestureLock'

interface Props {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  canSwipeLeft?: boolean
  canSwipeRight?: boolean
  gestureLockRef?: GestureLockRef
  children: ReactNode
  className?: string
  threshold?: number
}

// メモ編集画面では本文欄(textarea)がほぼ画面全体を占め、スワイプを始める「掴める場所」が
// どこにも残らない。textarea自体はテキスト選択との衝突を避けるため除外対象のままにしつつ、
// 画面の端(この幅の範囲)から始まるジェスチャーだけは、textarea上であってもスワイプとして
// 扱う(iOS等の「エッジスワイプで戻る」と同じ考え方。通常のテキスト選択はここまで厳密に
// 画面端から始まることはまず無いため衝突しない)。
const EDGE_ZONE_PX = 24

// 指の動きがこの範囲内であれば「ドラッグではなくタップだった」とみなす許容量。
// NoteList/FolderList等の既存のMOVE_CANCEL_PXと同じ考え方の値。
const TAP_TOLERANCE_PX = 10

// targetからroot(SwipeContainer自身)までの祖先を辿り、横方向にスクロール可能な
// 要素(コードブロックや幅の広い表など)があるかを調べる。固定クラス名のホワイト
// リストと違い、将来追加されるどんな横スクロール要素にも後付け対応不要で効く。
function hasHorizontallyScrollableAncestor(target: HTMLElement | null, root: HTMLElement | null): boolean {
  let node: HTMLElement | null = target
  while (node && node !== root) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

export function SwipeContainer({
  onSwipeLeft,
  onSwipeRight,
  canSwipeLeft,
  canSwipeRight,
  gestureLockRef,
  children,
  className,
  threshold = 50,
}: Props) {
  const activePointerId = useRef<number | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef<boolean>(false)
  const isVerticalScroll = useRef<boolean>(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // pointerdown時点でのe.target(Pointer Captureで後から上書きされる前の、本来の
  // タップ先)を覚えておく。ドラッグもスクロールも成立しなかった(=タップだった)
  // 場合に、ここへ手動でclickを転送する(詳細はhandlePointerUp参照)。
  const tapTargetRef = useRef<HTMLElement | null>(null)

  const prevClassNameRef = useRef(className)

  // 画面遷移(className変更)時に、ドラッグ状態やCSS変数が残存しないよう確実にクリーンアップ
  useEffect(() => {
    if (prevClassNameRef.current !== className) {
      prevClassNameRef.current = className
      rootRef.current?.style.setProperty('--drag-offset', '0px')
      rootRef.current?.classList.remove('is-dragging')
      isDragging.current = false
      isVerticalScroll.current = false
      startPos.current = null
      activePointerId.current = null
      tapTargetRef.current = null
    }
  }, [className])

  const resolveCanSwipe = () => ({
    canLeft: canSwipeLeft ?? !!onSwipeLeft,
    canRight: canSwipeRight ?? !!onSwipeRight,
  })

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // 既に別の指のジェスチャーが進行中であれば2本目以降は無視する
    if (activePointerId.current !== null) return

    const rect = rootRef.current?.getBoundingClientRect()
    // rect.width === 0(レイアウト未計算。テスト環境のjsdom等)の場合は、端からの
    // 距離を正しく判定できないため、安全側に倒してエッジスワイプ扱いしない
    const nearEdge =
      !!rect && rect.width > 0 && (e.clientX - rect.left <= EDGE_ZONE_PX || rect.right - e.clientX <= EDGE_ZONE_PX)

    // フォーム入力要素やドラッグハンドル、横スクロール可能な要素上での操作は
    // スワイプから除外する。ただし画面端からのジェスチャーはエッジスワイプとして
    // 常に許可する(上のEDGE_ZONE_PXの説明を参照)。
    const target = e.target as HTMLElement | null
    if (
      !nearEdge &&
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('.folder-drag-handle') ||
        target.closest('.action-bar-btn') ||
        target.closest('.action-bar-select') ||
        hasHorizontallyScrollableAncestor(target, rootRef.current))
    ) {
      return
    }

    activePointerId.current = e.pointerId
    startPos.current = { x: e.clientX, y: e.clientY }
    isDragging.current = false
    isVerticalScroll.current = false
    tapTargetRef.current = target

    // Pointer Captureはpointerdownの時点で即座に取得する。横方向の意図が確定して
    // からに遅らせる案を一度試したが、実機では横スワイプによるページ切り替えその
    // ものが効かなくなる改悪を引き起こした(ネイティブのスクロール/ジェスチャー
    // 判定に先に奪われてしまい、後から取得しても間に合わないと見られる)。その
    // ため取得自体は即座に行い、タップの握り潰され対策はhandlePointerUp側で
    // 元のタップ先へclickを手動転送する方式に切り替えた。
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // jsdom等の未実装環境対策
      }
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerId.current) return
    if (!startPos.current || isVerticalScroll.current) return
    if (gestureLockRef?.current === 'vertical') return // PullToRefresh側が既に確定済み

    const rawDeltaX = e.clientX - startPos.current.x
    const deltaY = e.clientY - startPos.current.y

    // 縦スクロールと判定される場合はスワイプをキャンセルし、オフセットをリセット
    if (Math.abs(deltaY) > Math.abs(rawDeltaX)) {
      isVerticalScroll.current = true
      if (gestureLockRef) gestureLockRef.current = 'vertical'
      if (isDragging.current) {
        rootRef.current?.style.setProperty('--drag-offset', '0px')
        rootRef.current?.classList.remove('is-dragging')
        isDragging.current = false
      }
      if (typeof e.currentTarget.releasePointerCapture === 'function') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // jsdom等の未実装環境対策
        }
      }
      return
    }

    if (!isDragging.current) {
      isDragging.current = true
      if (gestureLockRef) gestureLockRef.current = 'horizontal'
      rootRef.current?.classList.add('is-dragging')
    }

    const { canLeft, canRight } = resolveCanSwipe()
    let deltaX = rawDeltaX

    // 境界外へのスワイプ(左画面がないのに右ドラッグ、または右画面がないのに左ドラッグ)はゴム状に減衰
    if (deltaX < 0 && !canLeft) {
      deltaX = deltaX * 0.2
    } else if (deltaX > 0 && !canRight) {
      deltaX = deltaX * 0.2
    }

    rootRef.current?.style.setProperty('--drag-offset', `${deltaX}px`)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null

    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // jsdom等の未実装環境対策
      }
    }

    if (!startPos.current) {
      isDragging.current = false
      isVerticalScroll.current = false
      tapTargetRef.current = null
      rootRef.current?.style.setProperty('--drag-offset', '0px')
      rootRef.current?.classList.remove('is-dragging')
      return
    }

    const deltaX = e.clientX - startPos.current.x
    const deltaY = e.clientY - startPos.current.y
    const wasVertical = isVerticalScroll.current
    const wasDragging = isDragging.current
    const tapTarget = tapTargetRef.current
    startPos.current = null
    isDragging.current = false
    isVerticalScroll.current = false
    tapTargetRef.current = null

    // 指を離した瞬間にオフセットを0に戻し、transitionによるスナップまたはスナップバックを発動させる
    rootRef.current?.style.setProperty('--drag-offset', '0px')
    rootRef.current?.classList.remove('is-dragging')
    if (gestureLockRef?.current === 'horizontal') gestureLockRef.current = 'none'

    // ドラッグもスクロールも成立しなかった(=タップだった)場合、Pointer Captureに
    // よってclickイベントの配送先が本来の要素(メモ行のボタン等)からこの祖先要素へ
    // 奪われてしまっているため、本来のタップ先へ手動でclickを転送する。これにより
    // 複数選択モード中の2件目以降のタップ等、子要素のonClickに依存する機能が
    // Pointer Captureによって握り潰されずに機能する。
    if (!wasDragging && !wasVertical && tapTarget && Math.hypot(deltaX, deltaY) <= TAP_TOLERANCE_PX) {
      tapTarget.click()
    }

    if (wasVertical || Math.abs(deltaY) > Math.abs(deltaX)) {
      return
    }

    const { canLeft, canRight } = resolveCanSwipe()

    if (deltaX < -threshold && canLeft) {
      // 左スワイプ（画面を右から左へ払う）
      onSwipeLeft?.()
    } else if (deltaX > threshold && canRight) {
      // 右スワイプ（画面を左から右へ払う）
      onSwipeRight?.()
    }
  }

  const handlePointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== undefined && activePointerId.current !== null && e.pointerId !== activePointerId.current) {
      return
    }
    activePointerId.current = null

    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // jsdom等の未実装環境対策
      }
    }
    startPos.current = null
    isDragging.current = false
    isVerticalScroll.current = false
    tapTargetRef.current = null
    rootRef.current?.style.setProperty('--drag-offset', '0px')
    rootRef.current?.classList.remove('is-dragging')
    if (gestureLockRef?.current === 'horizontal') gestureLockRef.current = 'none'
  }

  return (
    <div
      ref={rootRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      data-testid="swipe-container"
    >
      {children}
    </div>
  )
}
