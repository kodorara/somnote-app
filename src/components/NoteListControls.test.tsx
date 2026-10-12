import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NoteListControls } from './NoteListControls'

const baseProps = {
  sortBy: 'seq' as const,
  onSortByChange: () => {},
  wordFilter: '',
  onWordFilterChange: () => {},
  availableTags: ['日記', '哲学'],
  tagFilter: null,
  onTagFilterChange: () => {},
}

describe('NoteListControls', () => {
  it('calls onSortByChange when a different sort option is selected', () => {
    const onSortByChange = vi.fn()
    render(<NoteListControls {...baseProps} onSortByChange={onSortByChange} />)
    fireEvent.change(screen.getByLabelText('並び替え'), { target: { value: 'createdDesc' } })
    expect(onSortByChange).toHaveBeenCalledWith('createdDesc')
  })

  it('calls onWordFilterChange as the user types', () => {
    const onWordFilterChange = vi.fn()
    render(<NoteListControls {...baseProps} onWordFilterChange={onWordFilterChange} />)
    fireEvent.change(screen.getByLabelText('タイトルで絞り込み'), { target: { value: '日記' } })
    expect(onWordFilterChange).toHaveBeenCalledWith('日記')
  })

  it('renders a chip per available tag and toggles it on click', () => {
    const onTagFilterChange = vi.fn()
    render(<NoteListControls {...baseProps} onTagFilterChange={onTagFilterChange} />)
    fireEvent.click(screen.getByRole('button', { name: '#日記' }))
    expect(onTagFilterChange).toHaveBeenCalledWith('日記')
  })

  it('clicking the already-active tag chip clears the filter', () => {
    const onTagFilterChange = vi.fn()
    render(<NoteListControls {...baseProps} tagFilter="日記" onTagFilterChange={onTagFilterChange} />)
    fireEvent.click(screen.getByRole('button', { name: '#日記' }))
    expect(onTagFilterChange).toHaveBeenCalledWith(null)
  })

  it('renders no tag chip row when there are no tags', () => {
    render(<NoteListControls {...baseProps} availableTags={[]} />)
    expect(screen.queryByRole('button', { name: /^#/ })).not.toBeInTheDocument()
  })
})
