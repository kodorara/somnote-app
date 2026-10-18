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

  it('displays the editor with a draft note immediately from local data without waiting for fullSync to resolve', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    // fullSync で呼ばれる getTree を未解決の Promise にする
    vi.spyOn(githubClient, 'getTree').mockReturnValue(new Promise(() => {}))
    render(<App />)
    // fullSync が pending のままでも、ローカル先行表示によりエディタが表示される
    const textarea = await screen.findByRole('textbox', { name: '本文' })
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveValue('')
  })

  it('does not overwrite user edits in activeNote draft when background fullSync finishes later', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    let resolveTree: (val: { tree: never[]; truncated: boolean }) => void = () => {}
    const treePromise = new Promise<{ tree: never[]; truncated: boolean }>((resolve) => {
      resolveTree = resolve
    })
    vi.spyOn(githubClient, 'getTree').mockReturnValue(treePromise)

    render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })
    expect(textarea).toHaveValue('')

    // ユーザーが先行表示された下書きに文字を入力し始める
    fireEvent.change(textarea, { target: { value: 'ユーザーが書き始めた重要な下書き' } })
    expect(textarea).toHaveValue('ユーザーが書き始めた重要な下書き')

    // バックグラウンド同期が完了する
    await act(async () => {
      resolveTree({ tree: [], truncated: false })
      await new Promise((r) => setTimeout(r, 50))
    })

    // 同期完了後も、ユーザーが入力した下書きが空下書きで上書きされていないこと
    expect(textarea).toHaveValue('ユーザーが書き始めた重要な下書き')
  })

  it('updates selectedFolderRef immediately upon folder selection to prevent race conditions during background sync', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    // フォルダ2つ作成
    await db.folders.clear()
    await db.folders.bulkPut([
      { folderId: 'f1', name: '日常', color: '#ff0000', seq: 0 },
      { folderId: 'f2', name: '仕事', color: '#00ff00', seq: 1 },
    ])
    await db.notes.clear()
    await db.notes.bulkPut([
      {
        id: 'n1',
        title: '日常メモ',
        body: '日常の内容',
        folder: '日常',
        tags: [],
        baseSha: null,
        seq: 0,
        llmLinks: [],
        createdAt: '2026-10-17T00:00:00Z',
        updatedAt: '2026-10-17T00:00:00Z',
        deleted: false,
        dirty: false,
      },
      {
        id: 'n2',
        title: '仕事メモ',
        body: '仕事の内容',
        folder: '仕事',
        tags: [],
        baseSha: null,
        seq: 0,
        llmLinks: [],
        createdAt: '2026-10-17T00:00:00Z',
        updatedAt: '2026-10-17T00:00:00Z',
        deleted: false,
        dirty: false,
      },
    ])

    let resolveTree: (val: { tree: never[]; truncated: boolean }) => void = () => {}
    const treePromise = new Promise<{ tree: never[]; truncated: boolean }>((resolve) => {
      resolveTree = resolve
    })
    vi.spyOn(githubClient, 'getTree').mockReturnValue(treePromise)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    // フォルダ一覧画面へ移動
    const swipeContainer = screen.getByTestId('swipe-container')
    fireEvent.pointerDown(swipeContainer, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(swipeContainer, { clientX: 200, clientY: 100 })
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    fireEvent.pointerDown(swipeContainer, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(swipeContainer, { clientX: 200, clientY: 100 })
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))

    // 「仕事」フォルダを選択する
    const selectButtons = container.querySelectorAll('.folder-select-btn')
    const workFolderBtn = selectButtons[1] as HTMLElement
    expect(workFolderBtn).toBeTruthy()
    fireEvent.click(workFolderBtn)

    // バックグラウンド同期がこの瞬間に完了したとする
    await act(async () => {
      resolveTree({ tree: [], truncated: false })
      await new Promise((r) => setTimeout(r, 50))
    })

    // 同期完了の一覧更新が古いフォルダ(日常)ではなく新フォルダ(仕事)のメモ一覧を表示していること
    await waitFor(() => {
      expect(screen.getByText('仕事メモ')).toBeInTheDocument()
      expect(screen.queryByText('日常メモ')).not.toBeInTheDocument()
    })
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

  it('swipes from the notes screen to the folders screen via the dedicated edge-swipe handle (note list is scrollable and can swallow the gesture natively)', async () => {
    // メモ一覧(.col-notes)はoverflow-y:autoのスクロール領域であり、本文欄の時と同じ
    // 理由(ネイティブなジェスチャー判定が先に割り込む)でスワイプが実機で効かない
    // ことがあった。メモ一覧画面でもエッジスワイプ帯から遷移できることを確認する。
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer) // エディタ -> メモ一覧
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    const edgeHandle = container.querySelector('.editor-edge-swipe-handle--left') as HTMLElement
    expect(edgeHandle).toBeTruthy()
    swipeRight(edgeHandle)

    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))
  })

  it('swipes right from editor to notes immediately without blocking on leaveEditor completion', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const { container } = render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })
    fireEvent.change(textarea, { target: { value: '編集中の本文' } })

    // db.notes.put を未解決Promiseにする(leaveEditorの完了を遅延させる)
    vi.spyOn(db.notes, 'put').mockReturnValue(new Promise(() => {}) as any)

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)

    // leaveEditorが未完了のままでも、即座にmobile-notesクラスへ切り替わること
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

