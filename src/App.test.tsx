import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

describe('mobile swipe navigation', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }
  const swipeLeft = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 100, clientY: 100 })
  }

  it('swipes right from editor to notes, and from notes to folders; swipes left to return', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    expect(container.querySelector('.columns')).toHaveClass('mobile-editor')

    // 右スワイプでエディタからノート一覧へ
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // 再度右スワイプでノート一覧からフォルダ一覧へ
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))

    // 左スワイプでフォルダ一覧からノート一覧へ
    swipeLeft(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // 左スワイプでノート一覧からエディタへ
    swipeLeft(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))
  })

  it('swipes away from the editor screen via the dedicated edge-swipe handle (not the textarea itself)', async () => {
    // 本文欄(textarea)はテキスト選択との衝突を避けるためスワイプ対象外になっている。
    // メモ編集画面では本文欄がほぼ画面全体を占めるため、代わりに画面端専用のエッジ
    // スワイプ帯からの操作で遷移できることを確認する(実機で踏んだ不具合の再現テスト)。
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })
    expect(container.querySelector('.columns')).toHaveClass('mobile-editor')

    const edgeHandle = container.querySelector('.editor-edge-swipe-handle--left') as HTMLElement
    expect(edgeHandle).toBeTruthy()
    swipeRight(edgeHandle)

    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
  })
})

describe('creating a new note after navigating back via swipe', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }

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
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')
    const swipeContainer = screen.getByTestId('swipe-container')

    // 右スワイプでノート一覧へ
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    fireEvent.click(await screen.findByText('既存メモ'))
    await screen.findByDisplayValue('既存の本文')

    // 一覧へ右スワイプで戻り、「+ 新規作成」で新しい空メモを開けること
    swipeRight(swipeContainer)
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

describe('autosave and departure save', () => {
  it('autosaves active note to IndexedDB on 30-second interval when body changed', async () => {
    let intervalCb: (() => void) | null = null
    let intervalMs: number | undefined
    vi.spyOn(window, 'setInterval').mockImplementation(((cb: TimerHandler, ms?: number) => {
      if (typeof cb === 'function' && ms === 30000) {
        intervalCb = cb as () => void
        intervalMs = ms
      }
      return 1 as unknown as number
    }) as typeof window.setInterval)

    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    expect(intervalMs).toBe(30000)
    expect(intervalCb).toBeTruthy()

    fireEvent.change(textarea, { target: { value: 'オートセーブのテスト本文' } })

    // 30秒タイマーコールバックを直接発火
    intervalCb!()

    await waitFor(async () => {
      const all = await db.notes.toArray()
      expect(all.some((n) => n.body === 'オートセーブのテスト本文')).toBe(true)
    })
  })


  it('saves active note immediately when document becomes hidden (visibilitychange)', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    fireEvent.change(textarea, { target: { value: 'バックグラウンド保存テスト' } })

    // document.visibilityState を 'hidden' にモックしてイベント発火
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(document, new Event('visibilitychange'))

    await waitFor(async () => {
      const all = await db.notes.toArray()
      expect(all.some((n) => n.body === 'バックグラウンド保存テスト')).toBe(true)
    })

    // 元に戻す
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('saves active note immediately on pagehide event', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    fireEvent.change(textarea, { target: { value: 'ページ離脱保存テスト' } })

    fireEvent(window, new Event('pagehide'))

    await waitFor(async () => {
      const all = await db.notes.toArray()
      expect(all.some((n) => n.body === 'ページ離脱保存テスト')).toBe(true)
    })
  })

  it('synchronously writes an emergency localStorage backup on pagehide, as a fallback for when the async IndexedDB write does not finish before the page is torn down', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    fireEvent.change(textarea, { target: { value: '緊急退避テスト' } })
    fireEvent(window, new Event('pagehide'))

    const raw = localStorage.getItem('somnote.emergencySave')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw as string).body).toBe('緊急退避テスト')
  })

  it('recovers an emergency-saved body on next startup when it is newer than what is in IndexedDB', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'n1', title: '古いタイトル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '保存済みの古い本文', baseSha: 'sha1', dirty: false,
    })
    localStorage.setItem('somnote.emergencySave', JSON.stringify({
      noteId: 'n1', body: '復元されるべき新しい本文', updatedAt: '2026-10-15T12:00:00+09:00',
    }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })

    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    await waitFor(async () => {
      const recovered = await db.notes.get('n1')
      expect(recovered?.body).toBe('復元されるべき新しい本文')
      expect(recovered?.dirty).toBe(true)
    })
    expect(localStorage.getItem('somnote.emergencySave')).toBeNull()
  })

  it('does not overwrite IndexedDB when the emergency save is older than what is already stored', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'n1', title: 'タイトル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-10-15T12:00:00+09:00',
      deleted: false, llmLinks: [], body: '最新の本文', baseSha: 'sha1', dirty: false,
    })
    localStorage.setItem('somnote.emergencySave', JSON.stringify({
      noteId: 'n1', body: '古い緊急退避の本文', updatedAt: '2026-01-01T00:00:00+09:00',
    }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })

    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    await waitFor(async () => {
      expect(localStorage.getItem('somnote.emergencySave')).toBeNull()
    })
    const note = await db.notes.get('n1')
    expect(note?.body).toBe('最新の本文')
  })
})

