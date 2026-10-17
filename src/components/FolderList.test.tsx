import { render, screen, fireEvent, act } from '@testing-library/react'
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

  it('does not render per-row delete buttons', () => {
    render(<FolderList {...baseProps} folders={folders} />)
    expect(screen.queryByLabelText('仕事を削除')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('前ノートを削除')).not.toBeInTheDocument()
  })

  it('does not trigger folder deletion on long-press of a folder row', () => {
    vi.useFakeTimers()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onDelete={onDelete} />)

    const folderBtn = screen.getByRole('button', { name: '仕事' })
    fireEvent.pointerDown(folderBtn, { clientX: 100, clientY: 100 })
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('disables the footer delete folder button when no folder or trash is selected', () => {
    const { rerender } = render(<FolderList {...baseProps} folders={folders} selectedName={null} />)
    expect(screen.getByRole('button', { name: '選択中のフォルダを削除' })).toBeDisabled()

    rerender(<FolderList {...baseProps} folders={folders} selectedName="ゴミ箱" />)
    expect(screen.getByRole('button', { name: '選択中のフォルダを削除' })).toBeDisabled()
  })

  it('calls onDelete when the footer delete folder button is clicked and confirmed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} selectedName="仕事" onDelete={onDelete} />)

    const deleteBtn = screen.getByRole('button', { name: '選択中のフォルダを削除' })
    expect(deleteBtn).not.toBeDisabled()
    fireEvent.click(deleteBtn)

    expect(confirmSpy).toHaveBeenCalledWith('「仕事」を削除しますか？')
    expect(onDelete).toHaveBeenCalledWith(folders[1])
  })

  it('does not call onDelete when footer delete folder confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} selectedName="仕事" onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: '選択中のフォルダを削除' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('renders sync button in footer and handles click and disabled states', () => {
    const onSync = vi.fn()
    const { rerender } = render(
      <FolderList {...baseProps} folders={folders} onSync={onSync} online={true} isSyncing={false} />,
    )

    const syncBtn = screen.getByRole('button', { name: '同期' })
    expect(syncBtn).not.toBeDisabled()
    expect(syncBtn).toHaveTextContent('同期')
    fireEvent.click(syncBtn)
    expect(onSync).toHaveBeenCalledTimes(1)

    rerender(<FolderList {...baseProps} folders={folders} onSync={onSync} online={true} isSyncing={true} />)
    expect(screen.getByRole('button', { name: '同期' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '同期' })).toHaveTextContent('同期中...')

    rerender(<FolderList {...baseProps} folders={folders} onSync={onSync} online={false} isSyncing={false} />)
    expect(screen.getByRole('button', { name: '同期' })).toBeDisabled()
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

  it('shows a small note count badge next to the folder name when noteCounts has a positive count', () => {
    render(<FolderList {...baseProps} folders={folders} noteCounts={{ '前ノート': 12, '仕事': 0 }} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('前ノート')
    expect(items[0].querySelector('.folder-count-badge')).toHaveTextContent('12')
    // 0件のフォルダにはバッジを表示しない(ゴミ箱バッジと同じ挙動)
    expect(items[1].querySelector('.folder-count-badge')).toBeNull()
  })

  it('does not render a count badge when noteCounts is not provided', () => {
    render(<FolderList {...baseProps} folders={folders} />)
    expect(document.querySelector('.folder-count-badge')).toBeNull()
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

