import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Editor } from './Editor'

describe('Editor', () => {
  it('shows a textarea in edit mode by default', () => {
    render(<Editor body="# 見出し" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('# 見出し')
  })

  it('switches to markdown preview when the toggle is clicked', () => {
    render(<Editor body="# 見出し" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('見出し')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('calls onChange when the textarea content changes', () => {
    const onChange = vi.fn()
    render(<Editor body="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新しい本文' } })
    expect(onChange).toHaveBeenCalledWith('新しい本文')
  })
})
