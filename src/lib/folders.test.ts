import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createFolder, deleteFolder, reorderFolders, topFolder } from './folders'

beforeEach(async () => {
  await db.folders.clear()
  await db.notes.clear()
})

describe('createFolder', () => {
  it('creates a folder at the end of the existing seq order', async () => {
    const existing = [
      { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
      { folderId: '2', name: '仕事', color: '#ff0000', seq: 3 },
    ]
    const folder = await createFolder('新しいフォルダ', existing)
    expect(folder.name).toBe('新しいフォルダ')
    expect(folder.seq).toBe(4)
    expect(folder.folderId).toBeTruthy()

    const stored = await db.folders.get(folder.folderId)
    expect(stored?.name).toBe('新しいフォルダ')
  })

  it('assigns seq 0 when there are no existing folders', async () => {
    const folder = await createFolder('最初のフォルダ', [])
    expect(folder.seq).toBe(0)
  })
})

describe('deleteFolder', () => {
  it('deletes a folder with no notes in it', async () => {
    const folder = { folderId: '1', name: '空フォルダ', color: '#000', seq: 0 }
    await db.folders.add(folder)

    await deleteFolder(folder)

    expect(await db.folders.get('1')).toBeUndefined()
  })

  it('refuses to delete a folder that still has notes, with a count in the error message', async () => {
    const folder = { folderId: '1', name: '仕事', color: '#000', seq: 0 }
    await db.folders.add(folder)
    await db.notes.put({
      id: 'n1', title: 't', folder: '仕事', seq: 0, tags: [],
      createdAt: '', updatedAt: '', deleted: false, llmLinks: [], body: '',
      baseSha: null, dirty: false,
    })

    await expect(deleteFolder(folder)).rejects.toThrow('1件のメモがあるため削除できません')
    expect(await db.folders.get('1')).toEqual(folder)
  })
})

describe('reorderFolders', () => {
  const folders = [
    { folderId: 'a', name: 'A', color: '#000', seq: 0 },
    { folderId: 'b', name: 'B', color: '#000', seq: 1 },
    { folderId: 'c', name: 'C', color: '#000', seq: 2 },
  ]

  it('reassigns seq 0..n-1 in the order given', () => {
    const result = reorderFolders(folders, ['b', 'c', 'a'])
    expect(result.find((f) => f.folderId === 'b')?.seq).toBe(0)
    expect(result.find((f) => f.folderId === 'c')?.seq).toBe(1)
    expect(result.find((f) => f.folderId === 'a')?.seq).toBe(2)
  })

  it('ignores an id that is not in the folder list', () => {
    const result = reorderFolders(folders, ['b', 'does-not-exist', 'a', 'c'])
    expect(result.map((f) => f.folderId)).toEqual(['b', 'a', 'c'])
  })
})

describe('topFolder', () => {
  it('returns the folder with the smallest seq', () => {
    const folders = [
      { folderId: 'b', name: 'B', color: '#000', seq: 2 },
      { folderId: 'a', name: 'A', color: '#000', seq: 0 },
    ]
    expect(topFolder(folders)?.folderId).toBe('a')
  })

  it('returns undefined for an empty list', () => {
    expect(topFolder([])).toBeUndefined()
  })
})
