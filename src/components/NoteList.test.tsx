import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
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
})

