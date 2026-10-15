import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FolderList } from './FolderList'

const folders = [
  { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
  { folderId: '2', name: '仕事', color: '#ff0000', seq: 1 },
]

const baseProps = { selectedName: null, onSelect: () => {}, onCreate: () => {}, onDelete: () => {}, onReorder: () => {} }

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

  it('reorders via drag: dragging the first row past the second row\'s midpoint calls onReorder with the new order', () => {
    const onReorder = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onReorder={onReorder} />)
    const rows = screen.getAllByRole('listitem')
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect)
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({ top: 40, height: 40 } as DOMRect)

    const handle = screen.getByLabelText('前ノートをドラッグして並び替え')
    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 65 }) // 2行目(中点y=60)より下まで動かす
    fireEvent.pointerUp(handle, { pointerId: 1 })

    expect(onReorder).toHaveBeenCalledWith(['2', '1'])
  })

  it('does not call onReorder when the pointer never crosses another row\'s midpoint', () => {
    const onReorder = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onReorder={onReorder} />)
    const rows = screen.getAllByRole('listitem')
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect)
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({ top: 40, height: 40 } as DOMRect)

    const handle = screen.getByLabelText('前ノートをドラッグして並び替え')
    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 }) // 自分の行の中のまま
    fireEvent.pointerUp(handle, { pointerId: 1 })

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('renders the trash virtual folder and calls onSelect with "ゴミ箱" when clicked', () => {
    const onSelect = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onSelect={onSelect} trashCount={5} />)
    const trashBtn = screen.getByRole('button', { name: /ゴミ箱/ })
    expect(trashBtn).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()

    fireEvent.click(trashBtn)
    expect(onSelect).toHaveBeenCalledWith('ゴミ箱')
  })

  it('renders settings button and calls onOpenSettings when clicked', () => {
    const onOpenSettings = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onOpenSettings={onOpenSettings} />)
    const settingsBtn = screen.getByRole('button', { name: '設定を開く' })
    expect(settingsBtn).toBeInTheDocument()

    fireEvent.click(settingsBtn)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

