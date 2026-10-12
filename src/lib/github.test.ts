import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTree, getContent, putContent, encodeUtf8Base64, decodeUtf8Base64 } from './github'

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
