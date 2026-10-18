import type { StoredNote } from './db'
import { extractTags } from './tags'

export function isTemplateNote(note: StoredNote): boolean {
  if (note.deleted) return false
  const firstLine = (note.body.split(/\r?\n/)[0] ?? '').replace(/^#+\s*/, '').trim()
  return firstLine === 'テンプレート'
}

export function findFolderTemplate(folderNotes: StoredNote[]): StoredNote | null {
  const candidates = folderNotes
    .filter((n) => isTemplateNote(n))
    .sort((a, b) => a.seq - b.seq)
  return candidates[0] ?? null
}

export function extractTemplateBody(templateNote: StoredNote): string {
  const lines = templateNote.body.split(/\r?\n/)
  return lines.slice(1).join('\n').replace(/^\n+/, '')
}

export function createDraftNote(
  folder: string,
  maxSeqInFolder: number,
  templateBody = '',
): StoredNote {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    folder,
    seq: maxSeqInFolder + 1,
    tags: extractTags(templateBody),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    llmLinks: [],
    body: templateBody,
    baseSha: null,
    dirty: false,
  }
}

export function shouldDiscardDraft(body: string, initialTemplateBody = ''): boolean {
  const trimmed = body.trim()
  if (trimmed.length === 0) return true
  if (initialTemplateBody.trim().length > 0 && trimmed === initialTemplateBody.trim()) {
    return true
  }
  return false
}

const TITLE_MAX_LENGTH = 40

// 設計書2.2節: タイトルはfrontmatterに保存する値であり、アプリ側で都度再計算はしない。
// 新規作成時(保存のたび)に本文1行目(先頭40文字程度)から自動算出してセットする。
export function deriveTitle(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? ''
  const trimmed = firstLine.trim()
  return trimmed.length > TITLE_MAX_LENGTH ? trimmed.slice(0, TITLE_MAX_LENGTH) : trimmed
}
