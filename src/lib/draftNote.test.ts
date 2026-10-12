import { describe, it, expect } from 'vitest'
import { createDraftNote, shouldDiscardDraft } from './draftNote'

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
