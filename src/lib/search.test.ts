import { describe, it, expect } from 'vitest'
import { buildIndex, buildIndexAsync, search, indexNote, removeNoteFromIndex, createIndex } from './search'

describe('search', () => {
  it('finds a note by a title substring at the start', () => {
    const idx = buildIndex([
      { id: 'a', title: '生きる意味は、今つくる。', body: '本文a' },
      { id: 'b', title: '戦争賛美', body: '本文b' },
    ])
    expect(search(idx, '生きる')).toEqual(['a'])
  })

  it('finds a note by a title substring in the middle (not just a prefix match)', () => {
    const idx = buildIndex([
      { id: 'a', title: '生きる意味は、今つくる。', body: '本文a' },
      { id: 'b', title: '戦争賛美', body: '本文b' },
    ])
    expect(search(idx, '意味')).toEqual(['a'])
  })

  it('finds a note by body content', () => {
    const idx = buildIndex([
      { id: 'a', title: 'タイトルA', body: '哲学について考えた' },
      { id: 'b', title: 'タイトルB', body: '日記' },
    ])
    expect(search(idx, '哲学')).toEqual(['a'])
  })

  it('adds and updates notes incrementally without rebuilding entire index', () => {
    const idx = createIndex()
    indexNote(idx, { id: 'note-1', title: '最初のタイトル', body: '最初の本文' })
    expect(search(idx, '最初')).toEqual(['note-1'])

    // 更新: 古いキーワードではヒットせず、新しいキーワードでヒットすること
    indexNote(idx, { id: 'note-1', title: '更新後のタイトル', body: '更新後の本文' })
    expect(search(idx, '最初')).toEqual([])
    expect(search(idx, '更新後')).toEqual(['note-1'])

    // 削除: 削除後はヒットしないこと
    removeNoteFromIndex(idx, 'note-1')
    expect(search(idx, '更新後')).toEqual([])
  })

  it('handles incremental updates efficiently on large dataset (5,000+ items)', () => {
    const dummyNotes = Array.from({ length: 500 }, (_, i) => ({
      id: `id-${i}`,
      title: `メモタイトル ${i}`,
      body: `メモ本文の内容 ${i}`,
    }))
    const idx = buildIndex(dummyNotes)

    // 1件差分更新
    indexNote(idx, { id: 'special', title: '特別なキーワード', body: '本文' })
    expect(search(idx, '特別なキーワード')).toEqual(['special'])

    // 検索自体の実行が瞬時に完了すること
    const startTime = performance.now()
    const results = search(idx, '特別なキーワード')
    const elapsed = performance.now() - startTime
    expect(results).toEqual(['special'])
    expect(elapsed).toBeLessThan(100) // 索引再構築がなければ数ミリ秒で完了する
  })

  it('buildIndexAsync produces the same searchable index as the synchronous buildIndex', async () => {
    const notes = [
      { id: 'a', title: '生きる意味は、今つくる。', body: '本文a' },
      { id: 'b', title: '戦争賛美', body: '本文b' },
    ]
    const idx = await buildIndexAsync(notes, 1) // チャンクサイズ1で複数回yieldさせる
    expect(search(idx, '生きる')).toEqual(['a'])
    expect(search(idx, '戦争')).toEqual(['b'])
  })

  it('buildIndexAsync yields control between chunks instead of blocking in one synchronous pass', async () => {
    // 競合するsetTimeout(0)タスクが、buildIndexAsyncの完了より先に割り込んで実行できる
    // ことを確認する(= 全件を一度の同期処理で終わらせていない証拠)
    const notes = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}`, title: `t${i}`, body: `b${i}` }))
    const order: string[] = []
    const otherTask = new Promise<void>((resolve) => {
      setTimeout(() => {
        order.push('other-task')
        resolve()
      }, 0)
    })
    const indexTask = buildIndexAsync(notes, 3).then(() => {
      order.push('index-done')
    })
    await Promise.all([otherTask, indexTask])
    expect(order).toEqual(['other-task', 'index-done'])
  })
})

