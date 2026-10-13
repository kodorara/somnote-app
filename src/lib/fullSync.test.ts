import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from './db'
import { fullSync } from './fullSync'

const NOTE_MD = `---\nid: a\ntitle: タイトルA\nfolder: 前ノート\nseq: 0\ntags: []\ncreated_at: '2026-01-01T00:00:00+09:00'\nupdated_at: '2026-01-01T00:00:00+09:00'\ndeleted: false\nllm_links: []\n---\n本文A\n`

function githubStub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getTree: vi.fn().mockResolvedValue({
      tree: [
        { path: 'folders.json', sha: 'folders-sha' },
        { path: 'notes/前ノート/a.md', sha: 'a-sha' },
      ],
      truncated: false,
    }),
    getContent: vi.fn().mockImplementation(async (_o: string, _r: string, path: string) => {
      if (path === 'folders.json') {
        return { sha: 'folders-sha', content: JSON.stringify([{ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 }]) }
      }
      if (path === 'notes/前ノート/a.md') return { sha: 'a-sha', content: NOTE_MD }
      throw new Error('unexpected path ' + path)
    }),
    putContent: vi.fn(),
    ...overrides,
  }
}

beforeEach(async () => {
  await db.notes.clear()
  await db.folders.clear()
  await db.syncMeta.clear()
})

describe('fullSync - 初回起動(ローカルが空)', () => {
  it('imports all remote notes and folders into IndexedDB via the same toPull path as ongoing sync', async () => {
    const github = githubStub()
    const result = await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(result.conflicts).toEqual([])
    const storedNote = await db.notes.get('a')
    expect(storedNote?.title).toBe('タイトルA')
    expect(storedNote?.baseSha).toBe('a-sha')
    expect(storedNote?.dirty).toBe(false)

    const storedFolders = await db.folders.toArray()
    expect(storedFolders).toEqual([{ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 }])
  })
})

describe('fullSync - 2回目以降(ローカルにデータがある)', () => {
  it('pushes a locally dirty note and persists the new baseSha', async () => {
    await db.notes.put({
      id: 'a', title: 'タイトルA', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-10-12T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '編集後の本文', baseSha: 'a-sha', dirty: true,
    })
    const github = githubStub({ putContent: vi.fn().mockResolvedValue({ content: { sha: 'a-sha-2' } }) })

    const result = await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(github.putContent).toHaveBeenCalled()
    const stored = await db.notes.get('a')
    expect(stored?.dirty).toBe(false)
    expect(stored?.baseSha).toBe('a-sha-2')
    expect(result.pushed).toBe(1)
  })

  it('returns a conflict with full resolution data, without overwriting the local note', async () => {
    await db.notes.put({
      id: 'a', title: 'ローカルタイトル', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2026-01-01T00:00:00+09:00', updatedAt: '2026-10-12T00:00:00+09:00',
      deleted: false, llmLinks: [], body: 'ローカルの本文', baseSha: 'old-sha', dirty: true,
    })
    const github = githubStub()
    const result = await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(result.conflicts).toHaveLength(1)
    const conflict = result.conflicts[0]
    expect(conflict.id).toBe('a')
    expect(conflict.folder).toBe('前ノート')
    expect(conflict.localBody).toBe('ローカルの本文')
    expect(conflict.remoteBody).toBe('本文A\n')
    expect(conflict.remoteSha).toBe('a-sha')
    expect(conflict.remoteNote.title).toBe('タイトルA')

    const stored = await db.notes.get('a')
    expect(stored?.body).toBe('ローカルの本文')
    expect(stored?.dirty).toBe(true)
  })

  it('discovers and imports a note created on another device without touching unrelated notes', async () => {
    await db.notes.put({
      id: 'existing', title: '既存メモ', folder: '前ノート', seq: 0, tags: [],
      createdAt: '2025-01-01T00:00:00+09:00', updatedAt: '2025-01-01T00:00:00+09:00',
      deleted: false, llmLinks: [], body: '既存の本文', baseSha: 'existing-sha', dirty: false,
    })
    const github = githubStub({
      getTree: vi.fn().mockResolvedValue({
        tree: [
          { path: 'folders.json', sha: 'folders-sha' },
          { path: 'notes/前ノート/existing.md', sha: 'existing-sha' },
          { path: 'notes/前ノート/a.md', sha: 'a-sha' },
        ],
        truncated: false,
      }),
    })

    const result = await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(result.pulled).toBe(1)
    const newNote = await db.notes.get('a')
    expect(newNote?.title).toBe('タイトルA')
    const untouched = await db.notes.get('existing')
    expect(untouched?.body).toBe('既存の本文')
  })

  it('does not overwrite a locally-created folder that has not been pushed yet, when the remote folders.json is unchanged', async () => {
    // 1回目の同期でfolders.jsonのSHAを記録させる
    const github = githubStub()
    await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    // ローカルでフォルダを追加(まだpushしていない)
    await db.folders.add({ folderId: 'new-local', name: 'ローカル新規', color: '#000', seq: 1 })

    // 2回目の同期: リモートのfolders.jsonのSHAは変わっていない(前回と同じ 'folders-sha')
    await fullSync({ token: 't', owner: 'o', repo: 'r' }, github as never)

    const folders = await db.folders.toArray()
    expect(folders.some((f) => f.folderId === 'new-local')).toBe(true)
  })
})
