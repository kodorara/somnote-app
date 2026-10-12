import { describe, it, expect, beforeEach } from 'vitest'
import { getGithubSettings, saveGithubSettings } from './githubSettings'

beforeEach(() => localStorage.clear())

describe('githubSettings', () => {
  it('returns null when nothing is saved yet', () => {
    expect(getGithubSettings()).toBeNull()
  })

  it('round-trips saved settings', () => {
    saveGithubSettings({ token: 'ghp_xxx', owner: 'uranari', repo: 'somnote-data' })
    expect(getGithubSettings()).toEqual({ token: 'ghp_xxx', owner: 'uranari', repo: 'somnote-data' })
  })
})
