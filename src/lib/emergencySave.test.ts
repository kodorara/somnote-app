import { describe, it, expect, beforeEach } from 'vitest'
import { writeEmergencySave, readEmergencySave, clearEmergencySave } from './emergencySave'

beforeEach(() => {
  localStorage.clear()
})

describe('emergencySave', () => {
  it('round-trips a written save', () => {
    writeEmergencySave({ noteId: 'a', body: '緊急退避した本文', updatedAt: '2026-10-15T10:00:00+09:00' })
    expect(readEmergencySave()).toEqual({
      noteId: 'a',
      body: '緊急退避した本文',
      updatedAt: '2026-10-15T10:00:00+09:00',
    })
  })

  it('returns null when nothing has been saved', () => {
    expect(readEmergencySave()).toBeNull()
  })

  it('returns null for malformed JSON instead of throwing', () => {
    localStorage.setItem('somnote.emergencySave', '{not valid json')
    expect(readEmergencySave()).toBeNull()
  })

  it('returns null for a value missing required fields', () => {
    localStorage.setItem('somnote.emergencySave', JSON.stringify({ noteId: 'a' }))
    expect(readEmergencySave()).toBeNull()
  })

  it('clears the saved value', () => {
    writeEmergencySave({ noteId: 'a', body: 'x', updatedAt: '2026-10-15T10:00:00+09:00' })
    clearEmergencySave()
    expect(readEmergencySave()).toBeNull()
  })
})
