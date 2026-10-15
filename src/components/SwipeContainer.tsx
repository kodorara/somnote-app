import { useRef, type PointerEvent, type ReactNode } from 'react'

interface Props {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
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
  children,
  className,
  threshold = 50,
}: Props) {
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const isExcluded = useRef<boolean>(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
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
      isExcluded.current = true
      return
    }

    isExcluded.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isExcluded.current || !startPos.current) {
      startPos.current = null
      return
    }

    const deltaX = e.clientX - startPos.current.x
    const deltaY = e.clientY - startPos.current.y
    startPos.current = null

    // 縦スクロールと判定される場合はスワイプをキャンセル
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return
    }

    if (deltaX < -threshold) {
      // 左スワイプ（画面を右から左へ払う）
      onSwipeLeft?.()
    } else if (deltaX > threshold) {
      // 右スワイプ（画面を左から右へ払う）
      onSwipeRight?.()
    }
  }

  const handlePointerCancel = () => {
    startPos.current = null
    isExcluded.current = false
  }

  return (
    <div
      ref={rootRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      data-testid="swipe-container"
    >
      {children}
    </div>
  )
}