describe('bulk multi-select in the note list', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }
  // App全体のdoSync等(buildIndexAsyncの内部setTimeout(0)ヤマ等)が実時間の
  // setTimeoutに依存しているため、ここではfake timersを使わず、長押し閾値
  // (1500ms)を実際に待つ
  const longPress = async (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    await new Promise((resolve) => setTimeout(resolve, 1550))
    fireEvent.pointerUp(el, { clientX: 100, clientY: 100 })
  }

  it('bulk-moves long-pressed and tapped notes to another folder, matching the folder list order in the picker', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })
    await db.notes.put({
      id: 'n1', title: 'メモ1', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文1', baseSha: 'sha1', dirty: false,
    })
    await db.notes.put({
      id: 'n2', title: 'メモ2', folder: '前ノート', seq: 1, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文2', baseSha: 'sha2', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [
        { path: 'notes/前ノート/n1.md', sha: 'sha1' },
        { path: 'notes/前ノート/n2.md', sha: 'sha2' },
      ],
      truncated: false,
    })
    const { container } = render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    await longPress(await screen.findByText('メモ1'))
    expect(screen.getByText('1件選択中')).toBeInTheDocument()
    // 実機ではpointerup時点でSwipeContainerが元のタップ先へclickを1回だけ手動転送する
    // ため、ここで別途fireEvent.clickを発火させると二重トグルになってしまう
    fireEvent.pointerDown(screen.getByText('メモ2'), { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(screen.getByText('メモ2'), { clientX: 100, clientY: 100 })
    expect(screen.getByText('2件選択中')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: '選択したメモをフォルダ移動' }), {
      target: { value: '仕事' },
    })

    await waitFor(async () => {
      const n1 = await db.notes.get('n1')
      const n2 = await db.notes.get('n2')
      expect(n1?.folder).toBe('仕事')
      expect(n2?.folder).toBe('仕事')
      expect(n1?.dirty).toBe(true)
      expect(n2?.dirty).toBe(true)
    })
    expect(screen.queryByText(/件選択中/)).not.toBeInTheDocument()
  })

  it('bulk-moves notes to the folder in seq order regardless of the folders array order', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    // 「前ノート」(beforeEachで追加済み, seq:0)を起動時のトップフォルダのまま保ち、
    // 「趣味」はそれより後ろ(seq:5)に置く。フォルダ一覧の表示順と同じ並びで
    // ピッカーに出ることを確認する
    await db.folders.put({ folderId: '2', name: '趣味', color: '#00ff00', seq: 5 })
    await db.notes.put({
      id: 'n1', title: 'メモ1', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文1', baseSha: 'sha1', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })
    const { container } = render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    await longPress(await screen.findByText('メモ1'))
    const select = screen.getByRole('combobox', { name: '選択したメモをフォルダ移動' })
    const options = Array.from(select.querySelectorAll('option')) as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toEqual(['', '前ノート', '趣味'])
  })

  it('bulk-deletes (moves to trash) the selected notes', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'n1', title: 'メモ1', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '本文1', baseSha: 'sha1', dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/n1.md', sha: 'sha1' }], truncated: false,
    })
    const { container } = render(<App />)
    expect(await screen.findByRole('textbox', { name: '本文' })).toHaveValue('')

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    await longPress(await screen.findByText('メモ1'))
    fireEvent.click(screen.getByRole('button', { name: '選択したメモをゴミ箱に移動' }))

    await waitFor(async () => {
      const n1 = await db.notes.get('n1')
      expect(n1?.deleted).toBe(true)
      expect(n1?.dirty).toBe(true)
    })
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
    await waitFor(() => {
      const previewMark = document.querySelector('.preview mark.search-highlight')
      expect(previewMark).toBeInTheDocument()
      expect(previewMark?.textContent).toBe('哲学')
    })

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
    await waitFor(() => expect(getTreeSpy).toHaveBeenCalledTimes(1))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
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
    await waitFor(() => {
      const mark = document.querySelector('.preview mark.search-highlight')
      expect(mark).toBeInTheDocument()
      expect(mark?.textContent).toBe('アクション')
    })

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

