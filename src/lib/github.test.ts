import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getTree,
  getContent,
  putContent,
  deleteContent,
  listCommitsForPath,
  getContentAtRef,
  encodeUtf8Base64,
  decodeUtf8Base64,
} from './github'


beforeEach(() => {
  vi.restoreAllMocks()
})

describe('encodeUtf8Base64 / decodeUtf8Base64', () => {
  it('round-trips japanese text', () => {
    const text = '黙っていて、察してもらおうなんて虫がいい。'
    const encoded = encodeUtf8Base64(text)
    expect(decodeUtf8Base64(encoded)).toBe(text)
  })
})

describe('getTree', () => {
  it('calls the git trees API with recursive=1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tree: [{ path: 'notes/仕事/a.md', sha: 'abc' }], truncated: false }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getTree('owner', 'repo', 'main', 'token123')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/trees/main?recursive=1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token123' }) }),
    )
    expect(result.tree).toEqual([{ path: 'notes/仕事/a.md', sha: 'abc' }])
  })

  it('throws an error including GitHub\'s message and rate-limit remaining count on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (name: string) => (name === 'x-ratelimit-remaining' ? '0' : name === 'x-ratelimit-reset' ? '1791825761' : null),
      },
      json: async () => ({ message: 'API rate limit exceeded for user ID 123.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTree('owner', 'repo', 'main', 'token123')).rejects.toThrow(
      /getTree failed: 403 - API rate limit exceeded.*レート制限残り0回/,
    )
  })
})

describe('getContent', () => {
  it('encodes each path segment individually, keeping slashes as path separators', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sha: 's', content: btoa('x') }) })
    vi.stubGlobal('fetch', fetchMock)

    await getContent('owner', 'repo', 'notes/前ノート/a.md', 'token123')

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toBe(`https://api.github.com/repos/owner/repo/contents/notes/${encodeURIComponent('前ノート')}/a.md`)
  })
})

describe('putContent', () => {
  it('omits sha for new file creation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: { sha: 'newsha' } }) })
    vi.stubGlobal('fetch', fetchMock)

    await putContent('owner', 'repo', 'notes/仕事/new.md', '本文', null, 'token123')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.sha).toBeUndefined()
  })

  it('includes sha when updating an existing file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: { sha: 'newsha' } }) })
    vi.stubGlobal('fetch', fetchMock)

    await putContent('owner', 'repo', 'notes/仕事/a.md', '本文', 'oldsha', 'token123')

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.sha).toBe('oldsha')
  })
})

describe('deleteContent', () => {
  it('sends DELETE request with sha and message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await deleteContent('owner', 'repo', 'notes/前ノート/old.md', 'sha-to-delete', 'token123')

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/owner/repo/contents/notes/${encodeURIComponent('前ノート')}/old.md`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          message: 'delete notes/前ノート/old.md',
          sha: 'sha-to-delete',
        }),
      }),
    )
  })

  it('throws on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ message: 'Not Found' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteContent('owner', 'repo', 'notes/前ノート/old.md', 'sha-to-delete', 'token123'),
    ).rejects.toThrow(/deleteContent failed: 404 - Not Found/)
  })
})

describe('listCommitsForPath', () => {
  it('fetches commits for given path and maps them to CommitInfo list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sha: 'commit-sha-1',
          commit: {
            message: 'update memo',
            author: { name: 'User', date: '2026-10-15T12:00:00Z' },
          },
        },
        {
          sha: 'commit-sha-2',
          commit: {
            message: 'initial commit',
            committer: { name: 'Committer', date: '2026-10-10T10:00:00Z' },
          },
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    const commits = await listCommitsForPath('owner', 'repo', 'notes/前ノート/a.md', 'token123')

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/owner/repo/commits?path=notes/${encodeURIComponent('前ノート')}/a.md`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token123' }) }),
    )
    expect(commits).toEqual([
      { sha: 'commit-sha-1', message: 'update memo', authorDate: '2026-10-15T12:00:00Z', authorName: 'User' },
      { sha: 'commit-sha-2', message: 'initial commit', authorDate: '2026-10-10T10:00:00Z', authorName: 'Committer' },
    ])
  })

  it('returns empty array when file does not exist (404)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ message: 'Not Found' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const commits = await listCommitsForPath('owner', 'repo', 'notes/新規/not-found.md', 'token123')
    expect(commits).toEqual([])
  })
})

describe('getContentAtRef', () => {
  it('fetches content at specific ref and decodes base64 content', async () => {
    const raw = '過去バージョンのメモ本文'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: 'blob-sha',
        content: encodeUtf8Base64(raw),
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getContentAtRef('owner', 'repo', 'notes/前ノート/a.md', 'commit-sha-1', 'token123')

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/owner/repo/contents/notes/${encodeURIComponent('前ノート')}/a.md?ref=commit-sha-1`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token123' }) }),
    )
    expect(res).toEqual({ sha: 'blob-sha', content: raw })
  })
})


