import { describe, it, expect, vi } from 'vitest'
import { planSync, runSync } from './sync'
import type { StoredNote } from './db'

function note(overrides: Partial<StoredNote>): StoredNote {
  return {
    id: 'x', title: 't', folder: 'f', seq: 0, tags: [],
    createdAt: '', updatedAt: '', deleted: false, llmLinks: [], body: '',
    baseSha: null, dirty: false,
    ...overrides,
  }
}

describe('planSync', () => {
  it('pushes a dirty note whose remote SHA matches baseSha (no remote change)', () => {
    const local = [note({ id: 'a', dirty: true, baseSha: 'sha1' })]
    const remoteTree = [{ path: 'notes/f/a.md', sha: 'sha1' }]
    const plan = planSync(local, remoteTree)
    expect(plan.toPush).toEqual(['a'])
    expect(plan.conflicts).toEqual([])
  })

  it('flags a conflict when both local and remote changed since baseSha', () => {
    const local = [note({ id: 'a', dirty: true, baseSha: 'sha1' })]
    const remoteTree = [{ path: 'notes/f/a.md', sha: 'sha2' }]
    const plan = planSync(local, remoteTree)
    expect(plan.toPush).toEqual([])
    expect(plan.conflicts).toEqual(['a'])
  })

  it('pulls a note that changed remotely but has no local dirty edit', () => {
    const local = [note({ id: 'a', dirty: false, baseSha: 'sha1', folder: 'f' })]
    const remoteTree = [{ path: 'notes/f/a.md', sha: 'sha2' }]
    const plan = planSync(local, remoteTree)
    expect(plan.toPull).toEqual([{ id: 'a', folder: 'f' }])
  })

  it('treats a dirty note with no baseSha as a new-file push (no sha param)', () => {
    const local = [note({ id: 'new', dirty: true, baseSha: null })]
    const remoteTree: { path: string; sha: string }[] = []
    const plan = planSync(local, remoteTree)
    expect(plan.toPush).toEqual(['new'])
    expect(plan.conflicts).toEqual([])
  })

  it('discovers a note that exists remotely but was never seen locally (created on another device)', () => {
    const local: StoredNote[] = []
    const remoteTree = [{ path: 'notes/日記/new-from-phone.md', sha: 'shaX' }]
    const plan = planSync(local, remoteTree)
    expect(plan.toPull).toEqual([{ id: 'new-from-phone', folder: '日記' }])
  })

  it('does not re-discover a note that is already known locally even if unchanged', () => {
    const local = [note({ id: 'a', folder: 'f', dirty: false, baseSha: 'sha1' })]
    const remoteTree = [{ path: 'notes/f/a.md', sha: 'sha1' }]
    const plan = planSync(local, remoteTree)
    expect(plan.toPull).toEqual([])
  })
})

