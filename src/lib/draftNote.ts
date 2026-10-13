import type { StoredNote } from './db'

export function createDraftNote(folder: string, maxSeqInFolder: number): StoredNote {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    folder,
    seq: maxSeqInFolder + 1,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    llmLinks: [],
    body: '',
    baseSha: null,
    dirty: false,
  }
}

export function shouldDiscardDraft(body: string): boolean {
  return body.trim().length === 0
}

const TITLE_MAX_LENGTH = 40

// 設計書2.2節: タイトルはfrontmatterに保存する値であり、アプリ側で都度再計算はしない。
// 新規作成時(保存のたび)に本文1行目(先頭40文字程度)から自動算出してセットする。
export function deriveTitle(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? ''
  const trimmed = firstLine.trim()
  return trimmed.length > TITLE_MAX_LENGTH ? trimmed.slice(0, TITLE_MAX_LENGTH) : trimmed
}
