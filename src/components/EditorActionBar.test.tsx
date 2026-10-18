import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EditorActionBar, type EditorActionBarProps } from './EditorActionBar'

describe('EditorActionBar', () => {
  const dummyFolders = [
    { folderId: 'f1', name: '仕事', seq: 0, color: 'blue' },
    { folderId: 'f2', name: 'プライベート', seq: 1, color: 'green' },
  ]

  const defaultProps: EditorActionBarProps = {
    onSave: vi.fn(),
    currentFolder: '仕事',
    folders: dummyFolders,
    onMoveFolder: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    previewMode: 'edit',
    onTogglePreview: vi.fn(),
    llmLinksCount: 0,
    isLlmOpen: false,
    onToggleLlm: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders all 6 actions in the bar', () => {
    render(<EditorActionBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'フォルダ移動' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'メモ内を検索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LLM連携' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'プレビュー' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ゴミ箱に移動' })).toBeInTheDocument()
  })

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn()
    render(<EditorActionBar {...defaultProps} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('calls onMoveFolder when folder select is changed and renders folder icon overlay', () => {
    const onMoveFolder = vi.fn()
    const { container } = render(<EditorActionBar {...defaultProps} onMoveFolder={onMoveFolder} />)
    expect(container.querySelector('.action-bar-folder-select .folder-select-icon')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'フォルダ移動' }), {
      target: { value: 'プライベート' },
    })
    expect(onMoveFolder).toHaveBeenCalledWith('プライベート')
  })

  it('lists folder options in seq order, matching the folder list screen, regardless of prop array order', () => {
    const outOfOrderFolders = [
      { folderId: 'f2', name: 'プライベート', seq: 1, color: 'green' },
      { folderId: 'f3', name: '趣味', seq: 2, color: 'red' },
      { folderId: 'f1', name: '仕事', seq: 0, color: 'blue' },
    ]
    render(<EditorActionBar {...defaultProps} folders={outOfOrderFolders} />)
    const options = screen.getAllByRole('option') as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toEqual(['仕事', 'プライベート', '趣味'])
  })

  it('toggles search row and calls onSearchChange', () => {
    const onSearchChange = vi.fn()
    render(<EditorActionBar {...defaultProps} onSearchChange={onSearchChange} />)
    expect(screen.queryByRole('searchbox', { name: '本文内を検索' })).not.toBeInTheDocument()

    // 検索トグルクリックで入力欄表示
    fireEvent.click(screen.getByRole('button', { name: 'メモ内を検索' }))
    const input = screen.getByRole('searchbox', { name: '本文内を検索' })
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'テスト' } })
    expect(onSearchChange).toHaveBeenCalledWith('テスト')
  })

  it('shows badge when llmLinksCount > 0 and calls onToggleLlm', () => {
    const onToggleLlm = vi.fn()
    render(<EditorActionBar {...defaultProps} llmLinksCount={3} onToggleLlm={onToggleLlm} />)
    expect(screen.getByText('3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    expect(onToggleLlm).toHaveBeenCalledTimes(1)
  })

  it('switches between preview and edit labels and calls onTogglePreview', () => {
    const onTogglePreview = vi.fn()
    const { rerender } = render(
      <EditorActionBar {...defaultProps} previewMode="edit" onTogglePreview={onTogglePreview} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー' }))
    expect(onTogglePreview).toHaveBeenCalledTimes(1)

    rerender(<EditorActionBar {...defaultProps} previewMode="preview" onTogglePreview={onTogglePreview} />)
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<EditorActionBar {...defaultProps} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱に移動' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('renders restore button and trash banner when isTrashNote is true', () => {
    const onRestore = vi.fn()
    render(
      <EditorActionBar
        {...defaultProps}
        isTrashNote={true}
        onRestore={onRestore}
      />,
    )
    // 復元ボタンとバナーの「復元する」ボタンの存在確認
    const iconBtn = screen.getByRole('button', { name: '復元' })
    const bannerBtn = screen.getByRole('button', { name: '復元する' })
    expect(iconBtn).toBeInTheDocument()
    expect(bannerBtn).toBeInTheDocument()

    // ゴミ箱バナーの文言確認
    expect(screen.getByText('このメモはゴミ箱に入っています')).toBeInTheDocument()

    // 復元ボタンクリックで onRestore が呼ばれる
    fireEvent.click(iconBtn)
    expect(onRestore).toHaveBeenCalledTimes(1)

    fireEvent.click(bannerBtn)
    expect(onRestore).toHaveBeenCalledTimes(2)
  })

  it('renders permanent delete button and calls onPermanentDelete when clicked in trash banner', () => {
    const onPermanentDelete = vi.fn()
    render(
      <EditorActionBar
        {...defaultProps}
        isTrashNote={true}
        onPermanentDelete={onPermanentDelete}
      />,
    )
    const deleteBtn = screen.getByRole('button', { name: '完全に削除' })
    expect(deleteBtn).toBeInTheDocument()

    fireEvent.click(deleteBtn)
    expect(onPermanentDelete).toHaveBeenCalledTimes(1)
  })

  it('renders history button and calls onToggleHistory when clicked', () => {
    const onToggleHistory = vi.fn()
    render(
      <EditorActionBar
        {...defaultProps}
        onToggleHistory={onToggleHistory}
        isHistoryOpen={false}
      />,
    )
    const historyBtn = screen.getByRole('button', { name: '編集履歴' })
    expect(historyBtn).toBeInTheDocument()

    fireEvent.click(historyBtn)
    expect(onToggleHistory).toHaveBeenCalledTimes(1)
  })

  it('opens tag picker, displays existing tags, toggles a tag with one click, and adds a new tag', () => {
    const onToggleTag = vi.fn()
    render(
      <EditorActionBar
        {...defaultProps}
        availableTags={['会議', '重要']}
        activeTags={['重要']}
        onToggleTag={onToggleTag}
      />,
    )
    const tagBtn = screen.getByRole('button', { name: 'タグ' })
    expect(tagBtn).toBeInTheDocument()

    fireEvent.click(tagBtn)
    expect(screen.getByRole('region', { name: 'タグ選択' })).toBeInTheDocument()

    const kaigiChip = screen.getByRole('button', { name: '#会議' })
    const juyoChip = screen.getByRole('button', { name: '#重要' })
    expect(kaigiChip).toHaveAttribute('aria-pressed', 'false')
    expect(juyoChip).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(kaigiChip)
    expect(onToggleTag).toHaveBeenCalledWith('会議')
    fireEvent.click(juyoChip)
    expect(onToggleTag).toHaveBeenCalledWith('重要')

    const newTagInput = screen.getByLabelText('新しいタグ')
    fireEvent.change(newTagInput, { target: { value: 'アイデア' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onToggleTag).toHaveBeenCalledWith('アイデア')
  })
})



