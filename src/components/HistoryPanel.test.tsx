import { render, screen, fireEvent } from '@testing-library/react'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HistoryPanel, type HistoryPanelProps } from './HistoryPanel'
import * as historyLib from '../lib/history'
import type { GithubSettings } from '../lib/githubSettings'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('HistoryPanel', () => {
  const dummySettings: GithubSettings = {
    token: 'token',
    owner: 'owner',
    repo: 'repo',
  }

  const defaultProps: HistoryPanelProps = {
    isOpen: true,
    onClose: vi.fn(),
    folder: '仕事',
    noteId: 'note-1',
    settings: dummySettings,
    online: true,
    onRestoreContent: vi.fn(),
  }

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<HistoryPanel {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays offline message when offline', () => {
    render(<HistoryPanel {...defaultProps} online={false} />)
    expect(
      screen.getByText('オフラインのため、編集履歴を表示できません（GitHub APIへの接続が必要です）'),
    ).toBeInTheDocument()
  })

  it('fetches and displays commits and previews body of selected commit', async () => {
    vi.spyOn(historyLib, 'fetchNoteHistory').mockResolvedValue([
      {
        sha: 'sha-latest',
        message: '最新コミット',
        authorDate: '2026-10-15T10:00:00Z',
        formattedDate: '2026/10/15 19:00',
      },
      {
        sha: 'sha-old',
        message: '過去コミット',
        authorDate: '2026-10-10T10:00:00Z',
        formattedDate: '2026/10/10 19:00',
      },
    ])
    vi.spyOn(historyLib, 'fetchNoteBodyAtCommit').mockImplementation(async (_, __, ___, sha) => {
      return sha === 'sha-latest' ? '最新バージョンの本文' : '古いバージョンの本文'
    })

    render(<HistoryPanel {...defaultProps} />)

    // コミット一覧が表示されること
    expect(await screen.findByText('最新コミット')).toBeInTheDocument()
    expect(screen.getByText('過去コミット')).toBeInTheDocument()

    // 初期選択の本文が表示されること
    const textarea = (await screen.findByRole('textbox', {
      name: '過去バージョンの本文',
    })) as HTMLTextAreaElement
    expect(textarea.value).toBe('最新バージョンの本文')

    // 過去コミットをクリックしてプレビュー切替
    fireEvent.click(screen.getByText('過去コミット'))
    expect(await screen.findByDisplayValue('古いバージョンの本文')).toBeInTheDocument()
  })


  it('calls onRestoreContent and onClose when "この内容に戻す" is clicked', async () => {
    vi.spyOn(historyLib, 'fetchNoteHistory').mockResolvedValue([
      {
        sha: 'sha-1',
        message: 'コミット1',
        authorDate: '2026-10-15T10:00:00Z',
        formattedDate: '2026/10/15 19:00',
      },
    ])
    vi.spyOn(historyLib, 'fetchNoteBodyAtCommit').mockResolvedValue('復元対象の本文')

    const onRestoreContent = vi.fn()
    const onClose = vi.fn()

    render(
      <HistoryPanel
        {...defaultProps}
        onRestoreContent={onRestoreContent}
        onClose={onClose}
      />,
    )

    const restoreBtn = await screen.findByRole('button', { name: 'この内容に戻す' })
    await screen.findByDisplayValue('復元対象の本文')

    fireEvent.click(restoreBtn)

    expect(onRestoreContent).toHaveBeenCalledWith('復元対象の本文')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close icon button is clicked', () => {
    const onClose = vi.fn()
    render(<HistoryPanel {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '履歴を閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
