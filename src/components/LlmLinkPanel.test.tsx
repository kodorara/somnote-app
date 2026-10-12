import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlmLinkPanel } from './LlmLinkPanel'

describe('LlmLinkPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn())
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('copies the note body and opens claude.ai when "Claudeへ" is clicked', async () => {
    render(<LlmLinkPanel body="相談したい内容" links={[]} onAddLink={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Claudeへ' }))
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://claude.ai/new', '_blank'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('相談したい内容')
  })

  it('calls onAddLink with url and label when the add-link form is submitted', () => {
    const onAddLink = vi.fn()
    render(<LlmLinkPanel body="x" links={[]} onAddLink={onAddLink} />)
    fireEvent.change(screen.getByLabelText('チャットURL'), { target: { value: 'https://claude.ai/chat/xxx' } })
    fireEvent.change(screen.getByLabelText('ラベル'), { target: { value: '深掘り' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onAddLink).toHaveBeenCalledWith('https://claude.ai/chat/xxx', '深掘り')
  })

  it('renders existing links', () => {
    render(
      <LlmLinkPanel
        body="x"
        links={[{ url: 'https://claude.ai/chat/xxx', label: '深掘り', addedAt: '2026-10-12T10:00:00+09:00' }]}
        onAddLink={() => {}}
      />,
    )
    expect(screen.getByRole('link', { name: '深掘り' })).toHaveAttribute('href', 'https://claude.ai/chat/xxx')
  })
})
