import { db } from './db'
import type { FullSyncGithub } from './fullSync'
import type { GithubSettings } from './githubSettings'
import { GithubApiError } from './github'

// baseSha===nullでのpushは、直前の試行がモバイル回線の瞬断等でレスポンスだけ失われ、
// 実際にはGitHub側で保存が成功しているケースがありうる(notes側のsync.tsと同じ理由)。
// その場合GitHubは422 "sha" wasn't supplied を返すので、現在のshaを取得して1回だけ
// 更新として再送する。
function isShaMissingError(err: unknown): err is GithubApiError {
  return err instanceof GithubApiError && err.status === 422 && err.githubMessage.includes('sha')
}

export async function pushFolders(settings: GithubSettings, github: FullSyncGithub): Promise<void> {
  const { owner, repo, token } = settings
  const folders = await db.folders.toArray()
  const content = JSON.stringify(folders, null, 2)
  const meta = await db.syncMeta.get('foldersBaseSha')
  const baseSha = meta?.value ?? null
  let res
  try {
    res = await github.putContent(owner, repo, 'folders.json', content, baseSha, token)
  } catch (err) {
    if (baseSha !== null || !isShaMissingError(err)) throw err
    const current = await github.getContent(owner, repo, 'folders.json', token)
    res = await github.putContent(owner, repo, 'folders.json', content, current.sha, token)
  }
  await db.syncMeta.put({ key: 'foldersBaseSha', value: res.content.sha })
}
