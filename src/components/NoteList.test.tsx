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
        vi.advanceTimersByTime(500)
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

    it('does not enter multi-select mode on a quick tap (release before the long-press threshold)', () => {
      const onSelect = vi.fn()
      render(<NoteList {...defaultProps} notes={notes} onSelect={onSelect} folders={folders} />)
      const row = screen.getByText('先に書いたメモ')
      fireEvent.pointerDown(row, { clientX: 100, clientY: 100 })
      act(() => {
        vi.advanceTimersByTime(200) // 閾値(500ms)未満
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
        vi.advanceTimersByTime(500)
      })
      fireEvent.pointerUp(row, { clientX: 100, clientY: 140 })

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
    })

    it('does not offer multi-select in the trash view', () => {
      const mixedNotes = [
        { id: 'deleted-1', title: '削除済みメモ', seq: 0, createdAt: '', updatedAt: '', tags: [], deleted: true },
      ]
      render(<NoteList {...defaultProps} notes={mixedNotes} isTrash folders={folders} />)
      longPress(screen.getByText('削除済みメモ'))

      expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
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

