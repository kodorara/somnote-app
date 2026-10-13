import { describe, it, expect, beforeEach } from 'vitest'
import { checkPassword, isUnlocked, setUnlocked } from './appLock'

beforeEach(() => localStorage.clear())

describe('checkPassword', () => {
  it('returns true for the correct password', async () => {
    expect(await checkPassword('waki1223')).toBe(true)
  })

  it('returns false for an incorrect password', async () => {
    expect(await checkPassword('wrong')).toBe(false)
  })

  it('returns false for an empty password', async () => {
    expect(await checkPassword('')).toBe(false)
  })
})

describe('isUnlocked / setUnlocked', () => {
  it('is locked by default', () => {
    expect(isUnlocked()).toBe(false)
  })

  it('stays unlocked after setUnlocked', () => {
    setUnlocked()
    expect(isUnlocked()).toBe(true)
  })
})
