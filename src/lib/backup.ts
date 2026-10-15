import { db, type StoredFolder, type StoredNote } from './db'

export interface BackupData {
  version: 1
  exportedAt: string
  folders: StoredFolder[]
  notes: StoredNote[]
}

/**
 * IndexedDB内の全フォルダおよび全メモを取得し、BackupDataオブジェクトを構築する。
 */
export async function createBackupData(): Promise<BackupData> {
  const folders = await db.folders.toArray()
  const notes = await db.notes.toArray()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders,
    notes,
  }
}

/**
 * 読み込んだJSONオブジェクトが正しいBackupDataスキーマを満たしているか検証する。
 */
export function validateBackupData(input: unknown): BackupData {
  if (!input || typeof input !== 'object') {
    throw new Error('バックアップデータが無効です（オブジェクトではありません）')
  }

  const obj = input as Record<string, unknown>

  if (!Array.isArray(obj.folders)) {
    throw new Error('バックアップデータが無効です（folders配列がありません）')
  }

  for (let i = 0; i < obj.folders.length; i++) {
    const f = obj.folders[i]
    if (!f || typeof f !== 'object' || typeof f.folderId !== 'string' || typeof f.name !== 'string') {
      throw new Error(`フォルダデータ[${i}]の形式が不正です`)
    }
  }

  if (!Array.isArray(obj.notes)) {
    throw new Error('バックアップデータが無効です（notes配列がありません）')
  }

  for (let i = 0; i < obj.notes.length; i++) {
    const n = obj.notes[i]
    if (
      !n ||
      typeof n !== 'object' ||
      typeof n.id !== 'string' ||
      typeof n.title !== 'string' ||
      typeof n.folder !== 'string' ||
      typeof n.body !== 'string'
    ) {
      throw new Error(`メモデータ[${i}]の形式が不正です`)
    }
  }

  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    folders: obj.folders as StoredFolder[],
    notes: obj.notes as StoredNote[],
  }
}

/**
 * バックアップデータをIndexedDBにインポート（既存データを全置換）する。
 */
export async function importBackupData(data: BackupData): Promise<{ folderCount: number; noteCount: number }> {
  await db.folders.clear()
  if (data.folders.length > 0) {
    await db.folders.bulkPut(data.folders)
  }

  await db.notes.clear()
  if (data.notes.length > 0) {
    await db.notes.bulkPut(data.notes)
  }

  return {
    folderCount: data.folders.length,
    noteCount: data.notes.length,
  }
}

/**
 * BackupDataをJSONファイルとしてブラウザからダウンロード保存する。
 */
export function downloadBackupJson(data: BackupData, customFilename?: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  const filename = customFilename ?? `somnote-backup-${dateStr}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
