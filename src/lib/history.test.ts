import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  notePathOf,
  extractBodyFromContent,
  formatCommitDate,
  fetchNoteHistory,
  fetchNoteBodyAtCommit,
} from './history'
import * as github from './github'
import type { GithubSettings } from './githubSettings'

beforeEach(() => {
  vi.restoreAllMocks()
})

const dummySettings: GithubSettings = {
  token: 'dummy-token',
  owner: 'owner',
  repo: 'repo',
}

describe('history module', () => {
  it('constructs correct path for note', () => {
    expect(notePathOf('前ノート', 'note-123')).toBe('notes/前ノート/note-123.md')
  })

  it('extracts body from frontmatter markdown', () => {
    const raw = `---\nid: note-1\ntitle: タイトル\nfolder: フォルダ\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\n---\n本文のテキスト`
    expect(extractBodyFromContent(raw)).toBe('本文のテキスト')
  })

  it('falls back to raw text if frontmatter delimiter is missing', () => {
    const raw = 'プレーンテキスト本文'
    expect(extractBodyFromContent(raw)).toBe('プレーンテキスト本文')
  })

  it('formats commit date correctly', () => {
    const formatted = formatCommitDate('2026-10-15T09:30:00Z')
    // タイムゾーンによる時差を考慮し、年と分が含まれていることを確認
    expect(formatted).toMatch(/2026\/\d{2}\/\d{2} \d{2}:30/)
  })

  it('fetchNoteHistory fetches commits and adds formattedDate', async () => {
    vi.spyOn(github, 'listCommitsForPath').mockResolvedValue([
      { sha: 'sha-1', message: 'commit 1', authorDate: '2026-10-15T10:00:00Z' },
    ])

    const history = await fetchNoteHistory(dummySettings, '前ノート', 'note-1')

    expect(github.listCommitsForPath).toHaveBeenCalledWith('owner', 'repo', 'notes/前ノート/note-1.md', 'dummy-token')
    expect(history.length).toBe(1)
    expect(history[0].sha).toBe('sha-1')
    expect(history[0].formattedDate).toBeDefined()
  })

  it('fetchNoteBodyAtCommit fetches raw content at ref and extracts body', async () => {
    const raw = `---\nid: note-1\ntitle: T\nfolder: F\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\n---\n過去の本文`
    vi.spyOn(github, 'getContentAtRef').mockResolvedValue({
      sha: 'blob-sha',
      content: raw,
    })

    const body = await fetchNoteBodyAtCommit(dummySettings, '前ノート', 'note-1', 'sha-1')

    expect(github.getContentAtRef).toHaveBeenCalledWith('owner', 'repo', 'notes/前ノート/note-1.md', 'sha-1', 'dummy-token')
    expect(body).toBe('過去の本文')
  })
})
