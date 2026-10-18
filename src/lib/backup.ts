import { db, type StoredFolder, type StoredNote } from './db'
import { deriveTitle } from './draftNote'
import { extractTags } from './tags'

export interface BackupData {
  version: 1
  exportedAt: string
  folders: StoredFolder[]
  notes: StoredNote[]
}

const DEFAULT_EXPORT_FOLDER_KEY = 'somnote.defaultExportFolder'
const NOTE_BLOCK_DELIMITER = '================================================================================'
const NOTE_HEADER_SEPARATOR = '--------------------------------------------------------------------------------'

export function getDefaultExportFolder(): string {
  return localStorage.getItem(DEFAULT_EXPORT_FOLDER_KEY) ?? ''
}

export function saveDefaultExportFolder(folderName: string): void {
  if (!folderName) {
    localStorage.removeItem(DEFAULT_EXPORT_FOLDER_KEY)
  } else {
    localStorage.setItem(DEFAULT_EXPORT_FOLDER_KEY, folderName)
  }
}

/**
 * IndexedDB内のフォルダおよびメモを取得し、BackupDataオブジェクトを構築する。
 * folderNameが指定された場合はそのフォルダの有効メモ(!deleted)のみを対象にする。
 */
export async function createBackupData(folderName?: string): Promise<BackupData> {
  const allFolders = await db.folders.toArray()
  const allNotes = await db.notes.toArray()
  if (folderName) {
    const folders = allFolders.filter((f) => f.name === folderName)
    const notes = allNotes
      .filter((n) => n.folder === folderName && !n.deleted)
      .sort((a, b) => a.seq - b.seq)
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      folders,
      notes,
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: allFolders,
    notes: allNotes,
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

async function ensureTargetFolderExists(targetFolderName: string): Promise<number> {
  const existingFolders = await db.folders.toArray()
  if (existingFolders.some((f) => f.name === targetFolderName)) {
    return 0
  }
  const maxSeq = existingFolders.reduce((m, f) => Math.max(m, f.seq), -1)
  await db.folders.put({
    folderId: crypto.randomUUID(),
    name: targetFolderName,
    color: '#a389f4',
    seq: maxSeq + 1,
  })
  return 1
}

/**
 * 指定フォルダへBackupDataのメモを追加インポートする。
 * - 既存メモとのID衝突による上書き事故を防ぐため、常に新規UUIDを採番する。
 * - GitHub同期(planSync)で偽のコンフリクトを起こさないよう、baseSha: null, dirty: trueに正規化する。
 */
export async function importFolderBackupData(
  data: BackupData,
  targetFolderName: string,
): Promise<{ folderCount: number; noteCount: number }> {
  const folderAdded = await ensureTargetFolderExists(targetFolderName)
  const existingNotes = await db.notes.where('folder').equals(targetFolderName).toArray()
  let nextSeq = existingNotes.reduce((m, n) => Math.max(m, n.seq), -1) + 1
  const now = new Date().toISOString()

  const activeInputNotes = data.notes.filter((n) => !n.deleted)
  const normalizedNotes: StoredNote[] = activeInputNotes.map((n) => ({
    id: crypto.randomUUID(),
    title: deriveTitle(n.body) || n.title,
    folder: targetFolderName,
    seq: nextSeq++,
    tags: extractTags(n.body),
    createdAt: n.createdAt || now,
    updatedAt: n.updatedAt || now,
    deleted: false,
    llmLinks: Array.isArray(n.llmLinks) ? n.llmLinks : [],
    body: n.body,
    baseSha: null,
    dirty: true,
    pendingOldPath: null,
    pendingPermanentDelete: false,
  }))

  if (normalizedNotes.length > 0) {
    await db.notes.bulkPut(normalizedNotes)
  }

  return {
    folderCount: folderAdded,
    noteCount: normalizedNotes.length,
  }
}

function formatDisplayDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * メモ配列を人間・NotebookLM・スマホ貼り付けに適した区切り線＋日付付きテキスト形式に変換する。
 */
export function formatNotesAsText(notes: StoredNote[]): string {
  const activeNotes = notes.filter((n) => !n.deleted)
  if (activeNotes.length === 0) return ''

  const blocks = activeNotes.map((n) => {
    const title = n.title || deriveTitle(n.body) || '(無題)'
    const tags = (n.tags?.length ? n.tags : extractTags(n.body)).map((t) => `#${t}`).join(' ')
    const lines = [
      NOTE_BLOCK_DELIMITER,
      `■ タイトル: ${title}`,
      `■ フォルダ: ${n.folder}`,
      `■ 作成日時: ${formatDisplayDate(n.createdAt)}`,
      `■ 更新日時: ${formatDisplayDate(n.updatedAt)}`,
    ]
    if (tags) {
      lines.push(`■ タグ: ${tags}`)
    }
    lines.push(NOTE_HEADER_SEPARATOR)
    lines.push(n.body)
    return lines.join('\n')
  })

  return `${blocks.join('\n')}\n${NOTE_BLOCK_DELIMITER}`
}

function parseDateOrFallback(raw: string | undefined, fallbackIso: string): string {
  if (!raw) return fallbackIso
  const trimmed = raw.trim()
  if (!trimmed) return fallbackIso
  const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/, '$1T$2:00')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? fallbackIso : d.toISOString()
}

/**
 * テキスト形式（区切り線フォーマットまたはプレーンテキスト）からメモ配列を生成する。
 * 常に新規UUID・baseSha: null・dirty: trueで生成する。
 */
export function parseNotesFromText(
  text: string,
  targetFolderName: string,
  startSeq = 0,
): StoredNote[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim()
  if (!normalizedText) return []

  const now = new Date().toISOString()
  const hasDelimiter = /^={10,}\s*$/m.test(normalizedText)

  if (!hasDelimiter) {
    return [
      {
        id: crypto.randomUUID(),
        title: deriveTitle(normalizedText),
        folder: targetFolderName,
        seq: startSeq,
        tags: extractTags(normalizedText),
        createdAt: now,
        updatedAt: now,
        deleted: false,
        llmLinks: [],
        body: normalizedText,
        baseSha: null,
        dirty: true,
        pendingOldPath: null,
        pendingPermanentDelete: false,
      },
    ]
  }

  const rawBlocks = normalizedText
    .split(/^={10,}\s*$/m)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  let seq = startSeq
  const notes: StoredNote[] = []

  for (const block of rawBlocks) {
    const sepMatch = /^-{10,}\s*$/m.exec(block)
    let createdAt = now
    let updatedAt = now
    let body = block

    if (sepMatch && sepMatch.index !== undefined) {
      const headerPart = block.slice(0, sepMatch.index)
      body = block.slice(sepMatch.index + sepMatch[0].length).replace(/^\n/, '')
      for (const line of headerPart.split('\n')) {
        const createdMatch = /^■\s*作成日時:\s*(.+)$/.exec(line.trim())
        if (createdMatch) {
          createdAt = parseDateOrFallback(createdMatch[1], now)
        }
        const updatedMatch = /^■\s*更新日時:\s*(.+)$/.exec(line.trim())
        if (updatedMatch) {
          updatedAt = parseDateOrFallback(updatedMatch[1], createdAt)
        }
      }
    }

    if (!body.trim()) continue

    notes.push({
      id: crypto.randomUUID(),
      title: deriveTitle(body),
      folder: targetFolderName,
      seq: seq++,
      tags: extractTags(body),
      createdAt,
      updatedAt,
      deleted: false,
      llmLinks: [],
      body,
      baseSha: null,
      dirty: true,
      pendingOldPath: null,
      pendingPermanentDelete: false,
    })
  }

  return notes
}

/**
 * テキスト形式のメモ群を指定フォルダに追加インポートする。
 */
export async function importTextNotes(
  text: string,
  targetFolderName: string,
): Promise<{ noteCount: number }> {
  await ensureTargetFolderExists(targetFolderName)
  const existingNotes = await db.notes.where('folder').equals(targetFolderName).toArray()
  const startSeq = existingNotes.reduce((m, n) => Math.max(m, n.seq), -1) + 1
  const parsed = parseNotesFromText(text, targetFolderName, startSeq)
  if (parsed.length > 0) {
    await db.notes.bulkPut(parsed)
  }
  return { noteCount: parsed.length }
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

/**
 * テキスト文字列を.txtファイルとしてブラウザからダウンロード保存する。
 */
export function downloadTextFile(text: string, customFilename?: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
  const filename = customFilename ?? `somnote-export-${dateStr}.txt`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