describe('folder management', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }

  it('creates a folder and pushes folders.json to GitHub', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const putContentSpy = vi.spyOn(githubClient, 'putContent').mockResolvedValue({ content: { sha: 'folders-sha-2' } })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer) // -> notes
    swipeRight(swipeContainer) // -> folders
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
    const swipeRight = (el: Element) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
    }

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

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    swipeRight(swipeContainer)
    await screen.findByLabelText('前ノートを削除')

    fireEvent.click(screen.getByLabelText('前ノートを削除'))

    expect(await screen.findByText(/削除できません/)).toBeInTheDocument()
    expect(await db.folders.get('1')).toBeTruthy()
  })
})

describe('moving a note to a different folder', () => {
  it('removes the note from the current folder view and switches to the notes screen', async () => {
    const swipeRight = (el: Element) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
    }

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
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    fireEvent.click(await screen.findByText('タイトル'))
    await screen.findByDisplayValue('本文')

    fireEvent.change(screen.getByRole('combobox', { name: 'フォルダ移動' }), { target: { value: '仕事' } })

    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    const moved = await db.notes.get('n1')
    expect(moved?.folder).toBe('仕事')
    expect(moved?.dirty).toBe(true)
    expect(moved?.baseSha).toBeNull()
  })

  it('resets search filter so all notes in the new folder are displayed after moving', async () => {
    const swipeRight = (el: Element) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
    }

    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    await db.notes.put({
      id: 'n1', title: '移動するメモ', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: 'キーワードA', baseSha: 'sha1', dirty: false,
    })
    await db.notes.put({
      id: 'n2', title: '仕事の既存メモ', folder: '仕事', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: 'キーワードB', baseSha: 'sha2', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [
        { path: 'notes/前ノート/n1.md', sha: 'sha1' },
        { path: 'notes/仕事/n2.md', sha: 'sha2' },
      ],
      truncated: false,
    })
    const { container } = render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const notesSearchInput = screen.getByPlaceholderText('"前ノート"内を検索')

    // 検索窓に「キーワードA」を入力して検索を実行
    fireEvent.change(notesSearchInput, { target: { value: 'キーワードA' } })

    const swipeContainer = screen.getByTestId('swipe-container')

    // n1を開いて「仕事」フォルダに移動
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    fireEvent.click(await screen.findByText('移動するメモ'))
    await screen.findByDisplayValue('キーワードA')

    fireEvent.change(screen.getByRole('combobox', { name: 'フォルダ移動' }), { target: { value: '仕事' } })
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    // スワイプでフォルダ一覧に戻り、「仕事」フォルダを選択
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })
    fireEvent.click(await screen.findByRole('button', { name: '仕事' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    // 検索状態がリセットされているため、仕事フォルダ内の全メモ(n1, n2)が表示されること
    expect(await screen.findByText('移動するメモ')).toBeInTheDocument()
    expect(await screen.findByText('仕事の既存メモ')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('"仕事"内を検索')).toHaveValue('')
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

describe('search integration', () => {
  it('filters visible notes based on search query without freezing', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'n1', title: '散歩の日記', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '公園を歩いた', baseSha: 'sha1', dirty: false,
    })
    await db.notes.put({
      id: 'n2', title: '哲学の読書メモ', folder: '前ノート', seq: 1, tags: [],
      createdAt: '2026-01-02T00:00:00+09:00', updatedAt: '2026-01-02T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '哲学の本を読んだ', baseSha: 'sha2', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [
        { path: 'notes/前ノート/n1.md', sha: 'sha1' },
        { path: 'notes/前ノート/n2.md', sha: 'sha2' },
      ],
      truncated: false,
    })
    render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const notesSearchInput = screen.getByPlaceholderText('"前ノート"内を検索')

    // 検索窓に「哲学」を入力
    fireEvent.change(notesSearchInput, { target: { value: '哲学' } })

    // デバウンス待機後、読書メモのみが表示され、散歩の日記は非表示になること
    await waitFor(() => {
      expect(screen.queryByText('散歩の日記')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /哲学の読書メモ/ })).toBeInTheDocument()
    })

    // タイトル内のマッチ箇所がハイライトされていること
    expect(screen.getByRole('button', { name: /哲学の読書メモ/ }).querySelector('mark.search-highlight')).toBeInTheDocument()

    // 読書メモを開いてプレビューに切り替えると、本文中の「哲学」もハイライトされること
    fireEvent.click(screen.getByRole('button', { name: /哲学の読書メモ/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'プレビュー' }))
    const previewMark = document.querySelector('.preview mark.search-highlight')
    expect(previewMark).toBeInTheDocument()
    expect(previewMark?.textContent).toBe('哲学')

    // 検索窓をクリアすると両方表示されること
    fireEvent.change(notesSearchInput, { target: { value: '' } })
    await waitFor(() => {
      expect(screen.getByText('散歩の日記')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /哲学の読書メモ/ })).toBeInTheDocument()
    })
  })

  it('searches across all folders when initiated from folders screen', async () => {
    const swipeRight = (el: Element) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
      fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
    }

    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    await db.notes.put({
      id: 'n1', title: '散歩の日記', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '公園を歩いた', baseSha: 'sha1', dirty: false,
    })
    await db.notes.put({
      id: 'n2', title: 'プロジェクト計画', folder: '仕事', seq: 0, tags: [],
      createdAt: '2026-01-02T00:00:00+09:00', updatedAt: '2026-01-02T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '来期のロードマップ', baseSha: 'sha2', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [
        { path: 'notes/前ノート/n1.md', sha: 'sha1' },
        { path: 'notes/仕事/n2.md', sha: 'sha2' },
      ],
      truncated: false,
    })
    const { container } = render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const swipeContainer = screen.getByTestId('swipe-container')

    // スワイプでフォルダ画面(folders)まで戻る
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))
    await screen.findByLabelText('新しいフォルダ名')

    // フォルダ一覧画面での検索プレースホルダーは「全メモを検索」
    const foldersSearchInput = screen.getByPlaceholderText('全メモを検索')
    expect(foldersSearchInput).toBeInTheDocument()

    // 検索窓に「ロードマップ」(仕事フォルダのメモ)を入力
    fireEvent.change(foldersSearchInput, { target: { value: 'ロードマップ' } })

    // 全フォルダ横断で検索され、一覧画面に「プロジェクト計画」が表示されること
    expect(await screen.findByText('プロジェクト計画')).toBeInTheDocument()
    expect(screen.queryByText('散歩の日記')).not.toBeInTheDocument()

    // クリックすると仕事フォルダのメモが開かれること
    fireEvent.click(screen.getByText('プロジェクト計画'))
    await screen.findByDisplayValue('来期のロードマップ')
    expect(screen.getByRole('combobox', { name: 'フォルダ移動' })).toHaveValue('仕事')
  })
})

