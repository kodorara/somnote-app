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
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 3000 })).toHaveTextContent('見出し')
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
    })
  })

  it('hides toolbar when hideToolbar is true and respects external mode', async () => {
    const onModeChange = vi.fn()
    const { rerender } = render(
      <Editor body="# タイトル" onChange={() => {}} mode="preview" hideToolbar onModeChange={onModeChange} />,
    )
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 3000 })).toHaveTextContent('タイトル')

    rerender(<Editor body="# タイトル" onChange={() => {}} mode="edit" hideToolbar onModeChange={onModeChange} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})

