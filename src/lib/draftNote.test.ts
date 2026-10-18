import { describe, it, expect } from 'vitest'
import {
  createDraftNote,
  shouldDiscardDraft,
  deriveTitle,
  findFolderTemplate,
  extractTemplateBody,
} from './draftNote'
import type { StoredNote } from './db'

function makeStoredNote(overrides: Partial<StoredNote> = {}): StoredNote {
  return {
    id: overrides.id ?? 'note-1',
    title: overrides.title ?? '',
    folder: overrides.folder ?? '仕事',
    seq: overrides.seq ?? 1,
    tags: overrides.tags ?? [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deleted: overrides.deleted ?? false,
    llmLinks: [],
    body: overrides.body ?? '',
    baseSha: null,
    dirty: false,
  }
}

describe('findFolderTemplate & extractTemplateBody', () => {
  it('picks the first non-deleted note (lowest seq) whose first line is テンプレート', () => {
    const notes: StoredNote[] = [
      makeStoredNote({ id: 'n1', seq: 3, body: 'テンプレート\n2番目のテンプレ' }),
      makeStoredNote({ id: 'n2', seq: 1, body: 'テンプレート\n1番目のテンプレ\n#定例' }),
      makeStoredNote({ id: 'n3', seq: 0, deleted: true, body: 'テンプレート\n削除済みテンプレ' }),
      makeStoredNote({ id: 'n4', seq: 2, body: '普通のメモ\nテンプレート' }),
    ]
    const found = findFolderTemplate(notes)
    expect(found?.id).toBe('n2')
    expect(extractTemplateBody(found!)).toBe('1番目のテンプレ\n#定例')
  })

  it('supports markdown heading prefix on first line (# テンプレート)', () => {
    const notes: StoredNote[] = [
      makeStoredNote({ id: 'n1', seq: 1, body: '# テンプレート\n\n## 日報\n- 実施内容:' }),
    ]
    const found = findFolderTemplate(notes)
    expect(found?.id).toBe('n1')
    expect(extractTemplateBody(found!)).toBe('## 日報\n- 実施内容:')
  })

  it('returns null when no template note exists', () => {
    const notes: StoredNote[] = [
      makeStoredNote({ id: 'n1', seq: 1, body: '通常のメモ' }),
    ]
    expect(findFolderTemplate(notes)).toBeNull()
  })
})

describe('createDraftNote', () => {
  it('creates an empty note in the given folder with a fresh id', () => {
    const note = createDraftNote('前ノート', 7)
    expect(note.folder).toBe('前ノート')
    expect(note.body).toBe('')
    expect(note.dirty).toBe(false)
    expect(note.seq).toBe(8)
    expect(note.id).toBeTruthy()
  })

  it('initializes body and tags when templateBody is provided', () => {
    const note = createDraftNote('仕事', 3, '定例メモ\n#会議')
    expect(note.body).toBe('定例メモ\n#会議')
    expect(note.tags).toEqual(['会議'])
    expect(note.dirty).toBe(false)
  })
})

describe('shouldDiscardDraft', () => {
  it('returns true for an empty body', () => {
    expect(shouldDiscardDraft('')).toBe(true)
  })

  it('returns true for whitespace-only body', () => {
    expect(shouldDiscardDraft('   \n  ')).toBe(true)
  })

  it('returns false once there is any real content', () => {
    expect(shouldDiscardDraft('a')).toBe(false)
  })

  it('returns true when body matches initialTemplateBody (unedited template draft)', () => {
    expect(shouldDiscardDraft('## 日報\n- 項目', '## 日報\n- 項目')).toBe(true)
    expect(shouldDiscardDraft('## 日報\n- 項目\n追記あり', '## 日報\n- 項目')).toBe(false)
  })
})

describe('deriveTitle', () => {
  it('uses the first line as the title', () => {
    expect(deriveTitle('タイトル行\n本文続き')).toBe('タイトル行')
  })

  it('skips leading blank lines', () => {
    expect(deriveTitle('\n\n最初の非空行\n続き')).toBe('最初の非空行')
  })

  it('truncates to 40 characters', () => {
    const longLine = 'あ'.repeat(50)
    const title = deriveTitle(longLine)
    expect(title).toHaveLength(40)
    expect(title).toBe('あ'.repeat(40))
  })

  it('returns an empty string for an empty or whitespace-only body', () => {
    expect(deriveTitle('')).toBe('')
    expect(deriveTitle('   \n  ')).toBe('')
  })
})
