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

  it('calls onMoveFolder when folder select is changed', () => {
    const onMoveFolder = vi.fn()
    render(<EditorActionBar {...defaultProps} onMoveFolder={onMoveFolder} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'フォルダ移動' }), {
      target: { value: 'プライベート' },
    })
    expect(onMoveFolder).toHaveBeenCalledWith('プライベート')
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
})
