import { db } from './db'
import type { FullSyncGithub } from './fullSync'
import type { GithubSettings } from './githubSettings'

export async function pushFolders(settings: GithubSettings, github: FullSyncGithub): Promise<void> {
  const { owner, repo, token } = settings
  const folders = await db.folders.toArray()
  const content = JSON.stringify(folders, null, 2)
  const meta = await db.syncMeta.get('foldersBaseSha')
  const baseSha = meta?.value ?? null
  const res = await github.putContent(owner, repo, 'folders.json', content, baseSha, token)
  await db.syncMeta.put({ key: 'foldersBaseSha', value: res.content.sha })
}
