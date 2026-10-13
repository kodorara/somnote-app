import { describe, it, expect } from 'vitest'
import { createDraftNote, shouldDiscardDraft, deriveTitle } from './draftNote'

describe('createDraftNote', () => {
  it('creates an empty note in the given folder with a fresh id', () => {
    const note = createDraftNote('前ノート', 7)
    expect(note.folder).toBe('前ノート')
    expect(note.body).toBe('')
    expect(note.dirty).toBe(false)
    expect(note.seq).toBe(8)
    expect(note.id).toBeTruthy()
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