describe('pull to refresh and editor action bar', () => {
  it('triggers fullSync when pulled down beyond threshold', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    const getTreeSpy = vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })
    const initialCallCount = getTreeSpy.mock.calls.length

    const pullContainer = screen.getByTestId('pull-to-refresh')

    // 下にドラッグして離す
    fireEvent.pointerDown(pullContainer, { clientY: 100 })
    fireEvent.pointerMove(pullContainer, { clientY: 250 })
    expect(screen.getByText('離して同期')).toBeInTheDocument()

    await act(async () => {
      fireEvent.pointerUp(pullContainer)
    })

    // fullSync が実行され getTree が再度呼ばれること
    await waitFor(() => {
      expect(getTreeSpy.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  it('provides all 6 actions in the editor action bar and operates them correctly', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })

    // 1. 本文入力 & 保存ボタン
    fireEvent.change(textarea, { target: { value: 'アクションバーテスト本文' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => {
      const all = await db.notes.toArray()
      expect(all.some((n) => n.body === 'アクションバーテスト本文')).toBe(true)
    })

    // 2. メモ内検索トグル
    fireEvent.click(screen.getByRole('button', { name: 'メモ内を検索' }))
    const editorSearchInput = screen.getByRole('searchbox', { name: '本文内を検索' })
    expect(editorSearchInput).toBeInTheDocument()
    fireEvent.change(editorSearchInput, { target: { value: 'アクション' } })

    // 3. プレビュー切替 & ハイライト確認
    fireEvent.click(screen.getByRole('button', { name: 'プレビュー' }))
    const mark = document.querySelector('.preview mark.search-highlight')
    expect(mark).toBeInTheDocument()
    expect(mark?.textContent).toBe('アクション')

    // 再度プレビューボタン（編集アイコン）を押して編集モードに戻る
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    expect(screen.getByRole('textbox', { name: '本文' })).toBeInTheDocument()

    // 4. LLM連携トグル
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携' }))
    expect(screen.getByRole('button', { name: 'Claudeへ' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'LLM連携を閉じる' }))
    expect(screen.queryByRole('button', { name: 'Claudeへ' })).not.toBeInTheDocument()

    // 5. フォルダ移動
    fireEvent.change(screen.getByRole('combobox', { name: 'フォルダ移動' }), { target: { value: '仕事' } })
    await waitFor(async () => {
      const note = await db.notes.filter((n) => n.body === 'アクションバーテスト本文').first()
      expect(note?.folder).toBe('仕事')
    })

    // 移動後はノート一覧画面に遷移していること
    const container = document.querySelector('.columns')
    expect(container).toHaveClass('mobile-notes')
  })
})

describe('trash virtual folder and restore', () => {
  it('displays trash folder with count badge, lists deleted notes, and restores note', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    // 削除済みメモを1件登録
    await db.notes.put({
      id: 'trash-note-1',
      title: '削除されたメモ',
      folder: '前ノート',
      seq: 0,
      tags: ['テスト'],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-10-12T00:00:00+09:00',
      deleted: true,
      llmLinks: [],
      body: '削除されたメモの本文',
      baseSha: null,
      dirty: false,
    })

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    // スワイプでフォルダ一覧へ
    const swipeContainer = container.querySelector('.columns')!
    // editor -> notes
    fireEvent.pointerDown(swipeContainer, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(swipeContainer, { clientX: 200, clientY: 100 })
    await waitFor(() => {
      expect(swipeContainer).toHaveClass('mobile-notes')
    })

    // notes -> folders
    fireEvent.pointerDown(swipeContainer, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(swipeContainer, { clientX: 200, clientY: 100 })
    await waitFor(() => {
      expect(swipeContainer).toHaveClass('mobile-folders')
    })

    // フォルダ一覧最下部に「ゴミ箱」行とバッジ「1」があること
    const trashBtn = await screen.findByRole('button', { name: 'ゴミ箱 (1)' })
    expect(trashBtn).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()

    // ゴミ箱をクリックしてメモ一覧へ遷移
    fireEvent.click(trashBtn)
    await waitFor(() => {
      expect(swipeContainer).toHaveClass('mobile-notes')
    })


    // ゴミ箱選択中は「+ 新規作成」ボタンが存在しないこと
    expect(screen.queryByRole('button', { name: '+ 新規作成' })).not.toBeInTheDocument()

    // 削除されたメモが一覧に表示されていること
    expect(screen.getByText('削除されたメモ')).toBeInTheDocument()
    expect(screen.getByText(/\[前ノート\]/)).toBeInTheDocument()

    // 削除されたメモをクリックしてエディタを開く
    fireEvent.click(screen.getByText('削除されたメモ'))
    await waitFor(() => {
      expect(swipeContainer).toHaveClass('mobile-editor')
    })

    // ゴミ箱バナーが表示されていること
    expect(screen.getByText('このメモはゴミ箱に入っています')).toBeInTheDocument()

    // バナーの「復元する」ボタンをクリック
    const restoreBtn = screen.getByRole('button', { name: '復元する' })
    fireEvent.click(restoreBtn)

    // DB上で deleted: false に戻っていること
    await waitFor(async () => {
      const restored = await db.notes.get('trash-note-1')
      expect(restored?.deleted).toBe(false)
      expect(restored?.dirty).toBe(true)
    })

    // バナーが消え、通常のゴミ箱アイコン（「ゴミ箱に移動」）に戻っていること
    expect(screen.queryByText('このメモはゴミ箱に入っています')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ゴミ箱に移動' })).toBeInTheDocument()
  })
})

describe('note history and restore', () => {
  it('opens history modal from editor, displays commit history, and restores past body', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    const listCommitsSpy = vi.spyOn(githubClient, 'listCommitsForPath').mockResolvedValue([
      {
        sha: 'commit-past-1',
        message: '過去の更新',
        authorDate: '2026-10-10T12:00:00Z',
        authorName: 'User',
      },
    ])
    const getContentAtRefSpy = vi.spyOn(githubClient, 'getContentAtRef').mockResolvedValue({
      sha: 'blob-past-1',
      content: `---\nid: test-note\ntitle: 過去タイトル\nfolder: 前ノート\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\n---\n巻き戻された過去の本文テキスト`,
    })

    render(<App />)
    const textarea = (await screen.findByRole('textbox', { name: '本文' })) as HTMLTextAreaElement

    // 現在の本文を入力
    fireEvent.change(textarea, { target: { value: '最新の未保存テキスト' } })

    // 編集履歴ボタンをクリック
    const historyBtn = screen.getByRole('button', { name: '編集履歴' })
    fireEvent.click(historyBtn)

    // 履歴モーダルが表示され、コミット一覧が表示される
    expect(await screen.findByText('過去の更新')).toBeInTheDocument()
    expect(listCommitsSpy).toHaveBeenCalled()

    // 過去本文がプレビューされていることを確認
    expect(await screen.findByDisplayValue('巻き戻された過去の本文テキスト')).toBeInTheDocument()
    expect(getContentAtRefSpy).toHaveBeenCalledWith('o', 'somnote-data', expect.any(String), 'commit-past-1', 't')

    // 「この内容に戻す」ボタンをクリック
    const restoreBtn = screen.getByRole('button', { name: 'この内容に戻す' })
    fireEvent.click(restoreBtn)

    // モーダルが閉じ、エディタ本文が巻き戻された内容に更新されていること
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '編集履歴' })).not.toBeInTheDocument()
    })
    expect(textarea.value).toBe('巻き戻された過去の本文テキスト')
  })
})

