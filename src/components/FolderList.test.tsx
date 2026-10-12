import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderList } from './FolderList'

const folders = [
  { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
  { folderId: '2', name: '仕事', color: '#ff0000', seq: 1 },
]

describe('FolderList', () => {
  it('renders all folders sorted by seq', () => {
    render(<FolderList folders={folders} selectedName={null} onSelect={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('前ノート')
    expect(items[1]).toHaveTextContent('仕事')
  })

  it('calls onSelect with the folder name (not folderId) when a folder is clicked', () => {
    const onSelect = vi.fn()
    render(<FolderList folders={folders} selectedName={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('仕事'))
    expect(onSelect).toHaveBeenCalledWith('仕事')
  })
})
