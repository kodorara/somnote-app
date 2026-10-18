import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, type StoredFolder, type StoredNote } from './db'
import {
  createBackupData,
  validateBackupData,
  importBackupData,
  importFolderBackupData,
  formatNotesAsText,
  parseNotesFromText,
  importTextNotes,
  getDefaultExportFolder,
  saveDefaultExportFolder,
  downloadBackupJson,
  type BackupData,
} from './backup'
import { planSync } from './sync'

beforeEach(async () => {
  await db.folders.clear()
  await db.notes.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('backup module', () => {
  const dummyFolder: StoredFolder = {
    folderId: 'f-1',
    name: '仕事',
    color: '#ff0000',
    seq: 0,
  }

  const dummyNote: StoredNote = {
    id: 'n-1',
    title: 'メモタイトル',
    folder: '仕事',
    seq: 0,
    tags: ['タグ'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deleted: false,
    llmLinks: [],
    body: '本文内容',
    baseSha: 'sha',
    dirty: false,
  }

  describe('createBackupData', () => {
    it('gathers all folders and notes into BackupData structure', async () => {
      await db.folders.put(dummyFolder)
      await db.notes.put(dummyNote)

      const backup = await createBackupData()

      expect(backup.version).toBe(1)
      expect(backup.folders).toEqual([dummyFolder])
      expect(backup.notes).toEqual([dummyNote])
      expect(backup.exportedAt).toBeDefined()
    })

    it('filters by folderName when specified and excludes deleted notes', async () => {
      await db.folders.bulkPut([
        dummyFolder,
        { folderId: 'f-2', name: 'プライベート', color: '#00ff00', seq: 1 },
      ])
      await db.notes.bulkPut([
        dummyNote,
        { ...dummyNote, id: 'n-del', deleted: true },
        { ...dummyNote, id: 'n-other', folder: 'プライベート' },
      ])

      const folderBackup = await createBackupData('仕事')
      expect(folderBackup.folders).toHaveLength(1)
      expect(folderBackup.folders[0].name).toBe('仕事')
      expect(folderBackup.notes).toHaveLength(1)
      expect(folderBackup.notes[0].id).toBe('n-1')
    })
  })

  describe('validateBackupData', () => {
    it('accepts valid backup data', () => {
      const valid: BackupData = {
        version: 1,
        exportedAt: '2026-10-15T12:00:00Z',
        folders: [dummyFolder],
        notes: [dummyNote],
      }
      expect(validateBackupData(valid)).toEqual(valid)
    })

    it('throws when input is not an object', () => {
      expect(() => validateBackupData(null)).toThrow(/オブジェクトではありません/)
      expect(() => validateBackupData('string')).toThrow(/オブジェクトではありません/)
    })

    it('throws when folders is missing or not array', () => {
      expect(() => validateBackupData({ notes: [] })).toThrow(/folders配列がありません/)
    })

    it('throws when a folder entry is malformed', () => {
      expect(() => validateBackupData({ folders: [{ invalid: 123 }], notes: [] })).toThrow(
        /フォルダデータ\[0\]の形式が不正です/,
      )
    })

    it('throws when notes is missing or not array', () => {
      expect(() => validateBackupData({ folders: [] })).toThrow(/notes配列がありません/)
    })

    it('throws when a note entry is malformed', () => {
      expect(() =>
        validateBackupData({
          folders: [],
          notes: [{ id: 'n-1', title: 'T' }], // folder や body が欠けている
        }),
      ).toThrow(/メモデータ\[0\]の形式が不正です/)
    })
  })

  describe('importBackupData', () => {
    it('replaces existing data with imported folders and notes', async () => {
      // 既存の旧データ
      await db.folders.put({ folderId: 'old-f', name: '旧フォルダ', color: '#000', seq: 0 })
      await db.notes.put({
        id: 'old-n',
        title: '旧メモ',
        folder: '旧フォルダ',
        seq: 0,
        tags: [],
        createdAt: '',
        updatedAt: '',
        deleted: false,
        llmLinks: [],
        body: '旧本文',
        baseSha: null,
        dirty: false,
      })

      const newBackup: BackupData = {
        version: 1,
        exportedAt: '2026-10-15T12:00:00Z',
        folders: [dummyFolder],
        notes: [dummyNote],
      }

      const result = await importBackupData(newBackup)

      expect(result).toEqual({ folderCount: 1, noteCount: 1 })

      const currentFolders = await db.folders.toArray()
      expect(currentFolders).toEqual([dummyFolder])

      const currentNotes = await db.notes.toArray()
      expect(currentNotes).toEqual([dummyNote])
    })
  })

  describe('importFolderBackupData (sync safety & ID collision prevention)', () => {
    it('assigns fresh UUIDs so existing notes with the same ID are never overwritten, and normalizes baseSha: null & dirty: true', async () => {
      await db.folders.put(dummyFolder)
      // 同じ id: 'n-1' を持つ未同期のローカル編集メモが存在するケース
      await db.notes.put({
        ...dummyNote,
        id: 'n-1',
        body: 'ローカルの大切な未同期編集',
        baseSha: 'old-remote-sha',
        dirty: true,
      })

      const incoming: BackupData = {
        version: 1,
        exportedAt: '2026-10-18T12:00:00Z',
        folders: [dummyFolder],
        notes: [
          {
            ...dummyNote,
            id: 'n-1',
            body: 'インポートされた別内容\n#分析',
            baseSha: 'stale-sha-from-export',
            dirty: false,
          },
        ],
      }

      const result = await importFolderBackupData(incoming, '仕事')
      expect(result.noteCount).toBe(1)

      const allNotes = await db.notes.toArray()
      expect(allNotes).toHaveLength(2)

      const original = allNotes.find((n) => n.id === 'n-1')!
      expect(original.body).toBe('ローカルの大切な未同期編集')

      const imported = allNotes.find((n) => n.id !== 'n-1')!
      expect(imported.folder).toBe('仕事')
      expect(imported.baseSha).toBeNull()
      expect(imported.dirty).toBe(true)
      expect(imported.tags).toEqual(['分析'])

      // planSync でも偽コンフリクトにならず、toPush に入ること
      const plan = planSync([imported], [{ path: 'notes/仕事/n-1.md', sha: 'remote-sha' }])
      expect(plan.conflicts).toHaveLength(0)
      expect(plan.toPush).toHaveLength(1)
      expect(plan.toPush[0]).toBe(imported.id)
    })
  })

  describe('text format export & import', () => {
    it('formats notes with dates and boundaries and parses them back as new notes', async () => {
      const notes: StoredNote[] = [
        {
          ...dummyNote,
          id: 'n-1',
          title: '1件目',
          body: '1件目\n本文A\n#タグA',
          tags: ['タグA'],
          createdAt: '2026-10-18T01:30:00.000Z',
          updatedAt: '2026-10-18T02:45:00.000Z',
        },
        {
          ...dummyNote,
          id: 'n-2',
          title: '2件目',
          body: '2件目\n本文B',
          tags: [],
          createdAt: '2026-10-18T03:00:00.000Z',
          updatedAt: '2026-10-18T04:00:00.000Z',
        },
      ]

      const text = formatNotesAsText(notes)
      expect(text).toContain('================================================================================')
      expect(text).toContain('■ タイトル: 1件目')
      expect(text).toContain('■ 作成日時:')
      expect(text).toContain('1件目\n本文A\n#タグA')
      expect(text).toContain('2件目\n本文B')

      const parsed = parseNotesFromText(text, '分析フォルダ', 10)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].folder).toBe('分析フォルダ')
      expect(parsed[0].seq).toBe(10)
      expect(parsed[0].body).toBe('1件目\n本文A\n#タグA')
      expect(parsed[0].tags).toEqual(['タグA'])
      expect(parsed[0].baseSha).toBeNull()
      expect(parsed[0].dirty).toBe(true)
      expect(parsed[1].seq).toBe(11)
      expect(parsed[1].body).toBe('2件目\n本文B')

      const importRes = await importTextNotes(text, '分析フォルダ')
      expect(importRes.noteCount).toBe(2)
      const stored = await db.notes.where('folder').equals('分析フォルダ').toArray()
      expect(stored).toHaveLength(2)
    })
  })

  describe('default export folder setting', () => {
    it('saves and retrieves default export folder in localStorage', () => {
      expect(getDefaultExportFolder()).toBe('')
      saveDefaultExportFolder('仕事')
      expect(getDefaultExportFolder()).toBe('仕事')
      saveDefaultExportFolder('')
      expect(getDefaultExportFolder()).toBe('')
    })
  })

  describe('downloadBackupJson', () => {
    it('creates object URL and triggers download', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:dummy-url')
      const revokeObjectURLMock = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      })

      const clickMock = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'a') {
          el.click = clickMock
        }
        return el
      })

      const data: BackupData = {
        version: 1,
        exportedAt: '2026-10-15T12:00:00Z',
        folders: [dummyFolder],
        notes: [dummyNote],
      }

      downloadBackupJson(data, 'custom-backup.json')

      expect(createObjectURLMock).toHaveBeenCalled()
      expect(clickMock).toHaveBeenCalled()
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:dummy-url')
    })
  })
})
