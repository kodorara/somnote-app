import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, type StoredFolder, type StoredNote } from './db'
import {
  createBackupData,
  validateBackupData,
  importBackupData,
  downloadBackupJson,
  type BackupData,
} from './backup'

beforeEach(async () => {
  await db.folders.clear()
  await db.notes.clear()
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
