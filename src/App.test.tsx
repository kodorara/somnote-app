import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './lib/db'
import * as githubClient from './lib/github'
import App from './App'

beforeEach(async () => {
  // 前のテストでunmountされたコンポーネントのdoSync()等がまだ完了していない場合、
  // ここで1tick待つことで、そのテーブル書き込みが次のテストの実行中に紛れ込む
  // (clear()の後に書き込まれてデータが汚染される)のを防ぐ
  await new Promise((resolve) => setTimeout(resolve, 0))
  await db.notes.clear()
  await db.folders.clear()
  await db.syncMeta.clear()
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

describe('creating a new note after navigating back', () => {
  it('opens a fresh empty draft when "+ 新規作成" is clicked from the note list', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'existing', title: '既存メモ', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '既存の本文', baseSha: 'sha1', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/existing.md', sha: 'sha1' }], truncated: false,
    })

    const { container } = render(<App />)
    // 起動直後の空ドラフトを離れ、一覧→既存メモを開く(新規作成ボタンのテストのため一覧画面へ)
    fireEvent.click(await screen.findByRole('button', { name: '← 戻る' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    fireEvent.click(await screen.findByText('既存メモ'))
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('既存の本文')

    // 一覧へ戻り、「+ 新規作成」で新しい空メモを開けること
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    fireEvent.click(screen.getByRole('button', { name: '+ 新規作成' }))

    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('')
  })
})

describe('explicit save button', () => {
  it('persists the note to IndexedDB immediately without navigating away', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    fireEvent.change(textarea, { target: { value: '保存ボタンのテスト' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(async () => {
      const all = await db.notes.toArray()
      expect(all.some((n) => n.body === '保存ボタンのテスト')).toBe(true)
    })
    // 保存しただけではエディタ画面から移動していない(本文はそのまま表示され続ける)
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('保存ボタンのテスト')
  })
})

describe('folder management', () => {
  it('creates a folder and pushes folders.json to GitHub', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const putContentSpy = vi.spyOn(githubClient, 'putContent').mockResolvedValue({ content: { sha: 'folders-sha-2' } })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    fireEvent.click(screen.getByRole('button', { name: '← 戻る' })) // -> notes
    fireEvent.click(await screen.findByRole('button', { name: '← 戻る' })) // -> folders
    await screen.findByLabelText('新しいフォルダ名')

    fireEvent.change(screen.getByLabelText('新しいフォルダ名'), { target: { value: '趣味' } })
    const createForm = container.querySelector('.folder-create-form') as HTMLElement
    fireEvent.click(createForm.querySelector('button') as HTMLButtonElement)

    // エディタの「フォルダ移動」selectにも同じ名前のoptionが出るため、
    // フォルダ一覧側の実際のボタン(role="button")で曖昧さを避けて確認する
    expect(await screen.findByRole('button', { name: '趣味' })).toBeInTheDocument()
    await waitFor(() => expect(putContentSpy).toHaveBeenCalledWith('o', 'somnote-data', 'folders.json', expect.any(String), null, 't'))
    const sentFolders = JSON.parse(putContentSpy.mock.calls[0][3] as string)
    expect(sentFolders.some((f: { name: string }) => f.name === '趣味')).toBe(true)
  })

  it('refuses to delete a non-empty folder and shows the reason', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'n1', title: 'タイトル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文', baseSha: 'sha1', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })
    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }))
    fireEvent.click(await screen.findByRole('button', { name: '← 戻る' }))
    await screen.findByLabelText('前ノートを削除')

    fireEvent.click(screen.getByLabelText('前ノートを削除'))

    expect(await screen.findByText(/削除できません/)).toBeInTheDocument()
    expect(await db.folders.get('1')).toBeTruthy()
  })
})

describe('moving a note to a different folder', () => {
  it('removes the note from the current folder view and switches to the notes screen', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    await db.notes.put({
      id: 'n1', title: 'タイトル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文', baseSha: 'sha1', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })
    const { container } = render(<App />)
    // 起動直後の新規ドラフトが完全に整うのを待ってから操作する(ドラフト生成の
    // 非同期処理がまだ途中のまま次の操作に進むと、まれにナビゲーションが
    // 取りこぼされることがあったため、本文が空であることまで確認しておく)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    fireEvent.click(await screen.findByText('タイトル'))
    await screen.findByDisplayValue('本文')

    fireEvent.change(screen.getByLabelText('フォルダ移動'), { target: { value: '仕事' } })

    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    const moved = await db.notes.get('n1')
    expect(moved?.folder).toBe('仕事')
    expect(moved?.dirty).toBe(true)
  })
})

describe('startup folder selection', () => {
  it('opens the draft in the folder with the smallest seq, not insertion order', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    // beforeEachで先に folderId:'1'(前ノート, seq:0) が入っているので、
    // それより小さいseqの別フォルダを追加し、そちらが優先されることを確認する
    await db.folders.put({ folderId: '0', name: '一番上', color: '#000', seq: -1 })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })
    expect(screen.getByRole('button', { name: '一番上' })).toHaveAttribute('aria-current', 'true')
  })
})

describe('reordering folders', () => {
  it('drags a folder above the one before it and pushes the updated folders.json', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const putContentSpy = vi.spyOn(githubClient, 'putContent').mockResolvedValue({ content: { sha: 'x' } })
    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const rows = screen.getAllByRole('listitem')
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect)
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({ top: 40, height: 40 } as DOMRect)
    const handle = screen.getByLabelText('仕事をドラッグして並び替え')
    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 }) // 1行目(前ノート)の中点より上まで動かす
    fireEvent.pointerUp(handle, { pointerId: 1 })

    await waitFor(async () => {
      const stored = await db.folders.toArray()
      const work = stored.find((f) => f.folderId === '2')
      const main = stored.find((f) => f.folderId === '1')
      expect(work?.seq).toBe(0)
      expect(main?.seq).toBe(1)
    })
    await waitFor(() => expect(putContentSpy).toHaveBeenCalledWith('o', 'somnote-data', 'folders.json', expect.any(String), null, 't'))
  })
})
