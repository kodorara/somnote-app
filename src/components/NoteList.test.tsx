import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NoteList } from './NoteList'

const notes = [
  { id: 'a', title: '後で書いたメモ', seq: 1, updatedAt: '2026-10-12T10:00:00+09:00', tags: ['日記'], deleted: false },
  { id: 'b', title: '先に書いたメモ', seq: 0, updatedAt: '2026-10-11T10:00:00+09:00', tags: [], deleted: false },
  { id: 'c', title: 'ゴミ箱入り', seq: 2, updatedAt: '2026-10-10T10:00:00+09:00', tags: [], deleted: true },
]

describe('NoteList', () => {
  it('renders notes sorted by seq by default, excluding deleted notes', () => {
    render(<NoteList notes={notes} selectedId={null} onSelect={() => {}} tagFilter={null} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('先に書いたメモ')
    expect(items[1]).toHaveTextContent('後で書いたメモ')
    expect(screen.queryByText('ゴミ箱入り')).not.toBeInTheDocument()
  })

  it('filters by tag when tagFilter is set', () => {
    render(<NoteList notes={notes} selectedId={null} onSelect={() => {}} tagFilter="日記" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('後で書いたメモ')).toBeInTheDocument()
  })

  it('calls onSelect when a note is clicked', () => {
    const onSelect = vi.fn()
    render(<NoteList notes={notes} selectedId={null} onSelect={onSelect} tagFilter={null} />)
    fireEvent.click(screen.getByText('先に書いたメモ'))
    expect(onSelect).toHaveBeenCalledWith('b')
  })
})