describe('folder deletion and moving notes to trash', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }

  it('moves notes in deleted folder to trash and shows them in trash view', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: 'f-work', name: '仕事', color: '#ff0000', seq: 1 })
    await db.notes.put({
      id: 'work-note-1',
      title: '仕事用メモ',
      folder: '仕事',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: false,
      llmLinks: [],
      body: '仕事メモの本文',
      baseSha: null,
      dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    // editor -> notes
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    // notes -> folders
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    // 「フォルダ削除」を押して選択モードに入り、「仕事」フォルダを選択して「削除」を押す
    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除' }))
    const folderBtn = await screen.findByRole('button', { name: '仕事' })
    fireEvent.click(folderBtn)
    // 画面遷移せずにフォルダ一覧画面のままであること
    expect(container.querySelector('.columns')).toHaveClass('mobile-folders')

    fireEvent.click(screen.getByRole('button', { name: '選択したフォルダを削除' }))

    // 確認ダイアログが呼ばれたこと
    expect(confirmSpy).toHaveBeenCalled()

    // フォルダがDBから削除され、メモはdeleted: trueになること
    await waitFor(async () => {
      const folder = await db.folders.get('f-work')
      expect(folder).toBeUndefined()
      const note = await db.notes.get('work-note-1')
      expect(note?.deleted).toBe(true)
      expect(note?.dirty).toBe(true)
    })

    // ゴミ箱にバッジ(1)が表示されていること
    const trashBtn = await screen.findByRole('button', { name: 'ゴミ箱 (1)' })
    expect(trashBtn).toBeInTheDocument()

    // ゴミ箱を開くと、元フォルダ名「[仕事]」付きでメモが表示されていること
    fireEvent.click(trashBtn)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    expect(await screen.findByText('仕事用メモ')).toBeInTheDocument()
    expect(screen.getByText(/\[仕事\]/)).toBeInTheDocument()
  })

  it('deletes empty folder without note warning dialog', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.folders.put({ folderId: 'f-empty', name: '空フォルダ', color: '#00ff00', seq: 1 })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    fireEvent.click(screen.getByRole('button', { name: 'フォルダ削除' }))
    const folderBtn = await screen.findByRole('button', { name: '空フォルダ' })
    fireEvent.click(folderBtn)
    fireEvent.click(screen.getByRole('button', { name: '選択したフォルダを削除' }))

    // FolderListの「削除しますか？」は呼ばれるが、メモを含む警告文「含まれる」は呼ばれないこと
    expect(confirmSpy).toHaveBeenCalledWith('「空フォルダ」を削除しますか？')
    const noteWarningCall = confirmSpy.mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('含まれる'))
    expect(noteWarningCall).toBeUndefined()

    await waitFor(async () => {
      const folder = await db.folders.get('f-empty')
      expect(folder).toBeUndefined()
    })
  })

  it('triggers sync when the footer sync button is clicked in folder list', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    const getTreeSpy = vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    getTreeSpy.mockClear()
    const syncBtn = screen.getByRole('button', { name: '同期' })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(getTreeSpy).toHaveBeenCalled()
    })
  })
})

