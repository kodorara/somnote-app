import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './lib/db'
import * as githubClient from './lib/github'
import App from './App'

beforeEach(async () => {
  await db.notes.clear()
  await db.folders.clear()
  localStorage.clear()
  vi.restoreAllMocks()
  await db.folders.put({ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 })
})

describe('App startup', () => {
  it('shows the Settings screen when no GitHub PAT is saved yet', async () => {
    render(<App />)
    expect(await screen.findByLabelText('Personal Access Token')).toBeInTheDocument()
  })

  it('opens directly into the editor with a fresh draft note in the last used folder once settings exist', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    localStorage.setItem('lastFolder', '前ノート')
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')
  })

  it('runs fullSync on startup when online and settings exist', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    const getTreeSpy = vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })
    expect(getTreeSpy).toHaveBeenCalled()
  })

  it('pushes the local version and clears the conflict when the user resolves with "ローカル版を残す"', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'conflict-note', title: 'ローカル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-10-12T00:00:00+09:00',
      deleted: false, llmLinks: [], body: 'ローカルの本文', baseSha: 'old-sha', dirty: true,
    })
    const remoteRaw = `---\nid: conflict-note\ntitle: リモート\nfolder: 前ノート\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\ndeleted: false\nllm_links: []\n---\nリモートの本文\n`
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/conflict-note.md', sha: 'new-remote-sha' }], truncated: false,
    })
    vi.spyOn(githubClient, 'getContent').mockResolvedValue({ sha: 'new-remote-sha', content: remoteRaw })
    const putContentSpy = vi.spyOn(githubClient, 'putContent').mockResolvedValue({ content: { sha: 'pushed-sha' } })

    render(<App />)
    const resolveButton = await screen.findByRole('button', { name: 'ローカル版を残す' })
    fireEvent.click(resolveButton)

    await waitFor(() => expect(putContentSpy).toHaveBeenCalled())
    const stored = await db.notes.get('conflict-note')
    expect(stored?.dirty).toBe(false)
    expect(stored?.baseSha).toBe('pushed-sha')
  })
})
