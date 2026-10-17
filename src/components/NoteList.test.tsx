import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NoteList } from './NoteList'

const notes = [
  {
    id: 'a', title: '後で書いたメモ', seq: 1,
    createdAt: '2026-10-11T00:00:00+09:00', updatedAt: '2026-10-12T10:00:00+09:00',
    tags: ['日記'], deleted: false,
  },
  {
    id: 'b', title: '先に書いたメモ', seq: 0,
    createdAt: '2026-10-10T00:00:00+09:00', updatedAt: '2026-10-09T10:00:00+09:00',
    tags: [], deleted: false,
  },
  {
    id: 'c', title: 'ゴミ箱入り', seq: 2,
    createdAt: '2026-10-09T00:00:00+09:00', updatedAt: '2026-10-08T10:00:00+09:00',
    tags: [], deleted: true,
  },
]

const defaultProps = { selectedId: null, onSelect: () => {}, tagFilter: null, wordFilter: '', sortBy: 'seq' as const }

describe('NoteList', () => {
  it('renders notes sorted by seq by default, excluding deleted notes', () => {
    render(<NoteList {...defaultProps} notes={notes} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('先に書いたメモ')
    expect(items[1]).toHaveTextContent('後で書いたメモ')
    expect(screen.queryByText('ゴミ箱入り')).not.toBeInTheDocument()
  })

  it('sorts by createdAt descending when sortBy is createdDesc', () => {
    render(<NoteList {...defaultProps} notes={notes} sortBy="createdDesc" />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('後で書いたメモ') // created 10/11, newest
    expect(items[1]).toHaveTextContent('先に書いたメモ') // created 10/10
  })

  it('sorts by updatedAt ascending when sortBy is updatedAsc', () => {
    render(<NoteList {...defaultProps} notes={notes} sortBy="updatedAsc" />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('先に書いたメモ') // updated 10/09, oldest
    expect(items[1]).toHaveTextContent('後で書いたメモ') // updated 10/12
  })

  it('filters by tag when tagFilter is set', () => {
    render(<NoteList {...defaultProps} notes={notes} tagFilter="日記" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('後で書いたメモ')).toBeInTheDocument()
  })

  it('filters by a word in the title, case-insensitively', () => {
    render(<NoteList {...defaultProps} notes={notes} wordFilter="先に" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('先に書いたメモ')
  })

  it('calls onSelect when a note is clicked', () => {
    const onSelect = vi.fn()
    render(<NoteList {...defaultProps} notes={notes} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('先に書いたメモ'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('shows the created and updated dates for each note', () => {
    render(<NoteList {...defaultProps} notes={notes} />)
    const items = screen.getAllByRole('listitem')
    // 先に書いたメモ: created 2026-10-10, updated 2026-10-09
    expect(items[0]).toHaveTextContent('作成 2026/10/10')
    expect(items[0]).toHaveTextContent('編集 2026/10/09')
  })

  it('highlights matched query in note title', () => {
    const { container } = render(<NoteList {...defaultProps} notes={notes} highlightQuery="メモ" />)
    const marks = container.querySelectorAll('.note-title mark.search-highlight')
    expect(marks).toHaveLength(2)
    expect(marks[0].textContent).toBe('メモ')
  })

  describe('multi-select (long-press)', () => {
    const longPress = (el: Element, x = 100, y = 100) => {
      fireEvent.pointerDown(el, { clientX: x, clientY: y })
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      fireEvent.pointerUp(el, { clientX: x, clientY: y })
    }
    // 実機では必ずpointerdown→pointerup→clickの順で発火する(短いタップ)。
    // fireEvent.clickだけを直接呼ぶと、直前の別要素での長押しフラグが
    // リセットされないまま残ってしまい、実際のブラウザ挙動と食い違う。
    const tap = (el: Element, x = 100, y = 100) => {
      fireEvent.pointerDown(el, { clientX: x, clientY: y })
      fireEvent.pointerUp(el, { clientX: x, clientY: y })
      fireEvent.click(el)
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const folders = [
      { folderId: 'f2', name: 'プライベート', seq: 1, color: 'green' },
      { folderId: 'f1', name: '仕事', seq: 0, color: 'blue' },
    ]

    it('enters multi-select mode on long-press and shows the bulk action bar with a count', () => {
      const onSelect = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} onSelect={onSelect} folders={folders} />)
      longPress(screen.getByText('先に書いたメモ'))

      expect(screen.getByText('1件選択中')).toBeInTheDocument()
      expect(onSelect).not.toHaveBeenCalled() // 長押しは通常のメモを開く操作を発火させない
    })

    it('toggles selection on tap while already in multi-select mode, without opening the note', () => {
      const onSelect = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} onSelect={onSelect} folders={folders} />)
      longPress(screen.getByText('先に書いたメモ'))
      tap(screen.getByText('後で書いたメモ'))

      expect(screen.getByText('2件選択中')).toBeInTheDocument()
      expect(onSelect).not.toHaveBeenCalled()

      // もう一度タップすると選択解除される
      tap(screen.getByText('後で書いたメモ'))
      expect(screen.getByText('1件選択中')).toBeInTheDocument()
    })

    it('resets a stale tapHandledRef on the next pointerdown so a later click-only tap is not swallowed', () => {
      // ジェスチャーAでpointerup時点でtapHandledRef=trueになったが、後続のclickが
      // 届かなかった(実機ではSwipeContainerが縦スクロールと判定しclick転送を
      // 見送った場合等)とき、このフラグが未消費のまま残っていた。修正前は、
      // 次のジェスチャーBでSwipeContainerから手動転送されたclickだけが届いても、
      // この残骸に引っかかって正常なタップが握り潰されていた。
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      longPress(screen.getByText('先に書いたメモ'))

      const row = screen.getByText('後で書いたメモ')
      // ジェスチャーA: pointerupでtapHandledRef=trueになるが、clickは発火しない
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(row, { clientX: 100, clientY: 100 })
      expect(screen.getByText('2件選択中')).toBeInTheDocument()

      // ジェスチャーB: 新しいpointerdownは実機でも必ず本来の要素に届くため発火
      // させるが、pointerupは祖先にPointer Captureされたまま届かず、
      // SwipeContainerからの手動click転送だけが届く状況を模す
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      fireEvent.click(row)

      expect(screen.getByText('1件選択中')).toBeInTheDocument()
    })

    it('lists the bulk-move folder options in seq order, matching the folder list screen', () => {
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      longPress(screen.getByText('先に書いたメモ'))

      const options = screen.getAllByRole('option') as HTMLOptionElement[]
      // 先頭はプレースホルダー、以降がseq順(仕事:0, プライベート:1)
      expect(options.map((o) => o.value)).toEqual(['', '仕事', 'プライベート'])
    })

    it('calls onBulkMove with the selected ids and chosen folder, then exits multi-select mode', () => {
      const onBulkMove = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} folders={folders} onBulkMove={onBulkMove} />)
      longPress(screen.getByText('先に書いたメモ'))
      tap(screen.getByText('後で書いたメモ'))

      fireEvent.change(screen.getByRole('combobox', { name: '選択したメモをフォルダ移動' }), {
        target: { value: 'プライベート' },
      })

      expect(onBulkMove).toHaveBeenCalledWith(expect.arrayContaining(['a', 'b']), 'プライベート')
      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument() // 実行後は選択解除される
    })

    it('calls onBulkDelete with the selected ids, then exits multi-select mode', () => {
      const onBulkDelete = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} folders={folders} onBulkDelete={onBulkDelete} />)
      longPress(screen.getByText('先に書いたメモ'))

      fireEvent.click(screen.getByRole('button', { name: '選択したメモをゴミ箱に移動' }))

      expect(onBulkDelete).toHaveBeenCalledWith(['b'])
      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
    })

    it('exits multi-select mode via the close button without calling bulk handlers', () => {
      const onBulkMove = vi.fn()
      const onBulkDelete = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} folders={folders} onBulkMove={onBulkMove} onBulkDelete={onBulkDelete} />)
      longPress(screen.getByText('先に書いたメモ'))

      fireEvent.click(screen.getByRole('button', { name: '選択を解除' }))

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
      expect(onBulkMove).not.toHaveBeenCalled()
      expect(onBulkDelete).not.toHaveBeenCalled()
    })

    it('does not enter multi-select mode when the shared gesture lock is held at timer expiry (scroll in progress)', () => {
      // 祖先のSwipeContainerがPointer Captureを保持している間、スクロール中でも
      // このコンポーネント自身のonPointerMoveに移動イベントが届かず、
      // clearLongPressTimerが呼ばれないことが実機で起きていた。発火の瞬間に
      // 共有ロックを見て、スワイプ/スクロールが確定していれば取り消す。
      const onSelect = vi.fn()
      const gestureLockRef = { current: 'vertical' as const }
      render(
        <NoteList
          {...defaultProps}
          notes={notes}
          onSelect={onSelect}
          folders={folders}
          gestureLockRef={gestureLockRef}
        />,
      )
      const row = screen.getByText('先に書いたメモ')
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      // スクロールにより指が離れた位置がpointerdown時と大きくズレている
      fireEvent.pointerUp(row, { clientX: 100, clientY: 160 })

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('cancels a pending long-press timer when a window scroll event fires (ancestor holds pointer capture so onPointerMove may not)', () => {
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      const row = screen.getByText('先に書いたメモ')
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })

      window.dispatchEvent(new Event('scroll'))

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      fireEvent.pointerUp(row, { clientX: 100, clientY: 100 })

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
    })

    it('does not enter multi-select mode on a quick tap (release before the long-press threshold)', () => {
      const onSelect = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} onSelect={onSelect} folders={folders} />)
      const row = screen.getByText('先に書いたメモ')
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      act(() => {
        vi.advanceTimersByTime(200) // 閾値(1500ms)未満
      })
      fireEvent.pointerUp(row, { clientX: 100, clientY: 100 })
      fireEvent.click(row)

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
      expect(onSelect).toHaveBeenCalledWith('b')
    })

    it('cancels the long-press when the pointer moves significantly before the threshold (scroll gesture)', () => {
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      const row = screen.getByText('先に書いたメモ')
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      fireEvent.pointerMove(row, { clientX: 100, clientY: 140 }) // 40px上下移動 → スクロール扱い
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      fireEvent.pointerUp(row, { clientX: 100, clientY: 140 })

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
    })

    it('offers multi-select in the trash view with only permanent delete action', () => {
      const onBulkPermanentDelete = vi.fn()
      const mixedNotes = [
        { id: 'deleted-1', title: '削除済みメモ1', seq: 0, createdAt: '', updatedAt: '', tags: [], deleted: true },
        { id: 'deleted-2', title: '削除済みメモ2', seq: 1, createdAt: '', updatedAt: '', tags: [], deleted: true },
      ]
      render(
        <NoteList
          {...defaultProps}
          notes={mixedNotes}
          isTrash
          folders={folders}
          onBulkPermanentDelete={onBulkPermanentDelete}
        />,
      )
      longPress(screen.getByText('削除済みメモ1'))

      // 1件選択中になり、バルクバーに「完全に削除」が表示される
      expect(screen.getByText('1件選択中')).toBeInTheDocument()
      const permDeleteBtn = screen.getByRole('button', { name: '選択したメモを完全に削除' })
      expect(permDeleteBtn).toBeInTheDocument()

      // 通常の「フォルダへ移動」「ゴミ箱に移動」は表示されないこと
      expect(screen.queryByLabelText('選択したメモをフォルダ移動')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('選択したメモをゴミ箱に移動')).not.toBeInTheDocument()

      // 完全に削除をクリックすると onBulkPermanentDelete が呼ばれ、複数選択が解除される
      fireEvent.click(permDeleteBtn)
      expect(onBulkPermanentDelete).toHaveBeenCalledWith(['deleted-1'])
      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
    })

    it('toggles selection on pointerUp without a click event when displacement is within threshold (reproducing swipe drag suppression)', () => {
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      const firstRow = screen.getByText('先に書いたメモ')
      const secondRow = screen.getByText('後で書いたメモ')

      // 1件目を長押しで選択
      longPress(firstRow)
      expect(screen.getByText('1件選択中')).toBeInTheDocument()

      // 2件目をタップ。実機ではSwipeContainerの微小なブレ検出によってネイティブclickイベントが抑制されるため、
      // pointerDown -> 2px pointerMove -> pointerUp のみ発火し、clickイベントは発生しない。
      fireEvent.pointerDown(secondRow, { clientX: 100, clientY: 100 })
      fireEvent.pointerMove(secondRow, { clientX: 102, clientY: 100 })
      fireEvent.pointerUp(secondRow, { clientX: 102, clientY: 100 })
      // clickは呼ばない

      // 2件目がタップで選択され、2件選択中になること
      expect(screen.getByText('2件選択中')).toBeInTheDocument()

      // もう一度同様にタップすると選択解除されること
      fireEvent.pointerDown(secondRow, { clientX: 100, clientY: 100 })
      fireEvent.pointerMove(secondRow, { clientX: 101, clientY: 101 })
      fireEvent.pointerUp(secondRow, { clientX: 101, clientY: 101 })
      expect(screen.getByText('1件選択中')).toBeInTheDocument()
    })

    it('does not toggle selection on pointerUp without a click event when displacement exceeds threshold (scroll/swipe)', () => {
      render(<NoteList {...defaultProps} notes={notes} folders={folders} />)
      const firstRow = screen.getByText('先に書いたメモ')
      const secondRow = screen.getByText('後で書いたメモ')

      longPress(firstRow)
      expect(screen.getByText('1件選択中')).toBeInTheDocument()

      // 閾値(10px)を超える移動(15px)の場合、スワイプ/スクロールとみなされ選択はトグルされない
      fireEvent.pointerDown(secondRow, { clientX: 100, clientY: 100 })
      fireEvent.pointerMove(secondRow, { clientX: 100, clientY: 115 })
      fireEvent.pointerUp(secondRow, { clientX: 100, clientY: 115 })

      expect(screen.getByText('1件選択中')).toBeInTheDocument()
    })
  })

  it('renders deleted notes when isTrash is true, including original folder name', () => {
    const mixedNotes = [
      ...notes,
      {
        id: 'deleted-1',
        title: '削除済みメモ',
        seq: 3,
        createdAt: '2026-10-12T10:00:00+09:00',
        updatedAt: '2026-10-12T10:00:00+09:00',
        tags: [],
        deleted: true,
        folder: '仕事',
      },
    ]

    const { rerender } = render(<NoteList {...defaultProps} notes={mixedNotes} isTrash={false} />)
    expect(screen.queryByText('削除済みメモ')).not.toBeInTheDocument()

    rerender(<NoteList {...defaultProps} notes={mixedNotes} isTrash={true} />)
    expect(screen.getByText('削除済みメモ')).toBeInTheDocument()
    expect(screen.getByText(/\[仕事\]/)).toBeInTheDocument()
    expect(screen.queryByText('先に書いたメモ')).not.toBeInTheDocument()
  })
})

