import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await db.notes.clear()
  await db.folders.clear()
})

describe('db', () => {
  it('stores and retrieves a note with baseSha and dirty flag', async () => {
    await db.notes.put({
      id: 'abc123',
      title: 'テスト',
      folder: '仕事',
      seq: 0,
      tags: [],
      createdAt: '2026-10-12T10:00:00+09:00',
      updatedAt: '2026-10-12T10:00:00+09:00',
      deleted: false,
      llmLinks: [],
      body: '本文',
      baseSha: null,
      dirty: true,
    })
    const note = await db.notes.get('abc123')
    expect(note?.title).toBe('テスト')
    expect(note?.dirty).toBe(true)
    expect(note?.baseSha).toBeNull()
  })

  it('queries notes by folder', async () => {
    await db.notes.bulkPut([
      {
        id: '1', folder: '仕事', seq: 0, title: 'a', tags: [], createdAt: '', updatedAt: '',
        deleted: false, llmLinks: [], body: '', baseSha: 'x', dirty: false,
      },
      {
        id: '2', folder: '日記', seq: 0, title: 'b', tags: [], createdAt: '', updatedAt: '',
        deleted: false, llmLinks: [], body: '', baseSha: 'x', dirty: false,
      },
    ])
    const workNotes = await db.notes.where('folder').equals('仕事').toArray()
    expect(workNotes.map((n) => n.id)).toEqual(['1'])
  })
})
