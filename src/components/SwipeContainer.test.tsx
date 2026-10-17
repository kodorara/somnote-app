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

  it('ignores subsequent touches when multi-touch occurs during an active gesture', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    // 1本目の指（pointerId: 1）が触れて動く
    fireEvent.pointerDown(container, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 150, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('50px')

    // 2本目の指（pointerId: 2）が同時に触れても無視される
    fireEvent.pointerDown(container, { pointerId: 2, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(container, { pointerId: 2, clientX: 300, clientY: 200 })
    // 1本目の指のオフセットが維持されている
    expect(container.style.getPropertyValue('--drag-offset')).toBe('50px')

    // 1本目の指を離すとリセットされる
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 150, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
  })

  it('respects gestureLockRef and ignores drag when locked to vertical', () => {
    const lockRef = { current: 'vertical' as const }
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()} gestureLockRef={lockRef}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })

    expect(container.style.getPropertyValue('--drag-offset')).toBe('')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('updates gestureLockRef to horizontal during horizontal drag and resets to none on release', () => {
    const lockRef = { current: 'none' as const }
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()} gestureLockRef={lockRef}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    expect(lockRef.current).toBe('horizontal')

    fireEvent.pointerUp(container, { clientX: 160, clientY: 100 })
    expect(lockRef.current).toBe('none')
  })

  it('resets --drag-offset and removes .is-dragging on lostpointercapture', () => {
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('60px')
    expect(container).toHaveClass('is-dragging')

    fireEvent.lostPointerCapture(container)
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('resets --drag-offset when className changes (screen transition)', () => {
    const { rerender } = render(
      <SwipeContainer className="columns mobile-notes" onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('60px')

    rerender(
      <SwipeContainer className="columns mobile-folders" onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('resets --drag-offset when the tab becomes hidden mid-gesture (notification/app switch interrupts the touch)', () => {
    // 指を触れたままタブが非表示になると、OS/ブラウザがpointerup/pointercancelを
    // 一切発火させないまま中断することがある。この場合--drag-offsetが固着し、
    // 再び開いた時に内容が画面端からはみ出して表示される不具合になっていた。
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    expect(container.style.getPropertyValue('--drag-offset')).toBe('60px')
    expect(container).toHaveClass('is-dragging')

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(container.style.getPropertyValue('--drag-offset')).toBe('0px')
    expect(container).not.toHaveClass('is-dragging')

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('does not reset gestureLockRef on release if locked by another gesture (vertical)', () => {
    const lockRef = { current: 'vertical' as const }
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()} gestureLockRef={lockRef}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 160, clientY: 100 })
    fireEvent.pointerUp(container, { clientX: 160, clientY: 100 })

    expect(lockRef.current).toBe('vertical')
  })

  it('acquires pointer capture immediately on pointerdown (needed so real swipes are not stolen by native scrolling)', () => {
    // 一度「ドラッグ確定まで取得を遅らせる」案を試したが、実機では横スワイプによる
    // ページ切り替えそのものが効かなくなる改悪を引き起こしたため、取得自体は
    // pointerdown時点で即座に行う(タップの握り潰され対策は別の仕組みで行う。
    // 下記の「手動でclickを転送する」テストを参照)。
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')
    const setPointerCapture = vi.fn()
    container.setPointerCapture = setPointerCapture

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })

    expect(setPointerCapture).toHaveBeenCalledTimes(1)
  })

  it('manually dispatches a click to the originally-touched element when the gesture resolves to a quick tap', () => {
    // Pointer Captureを即座に取得すると、以降のpointerup/clickイベントの配送先が
    // 本来タップされた子要素からこの祖先要素に奪われてしまう(実機のみで再現する
    // 既知のブラウザ挙動)。ドラッグもスクロールも成立しなかった場合は、本来の
    // タップ先へ手動でclickを転送することで、子要素のonClickに依存する機能
    // (複数選択モードでのタップ選択等)が握り潰されないようにしている。
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>Row</button>
      </SwipeContainer>,
    )
    const button = screen.getByRole('button', { name: 'Row' })

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(button, { clientX: 102, clientY: 101 }) // 1〜2pxの微小なブレのみ

    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('does not manually dispatch a click when the gesture became a horizontal drag', () => {
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>Row</button>
      </SwipeContainer>,
    )
    const button = screen.getByRole('button', { name: 'Row' })

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(button, { clientX: 140, clientY: 100 }) // 横方向への明確なドラッグ
    fireEvent.pointerUp(button, { clientX: 140, clientY: 100 })

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('does not manually dispatch a click when the gesture became a vertical scroll', () => {
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>Row</button>
      </SwipeContainer>,
    )
    const button = screen.getByRole('button', { name: 'Row' })

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(button, { clientX: 105, clientY: 150 }) // 縦方向への明確なスクロール
    fireEvent.pointerUp(button, { clientX: 105, clientY: 150 })

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('does not lock a direction (or move --drag-offset) for sub-deadzone jitter', () => {
    // 指の腹が潰れることによる1〜数pxの微動だけで、誤って縦/横の方向を
    // 確定させてしまわないよう、一定の遊び(デッドゾーン)を設けている。
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 103, clientY: 102 }) // hypot ≈ 3.6px (<6px)

    expect(container.style.getPropertyValue('--drag-offset')).toBe('')
    expect(container).not.toHaveClass('is-dragging')
  })

  it('still manually dispatches a click when a jittery gesture exceeded the deadzone mid-way but settled back near the start', () => {
    // デッドゾーンを一瞬超えて方向ロックされても(wasDragging/wasVerticalがtrueに
    // なっても)、最終的に指がほぼ元の位置に戻って離された場合は、タップとして
    // clickを転送する(指の震えで本来のタップが握り潰されないようにするため)。
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>Row</button>
      </SwipeContainer>,
    )
    const button = screen.getByRole('button', { name: 'Row' })

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(button, { clientX: 108, clientY: 100 }) // デッドゾーン(6px)を超えて横ロック
    fireEvent.pointerUp(button, { clientX: 101, clientY: 100 }) // 最終的にほぼ元の位置へ戻って離す

    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch a click when a large swipe was cancelled back near the start (max distance exceeded tolerance)', () => {
    // 正味の移動量だけで判定すると、大きく横にドラッグして画面をめくろうとした後、
    // 指を開始位置付近まで戻してキャンセルした場合にも誤ってタップ扱いされ、
    // 意図せずメモ/フォルダが開いてしまう。ジェスチャー中の最大移動距離も見て防ぐ。
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>Row</button>
      </SwipeContainer>,
    )
    const button = screen.getByRole('button', { name: 'Row' })

    fireEvent.pointerDown(button, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(button, { clientX: 180, clientY: 100 }) // 80px大きくドラッグ
    fireEvent.pointerUp(button, { clientX: 102, clientY: 100 }) // 開始位置付近まで戻してキャンセル

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('resolves a clickable ancestor when the tap target is an SVG element without its own click() support', () => {
    // タップ先がSVG(アイコン)の内部要素だった場合、環境によってはclick()メソッドを
    // 持たないことがあるため、呼び出し可能な最も近い祖先(ボタン等)にフォールバックする。
    const onRowClick = vi.fn()
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()}>
        <button onClick={onRowClick}>
          <svg>
            <path data-testid="icon-path" />
          </svg>
        </button>
      </SwipeContainer>,
    )
    const path = screen.getByTestId('icon-path')
    // SVGElementにはclick()が無い環境を模す
    Object.defineProperty(path, 'click', { value: undefined, configurable: true })

    fireEvent.pointerDown(path, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(path, { clientX: 101, clientY: 100 })

    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('preserves vertical gestureLockRef when lostpointercapture fires after vertical move', () => {
    const lockRef = { current: 'none' as const }
    render(
      <SwipeContainer onSwipeLeft={vi.fn()} onSwipeRight={vi.fn()} gestureLockRef={lockRef}>
        <div>Content</div>
      </SwipeContainer>,
    )
    const container = screen.getByTestId('swipe-container')

    // 下方向優勢なポインタ移動(deltaY = 50 > deltaX = 10)
    // SwipeContainerはvertical判定し、lockRef.current = 'vertical'にし、releasePointerCaptureを呼ぶ
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(container, { clientX: 110, clientY: 150 })
    expect(lockRef.current).toBe('vertical')

    // releasePointerCaptureによってlostpointercaptureが発火
    fireEvent(container, new Event('lostpointercapture', { bubbles: true }))

    // lockRef.currentが'vertical'のまま保持されていること(横方向のみ解除するガードが効いている)
    expect(lockRef.current).toBe('vertical')
  })
})