describe('permanent delete in trash', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }
  const longPress = async (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    await new Promise((resolve) => setTimeout(resolve, 1550))
    fireEvent.pointerUp(el, { clientX: 100, clientY: 100 })
  }

  it('permanently deletes note with baseSha: null immediately from IndexedDB', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'local-trash-1',
      title: 'ローカルのみのゴミ箱メモ',
      folder: '前ノート',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: true,
      llmLinks: [],
      body: '消去対象本文',
      baseSha: null,
      dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    // ゴミ箱を開く
    fireEvent.click(await screen.findByRole('button', { name: 'ゴミ箱 (1)' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    // メモをタップしてエディタへ
    fireEvent.click(await screen.findByText('ローカルのみのゴミ箱メモ'))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'), { timeout: 5000 })

    // バナーの「完全に削除」をクリック
    const permDeleteBtn = await screen.findByRole('button', { name: '完全に削除' })
    fireEvent.click(permDeleteBtn)

    // DBから即時完全消滅していること
    await waitFor(async () => {
      const note = await db.notes.get('local-trash-1')
      expect(note).toBeUndefined()
    })

    // メモ一覧に戻っていること
    expect(container.querySelector('.columns')).toHaveClass('mobile-notes')
  })

  it('queues permanent delete for note with baseSha and deletes remotely on sync', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'synced-trash-1',
      title: '同期済みゴミ箱メモ',
      folder: '前ノート',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: true,
      llmLinks: [],
      body: 'リモート削除対象本文',
      baseSha: 'remote-sha-1',
      dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({
      tree: [{ path: 'notes/前ノート/synced-trash-1.md', sha: 'remote-sha-1' }],
      truncated: false,
    })
    const deleteContentSpy = vi.spyOn(githubClient, 'deleteContent').mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    fireEvent.click(await screen.findByRole('button', { name: 'ゴミ箱 (1)' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    fireEvent.click(await screen.findByText('同期済みゴミ箱メモ'))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'), { timeout: 5000 })

    const permDeleteBtn = await screen.findByRole('button', { name: '完全に削除' })
    fireEvent.click(permDeleteBtn)

    // リモートDELETEが呼ばれ、IndexedDBからも完全削除されること
    await waitFor(() => {
      expect(deleteContentSpy).toHaveBeenCalledWith('o', 'somnote-data', 'notes/前ノート/synced-trash-1.md', 'remote-sha-1', 't')
    })
    await waitFor(async () => {
      const note = await db.notes.get('synced-trash-1')
      expect(note).toBeUndefined()
    })
  })

  it('bulk-permanently-deletes notes from trash multi-select', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    await db.notes.put({
      id: 'bulk-del-1',
      title: '一括完全削除1',
      folder: '前ノート',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: true,
      llmLinks: [],
      body: 'b1',
      baseSha: null,
      dirty: false,
    })
    await db.notes.put({
      id: 'bulk-del-2',
      title: '一括完全削除2',
      folder: '前ノート',
      seq: 1,
      tags: [],
      createdAt: '2026-01-01T00:00:00+09:00',
      updatedAt: '2026-01-01T00:00:00+09:00',
      deleted: true,
      llmLinks: [],
      body: 'b2',
      baseSha: null,
      dirty: false,
    })
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'), { timeout: 5000 })

    fireEvent.click(await screen.findByRole('button', { name: 'ゴミ箱 (2)' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'), { timeout: 5000 })

    // 1件目を長押し
    await longPress(await screen.findByText('一括完全削除1'))
    expect(screen.getByText('1件選択中')).toBeInTheDocument()

    // 2件目をタップして選択追加(実機ではpointerup時点でSwipeContainerが元のタップ先へ
    // clickを1回だけ手動転送するため、別途fireEvent.clickは発火させない)
    fireEvent.pointerDown(screen.getByText('一括完全削除2'), { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(screen.getByText('一括完全削除2'), { clientX: 100, clientY: 100 })
    expect(screen.getByText('2件選択中')).toBeInTheDocument()

    // 「完全に削除」ボタンをクリック
    const bulkPermBtn = screen.getByRole('button', { name: '選択したメモを完全に削除' })
    fireEvent.click(bulkPermBtn)

    // DBから両方削除されていること
    await waitFor(async () => {
      const n1 = await db.notes.get('bulk-del-1')
      const n2 = await db.notes.get('bulk-del-2')
      expect(n1).toBeUndefined()
      expect(n2).toBeUndefined()
    })
  })
})

describe('folder templates, one-button tags, swipe history restoration, and in-note search', () => {
  const swipeRight = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 200, clientY: 100 })
  }
  const swipeLeft = (el: Element) => {
    fireEvent.pointerDown(el, { clientX: 200, clientY: 100 })
    fireEvent.pointerUp(el, { clientX: 100, clientY: 100 })
  }

  it('loads the first note whose first line is "テンプレート" when creating a new note, and discards unedited template drafts', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    await db.notes.bulkPut([
      {
        id: 'tmpl-2',
        title: 'テンプレート',
        folder: '前ノート',
        seq: 5,
        tags: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deleted: false,
        llmLinks: [],
        body: 'テンプレート\n2番目のテンプレ内容',
        baseSha: null,
        dirty: false,
      },
      {
        id: 'tmpl-1',
        title: 'テンプレート',
        folder: '前ノート',
        seq: 1,
        tags: ['日報'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deleted: false,
        llmLinks: [],
        body: 'テンプレート\n## 定例フォーマット\n#日報',
        baseSha: null,
        dirty: false,
      },
    ])

    const { container } = render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })
    expect(textarea).toHaveValue('## 定例フォーマット\n#日報')

    // 未編集のままノート一覧へスワイプしても余計な複製メモとして保存されないこと
    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    const allStored = await db.notes.toArray()
    expect(allStored).toHaveLength(2)
  })

  it('returns to the previously opened real note via swipe after cancelling an unedited "+ 新規作成" draft', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    await db.notes.put({
      id: 'real-note-1',
      title: '直前に開いていたメモ',
      folder: '前ノート',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deleted: false,
      llmLinks: [],
      body: '直前に開いていたメモ\n大事な本文',
      baseSha: null,
      dirty: false,
    })

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // 既存メモを開く
    fireEvent.click(await screen.findByText('直前に開いていたメモ'))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('直前に開いていたメモ\n大事な本文')

    // ノート一覧に戻って「+ 新規作成」を押し、何も書かずにノート一覧へ戻る
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    fireEvent.click(screen.getByRole('button', { name: '+ 新規作成' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('')

    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // 再びエディタへスワイプすると、空下書きではなく「直前に開いていたメモ」に戻れること
    swipeLeft(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('直前に開いていたメモ\n大事な本文')
  })

  it('toggles global tags with one click in EditorActionBar and highlights in-note search matches with right-side slider', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    await db.folders.put({ folderId: '2', name: '別フォルダ', color: '#ff00ff', seq: 1 })
    await db.notes.put({
      id: 'other-folder-note',
      title: '別フォルダのメモ',
      folder: '別フォルダ',
      seq: 0,
      tags: ['横断タグ'],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deleted: false,
      llmLinks: [],
      body: '別フォルダの本文\n#横断タグ',
      baseSha: null,
      dirty: false,
    })

    const { container } = render(<App />)
    const textarea = await screen.findByRole('textbox', { name: '本文' })
    fireEvent.change(textarea, { target: { value: '検索対象の言葉と別の一致箇所の言葉' } })

    // タグボタンを開くと別フォルダの #横断タグ も候補に表示され、ワンタップで付与できること
    fireEvent.click(screen.getByRole('button', { name: 'タグ' }))
    const tagChip = await screen.findByRole('button', { name: '#横断タグ' })
    fireEvent.click(tagChip)
    expect(textarea).toHaveValue('検索対象の言葉と別の一致箇所の言葉\n#横断タグ')

    // メモ内検索を開いて「言葉」を検索すると、編集モードのまま色付きハイライトと右側スライダーが表示されること
    fireEvent.click(screen.getByRole('button', { name: 'メモ内を検索' }))
    const searchInput = screen.getByRole('searchbox', { name: '本文内を検索' })
    fireEvent.change(searchInput, { target: { value: '言葉' } })

    await waitFor(() => {
      expect(container.querySelectorAll('mark.search-highlight')).toHaveLength(2)
      expect(screen.getByTestId('editor-search-slider')).toBeInTheDocument()
      expect(screen.getByText('1 / 2件')).toBeInTheDocument()
    })
  })

  it('clears activeNote when switching to a folder with no history so swiping left does not open the previous folder note', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })

    await db.folders.put({ folderId: '2', name: '未訪問フォルダ', color: '#00aaff', seq: 1 })
    await db.notes.put({
      id: 'folder1-note',
      title: '前ノートのメモ',
      folder: '前ノート',
      seq: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deleted: false,
      llmLinks: [],
      body: '前ノートのメモ\n別フォルダの本文',
      baseSha: null,
      dirty: false,
    })

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    const swipeContainer = screen.getByTestId('swipe-container')
    // editor -> notes
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // 「前ノートのメモ」を一度開いてactiveNoteにセットする
    fireEvent.click(await screen.findByText('前ノートのメモ'))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-editor'))

    // editor -> notes -> folders へ移動
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))
    swipeRight(swipeContainer)
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-folders'))

    // 履歴のない「未訪問フォルダ」を選択してnotes画面へ遷移
    fireEvent.click(await screen.findByRole('button', { name: '未訪問フォルダ' }))
    await waitFor(() => expect(container.querySelector('.columns')).toHaveClass('mobile-notes'))

    // ここで左スワイプしても、前フォルダのメモでエディタが開かずmobile-notesに留まること
    swipeLeft(swipeContainer)
    expect(container.querySelector('.columns')).toHaveClass('mobile-notes')
  })

  it('switches to the imported folder and displays its notes after folder-scoped import in Settings', async () => {
    localStorage.setItem('somnote.githubSettings', JSON.stringify({ token: 't', owner: 'o', repo: 'somnote-data' }))
    vi.spyOn(githubClient, 'getTree').mockResolvedValue({ tree: [], truncated: false })
    vi.spyOn(githubClient, 'putContent').mockResolvedValue({ content: { sha: 'new-sha' } })

    await db.folders.put({ folderId: '2', name: '仕事', color: '#ff0000', seq: 1 })

    const { container } = render(<App />)
    await screen.findByRole('textbox', { name: '本文' })

    // 設定モーダルを開く
    fireEvent.click(screen.getByRole('button', { name: '設定を開く' }))
    expect(screen.getByRole('dialog', { name: '設定' })).toBeInTheDocument()

    // 対象範囲を「仕事」にしてテキスト貼り付けインポートを実行
    fireEvent.change(screen.getByLabelText('対象範囲'), { target: { value: '仕事' } })
    fireEvent.change(screen.getByLabelText('インポートするテキストまたはJSON'), {
      target: { value: '仕事フォルダへのインポートメモ\n2行目本文' },
    })
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を取り込む' }))

    expect(await screen.findByText(/フォルダ「仕事」にメモ1件を追加しました/)).toBeInTheDocument()

    // 設定を閉じると、「仕事」フォルダのノート一覧画面が表示されており、インポートしたメモが見えること
    fireEvent.click(screen.getByRole('button', { name: '設定を閉じる' }))
    await waitFor(() => {
      expect(container.querySelector('.columns')).toHaveClass('mobile-notes')
      expect(screen.getByText('仕事フォルダへのインポートメモ')).toBeInTheDocument()
    })
  })
})