describe('settings modal and backup integration', () => {
  it('opens settings modal from folder list, allows export and import, and closes modal', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    // URL.createObjectURL と revokeObjectURL のモック
    const createObjectURLMock = vi.fn().mockReturnValue('blob:dummy')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    // フォルダ一覧の下部にある歯車ボタン（「設定を開く」）をクリック
    const settingsBtn = screen.getByRole('button', { name: '設定を開く' })
    fireEvent.click(settingsBtn)

    // 設定モーダルが開く
    const modal = screen.getByRole('dialog', { name: '設定' })
    expect(modal).toBeInTheDocument()

    // バックアップエクスポートボタンをクリック
    const exportBtn = screen.getByRole('button', { name: 'バックアップを書き出す (JSON)' })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled()
    })

    // バックアップインポートをテスト
    const backupData = {
      version: 1,
      exportedAt: '2026-10-15T00:00:00.000Z',
      folders: [{ folderId: 'imported-folder-1', name: 'インポートフォルダ', color: '#ff5500', seq: 0 }],
      notes: [
        {
          id: 'imported-note-1',
          title: 'インポートされたノート',
          folder: 'インポートフォルダ',
          body: 'インポートされたノート本文',
          seq: 0,
          tags: [],
          llmLinks: [],
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
    }

    const file = new File([JSON.stringify(backupData)], 'somnote-backup.json', { type: 'application/json' })
    const fileInput = screen.getByLabelText('バックアップファイルを選択')
    fireEvent.change(fileInput, { target: { files: [file] } })

    // 復元が完了し、メッセージが表示される
    expect(await screen.findByText('復元完了: フォルダ1件、メモ1件を読み込みました')).toBeInTheDocument()

    // 閉じるボタンをクリック
    const closeBtn = screen.getByRole('button', { name: '設定を閉じる' })
    fireEvent.click(closeBtn)

    // モーダルが閉じる
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '設定' })).not.toBeInTheDocument()
    })

    // 復元されたフォルダが画面に表示されていること
    expect(screen.getByRole('button', { name: 'インポートフォルダ' })).toBeInTheDocument()
  })
})




