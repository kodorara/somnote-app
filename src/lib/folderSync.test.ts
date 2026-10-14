import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from './db'
import { pushFolders } from './folderSync'
import { GithubApiError } from './github'

beforeEach(async () => {
  await db.folders.clear()
  await db.syncMeta.clear()
})

describe('pushFolders', () => {
  it('pushes the current folder list without a base sha on first push', async () => {
    await db.folders.bulkPut([
      { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
      { folderId: '2', name: '仕事', color: '#ff0000', seq: 1 },
    ])
    const github = { putContent: vi.fn().mockResolvedValue({ content: { sha: 'new-sha' } }) }

    await pushFolders({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(github.putContent).toHaveBeenCalledWith(
      'o', 'r', 'folders.json', expect.any(String), null, 't',
    )
    const sentContent = JSON.parse(github.putContent.mock.calls[0][3])
    expect(sentContent).toEqual([
      { folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 },
      { folderId: '2', name: '仕事', color: '#ff0000', seq: 1 },
    ])
  })

  it('stores the returned sha so the next push uses it as the base sha', async () => {
    await db.folders.bulkPut([{ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 }])
    const github = { putContent: vi.fn().mockResolvedValue({ content: { sha: 'sha-1' } }) }
    await pushFolders({ token: 't', owner: 'o', repo: 'r' }, github as never)

    const github2 = { putContent: vi.fn().mockResolvedValue({ content: { sha: 'sha-2' } }) }
    await pushFolders({ token: 't', owner: 'o', repo: 'r' }, github2 as never)

    expect(github2.putContent).toHaveBeenCalledWith('o', 'r', 'folders.json', expect.any(String), 'sha-1', 't')
    const meta = await db.syncMeta.get('foldersBaseSha')
    expect(meta?.value).toBe('sha-2')
  })

  it('recovers from a 422 "sha not supplied" on a baseSha=null push by fetching the current sha and retrying', async () => {
    // モバイル回線の瞬断等で前回のpushレスポンスだけ失われ、foldersBaseShaが未保存のまま
    // リモートには既にfolders.jsonが存在するケースを再現する
    await db.folders.bulkPut([{ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 }])
    const shaMissingError = new GithubApiError('putContent failed: 422 - Invalid request. "sha" wasn\'t supplied.', 422, 'Invalid request. "sha" wasn\'t supplied.')
    const github = {
      putContent: vi.fn()
        .mockRejectedValueOnce(shaMissingError)
        .mockResolvedValueOnce({ content: { sha: 'recovered-sha' } }),
      getContent: vi.fn().mockResolvedValue({ sha: 'current-remote-sha', content: '[]' }),
    }

    await pushFolders({ token: 't', owner: 'o', repo: 'r' }, github as never)

    expect(github.getContent).toHaveBeenCalledWith('o', 'r', 'folders.json', 't')
    expect(github.putContent).toHaveBeenNthCalledWith(2, 'o', 'r', 'folders.json', expect.any(String), 'current-remote-sha', 't')
    const meta = await db.syncMeta.get('foldersBaseSha')
    expect(meta?.value).toBe('recovered-sha')
  })

  it('does not retry a 422 when baseSha was already set (a genuine conflict, not a lost-response case)', async () => {
    await db.syncMeta.put({ key: 'foldersBaseSha', value: 'old-sha' })
    await db.folders.bulkPut([{ folderId: '1', name: '前ノート', color: '#50bebe', seq: 0 }])
    const shaMissingError = new GithubApiError('putContent failed: 422 - Invalid request. "sha" wasn\'t supplied.', 422, 'Invalid request. "sha" wasn\'t supplied.')
    const github = {
      putContent: vi.fn().mockRejectedValue(shaMissingError),
      getContent: vi.fn(),
    }

    await expect(pushFolders({ token: 't', owner: 'o', repo: 'r' }, github as never)).rejects.toThrow('422')
    expect(github.getContent).not.toHaveBeenCalled()
  })
})
