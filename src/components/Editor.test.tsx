import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Editor } from './Editor'

describe('Editor', () => {
  it('shows a textarea in edit mode by default', () => {
    render(<Editor body="# 見出し" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('# 見出し')
  })

  it('switches to markdown preview when the toggle is clicked', async () => {
    render(<Editor body="# 見出し" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー' }))
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 10000 })).toHaveTextContent('見出し')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('calls onChange when the textarea content changes', () => {
    const onChange = vi.fn()
    render(<Editor body="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新しい本文' } })
    expect(onChange).toHaveBeenCalledWith('新しい本文')
  })

  it('highlights matched query in markdown preview mode', async () => {
    const { container } = render(
      <Editor body="これは哲学の探求についてのメモです。" onChange={() => {}} highlightQuery="哲学" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー' }))
    await waitFor(() => {
      const mark = container.querySelector('mark.search-highlight')
      expect(mark).toBeInTheDocument()
      expect(mark?.textContent).toBe('哲学')
    }, { timeout: 10000 })
  })

  it('hides toolbar when hideToolbar is true and respects external mode', async () => {
    const onModeChange = vi.fn()
    const { rerender } = render(
      <Editor body="# タイトル" onChange={() => {}} mode="preview" hideToolbar onModeChange={onModeChange} />,
    )
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 10000 })).toHaveTextContent('タイトル')

    rerender(<Editor body="# タイトル" onChange={() => {}} mode="edit" hideToolbar onModeChange={onModeChange} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('highlights matches in edit mode and displays the right-side search slider', () => {
    const { container } = render(
      <Editor
        body={'1行目: テスト\n2行目: 通常\n3行目: テスト再登場'}
        onChange={() => {}}
        highlightQuery="テスト"
        mode="edit"
      />,
    )
    const marks = container.querySelectorAll('mark.search-highlight')
    expect(marks).toHaveLength(2)
    expect(marks[0]).toHaveClass('is-current')
    expect(screen.getByText('1 / 2件')).toBeInTheDocument()

    const slider = screen.getByLabelText('検索一致箇所スライダー')
    expect(slider).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '1' } })
    expect(screen.getByText('2 / 2件')).toBeInTheDocument()
    const updatedMarks = container.querySelectorAll('mark.search-highlight')
    expect(updatedMarks[1]).toHaveClass('is-current')
  })

  it('jumps to the nearest match when clicking on .editor-search-ticks container or directly on a tick button', () => {
    const { container } = render(
      <Editor
        body={'1行目: キーワード\n2行目: 通常\n3行目: 通常\n4行目: 通常\n5行目: キーワード再登場'}
        onChange={() => {}}
        highlightQuery="キーワード"
        mode="edit"
      />,
    )
    expect(screen.getByText('1 / 2件')).toBeInTheDocument()

    // 1. 個々の .editor-search-tick ボタンを直接クリックした場合
    const tick2 = screen.getByRole('button', { name: '一致箇所 2 へ移動' })
    fireEvent.click(tick2)
    expect(screen.getByText('2 / 2件')).toBeInTheDocument()

    // 2. .editor-search-ticks コンテナの余白（上部=1件目に近いY座標）をクリックした場合
    const ticksContainer = container.querySelector('.editor-search-ticks') as HTMLElement
    vi.spyOn(ticksContainer, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 200,
      left: 0,
      right: 18,
      bottom: 200,
      width: 18,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(ticksContainer, { clientY: 15 }) // ratio = 15/200 = 0.075 -> 1件目(ratio 0)に最も近い
    expect(screen.getByText('1 / 2件')).toBeInTheDocument()

    // 下部（2件目に近いY座標）をクリックした場合
    fireEvent.click(ticksContainer, { clientY: 185 }) // ratio = 185/200 = 0.925 -> 2件目に最も近い
    expect(screen.getByText('2 / 2件')).toBeInTheDocument()
  })
})

