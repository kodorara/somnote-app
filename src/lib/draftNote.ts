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
