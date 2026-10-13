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
  // これらのテストはロック画面の後段(設定・同期)の挙動を検証するためのものなので、
  // ロック自体のテストは別途 describe('App lock') で行い、ここでは解除済み状態にしておく。
  localStorage.setItem('somnote.unlocked', 'true')
})

describe('App lock', () => {
  it('shows the password screen when the app has never been unlocked on this device', async () => {
    localStorage.clear()
    render(<App />)
    expect(await screen.findByLabelText('パスワード')).toBeInTheDocument()
  })

  it('unlocks with the correct password and remembers it for next time', async () => {
    localStorage.clear()
    render(<App />)
    fireEvent.change(await screen.findByLabelText('パスワード'), { target: { value: 'waki1223' } })
    fireEvent.click(screen.getByRole('button', { name: '開く' }))
    await waitFor(() => expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument())
    expect(localStorage.getItem('somnote.unlocked')).toBe('true')
  })
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

describe('mobile back navigation', () => {
  it('shows a back button on startup (editor is the initial mobile screen) and steps back to notes then folders', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    localStorage.setItem('lastFolder', '前ノート')
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    // 起動直後はエディタ画面(スマホではここだけが見えている)なので、戻るボタンが出ているはず
    const backButton = screen.getByRole('button', { name: '← 戻る' })
    expect(container.querySelector('.columns')).toHaveClass('mobile-editor')

    fireEvent.click(backButton)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    expect(screen.getByRole('button', { name: '← 戻る' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))
    // フォルダ画面まで戻ったら、それ以上戻る先がないのでボタンは消える
    expect(screen.queryByRole('button', { name: '← 戻る' })).not.toBeInTheDocument()
  })
})
