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

  it('hides the folder creation form initially and opens it when 新しいフォルダを追加 is clicked, then closes on submit', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    expect(screen.queryByLabelText('新しいフォルダ名')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新しいフォルダを追加' }))
    const input = screen.getByLabelText('新しいフォルダ名')
    fireEvent.change(input, { target: { value: '新規フォルダ' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onCreate).toHaveBeenCalledWith('新規フォルダ')
    expect(screen.queryByLabelText('新しいフォルダ名')).not.toBeInTheDocument()
  })

  it('does not call onCreate for a blank or whitespace-only name', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: '新しいフォルダを追加' }))
    fireEvent.change(screen.getByLabelText('新しいフォルダ名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('submits the new folder name on Enter and closes the form on Escape', () => {
    const onCreate = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: '新しいフォルダを追加' }))
    const input = screen.getByLabelText('新しいフォルダ名')
    fireEvent.change(input, { target: { value: 'Enterで追加' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('Enterで追加')
    expect(screen.queryByLabelText('新しいフォルダ名')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新しいフォルダを追加' }))
    fireEvent.keyDown(screen.getByLabelText('新しいフォルダ名'), { key: 'Escape' })
    expect(screen.queryByLabelText('新しいフォルダ名')).not.toBeInTheDocument()
  })

  it('renders all 4 footer action buttons inside .folder-settings-wrap', () => {
    const { container } = render(
      <FolderList {...baseProps} folders={folders} onOpenSettings={() => {}} onSync={() => {}} />,
    )
    const wrap = container.querySelector('.folder-settings-wrap') as HTMLElement
    expect(wrap).toBeInTheDocument()
    expect(wrap.querySelector('[aria-label="新しいフォルダを追加"]')).toBeInTheDocument()
    expect(wrap.querySelector('[aria-label="設定を開く"]')).toBeInTheDocument()
    expect(wrap.querySelector('[aria-label="同期"]')).toBeInTheDocument()
    expect(wrap.querySelector('[aria-label="フォルダ削除"]')).toBeInTheDocument()
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

  it('enters folder delete mode when フォルダ削除 is clicked, hides 新しいフォルダを追加, selects a folder without navigating, and deletes it on clicking 削除', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onSelect={onSelect} onDelete={onDelete} />)

    // 1. 「フォルダ削除」ボタンを押して選択モードに入る
    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除' }))
    expect(screen.queryByRole('button', { name: '新しいフォルダを追加' })).not.toBeInTheDocument()

    // まだフォルダ未選択なので「削除」ボタンは無効
    const confirmDeleteBtn = screen.getByRole('button', { name: '選択したフォルダを削除' })
    expect(confirmDeleteBtn).toBeDisabled()

    // 2. 「仕事」フォルダをクリックすると、画面遷移(onSelect)せずに削除対象として選択される
    fireEvent.click(screen.getByRole('button', { name: '仕事' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(confirmDeleteBtn).not.toBeDisabled()

    // 3. 「削除」ボタンを押すと確認ダイアログが出て削除が実行され、選択モードが終了する
    fireEvent.click(confirmDeleteBtn)
    expect(confirmSpy).toHaveBeenCalledWith('「仕事」を削除しますか？')
    expect(onDelete).toHaveBeenCalledWith(folders[1])
    expect(screen.getByRole('button', { name: 'フォルダ削除' })).toBeInTheDocument()
  })

  it('allows selecting multiple folders in delete mode and calls onBulkDelete with all selected folders', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onBulkDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onBulkDelete={onBulkDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除' }))
    fireEvent.click(screen.getByRole('button', { name: '前ノート' }))
    fireEvent.click(screen.getByRole('button', { name: '仕事' }))

    const confirmDeleteBtn = screen.getByRole('button', { name: '選択したフォルダを削除' })
    expect(confirmDeleteBtn).toHaveTextContent('削除 (2)')

    fireEvent.click(confirmDeleteBtn)
    expect(confirmSpy).toHaveBeenCalledWith('選択した2件のフォルダ（前ノート、仕事）を削除しますか？')
    expect(onBulkDelete).toHaveBeenCalledWith([folders[0], folders[1]])
    expect(screen.getByRole('button', { name: 'フォルダ削除' })).toBeInTheDocument()
  })

  it('cancels folder delete mode without calling onDelete when キャンセル is clicked or confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDelete = vi.fn()
    render(<FolderList {...baseProps} folders={folders} onDelete={onDelete} />)

    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除' }))
    fireEvent.click(screen.getByRole('button', { name: '仕事' }))
    fireEvent.click(screen.getByRole('button', { name: '選択したフォルダを削除' }))
    expect(onDelete).not.toHaveBeenCalled()

    // キャンセルボタンで通常モードに戻る
    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除をキャンセル' }))
    expect(screen.getByRole('button', { name: 'フォルダ削除' })).toBeInTheDocument()
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

