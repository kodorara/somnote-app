import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LlmLinkPanel } from './LlmLinkPanel'

describe('LlmLinkPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn())
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('starts collapsed, showing only a toggle button', () => {
    render(<LlmLinkPanel body="x" links={[]} onAddLink={() => {}} />)
    expect(screen.getByRole('button', { name: 'LLM連携' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claudeへ' })).not.toBeInTheDocument()
  })

  it('shows the link count on the collapsed toggle when links exist', () => {
    render(
      <LlmLinkPanel
        body="x"
        links={[{ url: 'https://claude.ai/chat/xxx', label: '深掘り', addedAt: '2026-10-12T10:00:00+09:00' }]}
        onAddLink={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'LLM連携(1)' })).toBeInTheDocument()
  })

  it('expands to show the full panel when the toggle is clicked', () => {
    render(<LlmLinkPanel body="x" links={[]} onAddLink={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    expect(screen.getByRole('button', { name: 'Claudeへ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LLM連携を閉じる' })).toBeInTheDocument()
  })

  it('copies the note body, opens claude.ai, and pre-fills the memo with the LLM name when "Claudeへ" is clicked', async () => {
    render(<LlmLinkPanel body="相談したい内容" links={[]} onAddLink={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    fireEvent.click(screen.getByRole('button', { name: 'Claudeへ' }))
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://claude.ai/new', '_blank'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('相談したい内容')
    expect(screen.getByLabelText('メモ')).toHaveValue('Claude')
  })

  it('calls onAddLink with url and memo when the add-link form is submitted', () => {
    const onAddLink = vi.fn()
    render(<LlmLinkPanel body="x" links={[]} onAddLink={onAddLink} />)
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    fireEvent.change(screen.getByLabelText('チャットURL'), { target: { value: 'https://claude.ai/chat/xxx' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '深掘り' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onAddLink).toHaveBeenCalledWith('https://claude.ai/chat/xxx', '深掘り')
  })

  it('adds a link with an empty memo (no text required beyond the URL)', () => {
    const onAddLink = vi.fn()
    render(<LlmLinkPanel body="x" links={[]} onAddLink={onAddLink} />)
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    fireEvent.change(screen.getByLabelText('チャットURL'), { target: { value: 'https://claude.ai/chat/xxx' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onAddLink).toHaveBeenCalledWith('https://claude.ai/chat/xxx', '')
  })

  it('does not add a link when the URL is empty', () => {
    const onAddLink = vi.fn()
    render(<LlmLinkPanel body="x" links={[]} onAddLink={onAddLink} />)
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: 'メモだけ入力' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(onAddLink).not.toHaveBeenCalled()
  })

  it('renders existing links, falling back to the URL as link text when the memo is empty', () => {
    render(
      <LlmLinkPanel
        body="x"
        links={[
          { url: 'https://claude.ai/chat/xxx', label: '深掘り', addedAt: '2026-10-12T10:00:00+09:00' },
          { url: 'https://chatgpt.com/c/yyy', label: '', addedAt: '2026-10-12T10:00:00+09:00' },
        ]}
        onAddLink={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携(2)' }))
    expect(screen.getByRole('link', { name: '深掘り' })).toHaveAttribute('href', 'https://claude.ai/chat/xxx')
    expect(screen.getByRole('link', { name: 'https://chatgpt.com/c/yyy' })).toHaveAttribute(
      'href',
      'https://chatgpt.com/c/yyy',
    )
  })
})
