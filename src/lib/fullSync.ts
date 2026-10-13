import { db, type StoredFolder } from './db'
import { parseNote } from './frontmatter'
import { runSync, type GithubLike, type ConflictItem } from './sync'
import type { getTree, getContent, putContent } from './github'
import type { GithubSettings } from './githubSettings'

// github.tsの実際の関数シグネチャをそのまま型として使う。FullSyncGithubをGithubLike
// (folder/id単位の抽象)から継承させると、owner/repo/path/token単位の実シグネチャと
// 非互換になりコンパイルエラーになるため、継承せず独立した型として定義する。
export interface FullSyncGithub {
  getTree: typeof getTree
  getContent: typeof getContent
  putContent: typeof putContent
}

function notePathOf(folder: string, id: string): string {
  return `notes/${folder}/${id}.md`
}

export async function fullSync(
  settings: GithubSettings,
  github: FullSyncGithub,
  onPullProgress?: (done: number, total: number) => void,
): Promise<{ pushed: number; pulled: number; conflicts: ConflictItem[] }> {
  const { owner, repo, token } = settings
  const { tree } = await github.getTree(owner, repo, 'main', token)

  // folders.json はリモートのSHAが前回同期時と変わっている場合だけ取得・上書きする。
  // 毎回無条件に取得→上書きすると、ローカルで作成したばかりでまだpushしていない
  // フォルダが次の同期で消えてしまう(リモートに存在しないため)。SHAが前回と同じなら
  // 「リモートは変化していない」とみなしローカルの状態をそのまま残す。
  const foldersEntry = tree.find((e) => e.path === 'folders.json')
  if (foldersEntry) {
    const meta = await db.syncMeta.get('foldersBaseSha')
    if (meta?.value !== foldersEntry.sha) {
      const foldersRes = await github.getContent(owner, repo, 'folders.json', token)
      const folders: StoredFolder[] = JSON.parse(foldersRes.content)
      await db.folders.clear()
      await db.folders.bulkPut(folders)
      await db.syncMeta.put({ key: 'foldersBaseSha', value: foldersRes.sha })
    }
  }

  const localNotes = await db.notes.toArray()

  const githubAdapter: GithubLike = {
    putContent: (folder, id, content, baseSha) =>
      github.putContent(owner, repo, notePathOf(folder, id), content, baseSha, token),
    getContent: (folder, id) => github.getContent(owner, repo, notePathOf(folder, id), token),
  }

  // ローカルが空の初回起動でも、2回目以降の通常同期でも同じ経路を通る
  // (空の場合は全件が「ローカルに無い新規リモートノート」として自然にtoPullに入る)
  //
  // バッチごとにIndexedDBへ永続化する: レート制限等で途中失敗しても、
  // 既に完了したバッチの内容(例:5,386件中3,000件)は失わずに残る。
  // batchResultには「pull対象」だけが入り、衝突ノートはplanSync上toPullとは
  // 別カテゴリなのでここには一切含まれない(衝突の上書き保存は発生しない)。
  const { updated, conflicts: conflictIds, plan } = await runSync(
    localNotes,
    tree,
    githubAdapter,
    async (done, total, batchResult) => {
      await db.notes.bulkPut(batchResult)
      await onPullProgress?.(done, total)
    },
  )

  const conflicts: ConflictItem[] = []
  for (const id of conflictIds) {
    const local = localNotes.find((n) => n.id === id)
    if (!local) continue
    const remoteEntry = tree.find((e) => e.path === notePathOf(local.folder, local.id))
    if (!remoteEntry) continue
    const remoteRes = await github.getContent(owner, repo, notePathOf(local.folder, local.id), token)
    const remoteNote = parseNote(remoteRes.content)
    conflicts.push({
      id,
      folder: local.folder,
      localBody: local.body,
      remoteBody: remoteNote.body,
      remoteSha: remoteEntry.sha,
      remoteNote,
      localNote: local,
    })
  }

  // 衝突が発生したノートは更新せず(ローカルの内容を保持)、それ以外だけ保存する
  const conflictIdSet = new Set(conflictIds)
  const toPersist = updated.filter((n) => !conflictIdSet.has(n.id))
  await db.notes.bulkPut(toPersist)

  return { pushed: plan.toPush.length, pulled: plan.toPull.length, conflicts }
}