describe('runSync', () => {
  it('pushes dirty notes and clears their dirty flag with new baseSha', async () => {
    const localNotes = [note({ id: 'a', dirty: true, baseSha: 'sha1', folder: 'f' })]
    const github = {
      putContent: vi.fn().mockResolvedValue({ content: { sha: 'sha-new' } }),
      getContent: vi.fn(),
    }
    const result = await runSync(localNotes, [{ path: 'notes/f/a.md', sha: 'sha1' }], github)
    expect(github.putContent).toHaveBeenCalledWith('f', 'a', expect.anything(), 'sha1')
    expect(result.updated.find((n) => n.id === 'a')?.dirty).toBe(false)
    expect(result.updated.find((n) => n.id === 'a')?.baseSha).toBe('sha-new')
  })

  it('pulls a remotely-changed note and merges the fetched body/title into the returned note', async () => {
    const localNotes = [note({ id: 'a', dirty: false, baseSha: 'sha1', folder: 'f', body: '古い本文' })]
    const remoteRaw = `---\nid: a\ntitle: 新タイトル\nfolder: f\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\ndeleted: false\nllm_links: []\n---\n新しい本文\n`
    const github = {
      putContent: vi.fn(),
      getContent: vi.fn().mockResolvedValue({ sha: 'sha2', content: remoteRaw }),
    }
    const result = await runSync(localNotes, [{ path: 'notes/f/a.md', sha: 'sha2' }], github)
    const pulled = result.updated.find((n) => n.id === 'a')
    expect(github.getContent).toHaveBeenCalledWith('f', 'a')
    expect(pulled?.body).toBe('新しい本文\n')
    expect(pulled?.title).toBe('新タイトル')
    expect(pulled?.baseSha).toBe('sha2')
  })

  it('creates a brand-new local note for one that exists remotely but was never seen locally', async () => {
    const localNotes: StoredNote[] = []
    const remoteRaw = `---\nid: new-from-phone\ntitle: スマホで書いたメモ\nfolder: 日記\nseq: 0\ntags: []\ncreated_at: '2026-10-12T09:00:00+09:00'\nupdated_at: '2026-10-12T09:00:00+09:00'\ndeleted: false\nllm_links: []\n---\n本文\n`
    const github = {
      putContent: vi.fn(),
      getContent: vi.fn().mockResolvedValue({ sha: 'shaX', content: remoteRaw }),
    }
    const result = await runSync(localNotes, [{ path: 'notes/日記/new-from-phone.md', sha: 'shaX' }], github)
    const created = result.updated.find((n) => n.id === 'new-from-phone')
    expect(github.getContent).toHaveBeenCalledWith('日記', 'new-from-phone')
    expect(created?.title).toBe('スマホで書いたメモ')
    expect(created?.dirty).toBe(false)
    expect(created?.baseSha).toBe('shaX')
  })

  it('pulls notes concurrently in batches and reports progress, covering more than one batch', async () => {
    const remoteRawFor = (id: string) =>
      `---\nid: ${id}\ntitle: t-${id}\nfolder: f\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\ndeleted: false\nllm_links: []\n---\n本文${id}\n`
    const remoteTree = Array.from({ length: 25 }, (_, i) => ({ path: `notes/f/n${i}.md`, sha: `sha${i}` }))
    const github = {
      putContent: vi.fn(),
      getContent: vi.fn().mockImplementation(async (_folder: string, id: string) => ({
        sha: `sha-of-${id}`,
        content: remoteRawFor(id),
      })),
    }
    const progressCalls: Array<[number, number, number]> = []
    const result = await runSync([], remoteTree, github, (done, total, batchResult) => {
      progressCalls.push([done, total, batchResult.length])
    })

    expect(result.updated).toHaveLength(25)
    expect(github.getContent).toHaveBeenCalledTimes(25)
    // 25件は並列度12のバッチで3回に分かれる(12,12,1)ため、進捗コールバックも複数回呼ばれる
    expect(progressCalls.length).toBeGreaterThan(1)
    expect(progressCalls[progressCalls.length - 1][0]).toBe(25)
    expect(progressCalls[progressCalls.length - 1][1]).toBe(25)
    // 各バッチで渡されるbatchResultの件数合計は全体件数と一致する
    expect(progressCalls.reduce((sum, [, , n]) => sum + n, 0)).toBe(25)
  })

  it('still delivers already-completed batches via onPullProgress when a later batch throws', async () => {
    const remoteRawFor = (id: string) =>
      `---\nid: ${id}\ntitle: t-${id}\nfolder: f\nseq: 0\ntags: []\ncreated_at: ''\nupdated_at: ''\ndeleted: false\nllm_links: []\n---\n本文${id}\n`
    const remoteTree = Array.from({ length: 20 }, (_, i) => ({ path: `notes/f/n${i}.md`, sha: `sha${i}` }))
    const github = {
      putContent: vi.fn(),
      getContent: vi.fn().mockImplementation(async (_folder: string, id: string) => {
        if (id === 'n15') throw new Error('getContent failed: 403')
        return { sha: `sha-of-${id}`, content: remoteRawFor(id) }
      }),
    }
    const persistedIds: string[] = []
    const onPullProgress = vi.fn((_done: number, _total: number, batchResult: StoredNote[]): void => {
      persistedIds.push(...batchResult.map((n) => n.id))
    })

    await expect(runSync([], remoteTree, github, onPullProgress)).rejects.toThrow('403')

    // 最初のバッチ(n0〜n11, 並列度12)は例外発生前に完了しコールバックに渡されているはず
    expect(persistedIds).toEqual(expect.arrayContaining(['n0', 'n1', 'n11']))
    expect(persistedIds).not.toContain('n19')
  })

  it('reassigns seq within a folder by createdAt ascending after sync', async () => {
    const localNotes = [
      note({ id: 'a', folder: 'f', createdAt: '2026-01-02T00:00:00+09:00', seq: 5 }),
      note({ id: 'b', folder: 'f', createdAt: '2026-01-01T00:00:00+09:00', seq: 5 }),
    ]
    const github = { putContent: vi.fn(), getContent: vi.fn() }
    const result = await runSync(localNotes, [], github)
    const bNote = result.updated.find((n) => n.id === 'b')
    const aNote = result.updated.find((n) => n.id === 'a')
    expect(bNote?.seq).toBe(0)
    expect(aNote?.seq).toBe(1)
  })
})
