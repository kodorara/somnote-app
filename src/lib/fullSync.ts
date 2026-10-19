import { db, type StoredFolder, type StoredNote } from './db'
import { parseNote } from './frontmatter'
import { runSync, type GithubLike, type ConflictItem } from './sync'
import type { getTree, getContent, putContent, deleteContent } from './github'
import type { GithubSettings } from './githubSettings'

// github.tsの実際の関数シグネチャをそのまま型として使う。FullSyncGithubをGithubLike
// (folder/id単位の抽象)から継承させると、owner/repo/path/token単位の実シグネチャと
// 非互換になりコンパイルエラーになるため、継承せず独立した型として定義する。
export interface FullSyncGithub {
  getTree: typeof getTree
  getContent: typeof getContent
  putContent: typeof putContent
  deleteContent: typeof deleteContent
}

function notePathOf(folder: string, id: string): string {
  return `notes/${folder}/${id}.md`
}

export async function fullSync(
  settings: GithubSettings,
  github: FullSyncGithub,
  onPullProgress?: (done: number, total: number) => void,
): Promise<{
  pushed: number
  pulled: number
  conflicts: ConflictItem[]
  updatedNotes: StoredNote[]
  permanentlyDeletedIds: string[]
}> {
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
    deleteContent: (folder, id, sha) =>
      github.deleteContent(owner, repo, notePathOf(folder, id), sha, token),
  }


  // ローカルが空の初回起動でも、2回目以降の通常同期でも同じ経路を通る
  // (空の場合は全件が「ローカルに無い新規リモートノート」として自然にtoPullに入る)
  //
  // バッチごとにIndexedDBへ永続化する: レート制限等で途中失敗しても、
  // 既に完了したバッチの内容(例:5,386件中3,000件)は失わずに残る。
  // batchResultには「pull対象」だけが入り、衝突ノートはplanSync上toPullとは
  // 別カテゴリなのでここには一切含まれない(衝突の上書き保存は発生しない)。
  const { updated, conflicts: conflictIds, plan, permanentlyDeletedIds } = await runSync(
    localNotes,
    tree,
    githubAdapter,
    async (done, total, batchResult) => {
      await db.notes.bulkPut(batchResult)
      await onPullProgress?.(done, total)
    },
  )

  if (permanentlyDeletedIds.length > 0) {
    await db.notes.bulkDelete(permanentlyDeletedIds)
  }

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

  // 衝突が発生したノートは更新せず(ローカルの内容を保持)、それ以外だけ保存する。
  // updatedはローカルの全件(runSync内でseq再計算のため全件clone+再構築される)だが、
  // 実際に値が変わったノートだけをbulkPutする。push/pull対象のIDだけに絞る方式は
  // 一見正しそうだが、以下を見逃すため採用しない:
  // ・toDelete(旧パス削除)対象のpendingOldPathクリアはtoPush/toPullのどちらにも
  //   含まれないIDで発生する
  // ・フォルダ内seqの再計算は、そのフォルダで何か1件でもpush/pull/削除があれば
  //   同フォルダの無関係な他ノートのseqも変わりうる
  // そのため実際の値比較で判定する。
  const conflictIdSet = new Set(conflictIds)
  const localById = new Map(localNotes.map((n) => [n.id, n]))
  const hasRelevantChange = (before: StoredNote, after: StoredNote): boolean =>
    before.seq !== after.seq ||
    before.baseSha !== after.baseSha ||
    before.dirty !== after.dirty ||
    before.title !== after.title ||
    before.folder !== after.folder ||
    before.updatedAt !== after.updatedAt ||
    before.deleted !== after.deleted ||
    before.body !== after.body ||
    before.tags !== after.tags ||
    before.llmLinks !== after.llmLinks ||
    before.pendingPermanentDelete !== after.pendingPermanentDelete ||
    (before.pendingOldPath?.sha ?? null) !== (after.pendingOldPath?.sha ?? null) ||
    (before.pendingOldPath?.folder ?? null) !== (after.pendingOldPath?.folder ?? null)
  const toPersist = updated.filter((n) => {
    if (conflictIdSet.has(n.id)) return false
    const before = localById.get(n.id)
    return !before || hasRelevantChange(before, n)
  })
  if (toPersist.length > 0) await db.notes.bulkPut(toPersist)

  // 検索索引の差分更新に使うため、「実際にpush/pullされたノート」だけを返す。
  // updated自体はローカルの全件(未変化のものも含む)なので、plan.toPush/toPullの
  // IDと突き合わせて絞り込む。これにより呼び出し側は毎回全件で索引を再構築せずに
  // 済み、メインスレッドを長時間ブロックしない。
  const changedIds = new Set<string>([...plan.toPush, ...plan.toPull.map((t) => t.id)])
  const updatedNotes = toPersist.filter((n) => changedIds.has(n.id))

  return { pushed: plan.toPush.length, pulled: plan.toPull.length, conflicts, updatedNotes, permanentlyDeletedIds }
}
