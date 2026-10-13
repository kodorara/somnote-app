import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderList } from './FolderList'

const folders = [
  { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
  { folderId: '2', name: '仕事', color: '#ff0000', seq: 1 },
]

const baseProps = { selectedName: null, onSelect: () => {}, onCreate: () => {}, onDelete: () => {}, onMove: () => {} }

describe('FolderList', () => {
  it('renders all folders sorted by seq', () => {
    render(<FolderList {...baseProps} folders={folders} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('前ノート')
    expect(items[1]).toHaveTextContent('仕事')
  })

  it('calls onSelect with the folder name (not folderId) when a folder is clicked', () => {
    const onSelect = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('仕事'))
    expect(onSelect).toHaveBeenCalledWith('仕事')
  })

  it('calls onCreate with the entered name and clears the input', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    const input = screen.getByLabelText('新しいフォルダ名')
    fireEvent.change(input, { target: { value: '新規フォルダ' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onCreate).toHaveBeenCalledWith('新規フォルダ')
    expect(input).toHaveValue('')
  })

  it('does not call onCreate for a blank or whitespace-only name', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('新しいフォルダ名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('submits the new folder name on Enter', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    const input = screen.getByLabelText('新しいフォルダ名')
    fireEvent.change(input, { target: { value: 'Enterで追加' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('Enterで追加')
  })

  it('calls onDelete with the folder when its delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onDelete={onDelete} />)
    fireEvent.click(screen.getByLabelText('仕事を削除'))
    expect(onDelete).toHaveBeenCalledWith(folders[1])
  })

  it('calls onMove with the folderId and direction when the up/down buttons are clicked', () => {
    const onMove = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onMove={onMove} />)
    fireEvent.click(screen.getByLabelText('仕事を上へ'))
    expect(onMove).toHaveBeenCalledWith('2', 'up')
    fireEvent.click(screen.getByLabelText('前ノートを下へ'))
    expect(onMove).toHaveBeenCalledWith('1', 'down')
  })

  it('disables the up button for the first folder and the down button for the last', () => {
    render(<FolderList {...baseProps} folders={folders} />)
    expect(screen.getByLabelText('前ノートを上へ')).toBeDisabled()
    expect(screen.getByLabelText('前ノートを下へ')).not.toBeDisabled()
    expect(screen.getByLabelText('仕事を上へ')).not.toBeDisabled()
    expect(screen.getByLabelText('仕事を下へ')).toBeDisabled()
  })
})
