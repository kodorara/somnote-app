import type { StoredNote } from './db'
import type { TreeEntry } from './github'
import type { Note } from './frontmatter'
import { serializeNote, parseNote } from './frontmatter'
import { GithubApiError } from './github'

export interface PullTarget {
  id: string
  folder: string
}

export interface DeleteTarget {
  id: string
  folder: string
  sha: string
  permanent?: boolean
}

export interface SyncPlan {
  toPush: string[] // ローカル優先でpushするノートID
  toPull: PullTarget[] // 新規取得または上書き取得するノート(リモートが新しい/未知のノート)
  conflicts: string[] // 両方変化しているノートID(ユーザー解決が必要)
  toDelete: DeleteTarget[] // フォルダ移動などで不要になった旧パス
}

// 衝突が発生したノートをユーザーに提示・解決してもらうための情報一式。
// App.tsxとfullSync.tsの両方から参照するため、循環importを避けてここに正本を置く。
export interface ConflictItem {
  id: string
  folder: string
  localBody: string
  remoteBody: string
  remoteSha: string
  remoteNote: Note
  localNote: StoredNote
}

function notePath(folder: string, id: string): string {
  return `notes/${folder}/${id}.md`
}

const NOTE_PATH_PATTERN = /^notes\/(.+)\/([^/]+)\.md$/

function parseNotePath(path: string): PullTarget | null {
  const m = path.match(NOTE_PATH_PATTERN)
  return m ? { folder: m[1], id: m[2] } : null
}

export function planSync(localNotes: StoredNote[], remoteTree: Pick<TreeEntry, 'path' | 'sha'>[]): SyncPlan {
  const remoteByPath = new Map(remoteTree.map((e) => [e.path, e.sha]))
  const localById = new Map(localNotes.map((n) => [n.id, n]))
  const plan: SyncPlan = { toPush: [], toPull: [], conflicts: [], toDelete: [] }

  for (const n of localNotes) {
    const remoteSha = remoteByPath.get(notePath(n.folder, n.id))

    if (n.pendingPermanentDelete) {
      if (n.baseSha !== null && remoteSha !== undefined) {
        plan.toDelete.push({ id: n.id, folder: n.folder, sha: remoteSha, permanent: true })
      }
      continue
    }

    if (n.dirty) {
      if (n.baseSha === null) {
        plan.toPush.push(n.id)
      } else if (remoteSha === n.baseSha) {
        plan.toPush.push(n.id)
      } else {
        plan.conflicts.push(n.id)
      }
    } else if (remoteSha !== undefined && remoteSha !== n.baseSha) {
      plan.toPull.push({ id: n.id, folder: n.folder })
    }
  }

  // リモートに存在するノートを走査し、
  // 1) 未知のノート(他端末での新規作成等)をtoPullへ
  // 2) ローカルのfolder値とパスが食い違うものを、以下のどちらかに振り分ける:
  //    a) 自分自身が記録した旧パス(pendingOldPath)と一致する → 本当に自分が移動した
  //       旧パスなのでtoDeleteへ
  //    b) 一致しない → 自分がまだ知らない「他端末での移動」の可能性が高いので、
  //       削除ではなくtoPullへ(新しい内容とfolder値を取り込む)。ただしローカルに
  //       未確定の編集(dirty)がある場合は、誤って上書きしないよう今回は何もしない
  //       (次回同期でローカルの状態が確定してから再評価する)。
  // この区別がないと、A端末が移動した直後でまだB端末に伝わっていない場合に、B端末が
  // 「新パスの方が自分のfolder値と食い違う」と誤認して、A端末が今まさに作った正しい
  // ファイルを削除してしまう事故が起きる。
  for (const entry of remoteTree) {
    const target = parseNotePath(entry.path)
    if (!target) continue
    const local = localById.get(target.id)
    if (!local) {
      plan.toPull.push(target)
      continue
    }
    if (local.folder === target.folder) continue

    const isOwnStalePath = local.pendingOldPath?.folder === target.folder
    if (isOwnStalePath) {
      plan.toDelete.push({ id: target.id, folder: target.folder, sha: entry.sha })
    } else if (!local.dirty) {
      plan.toPull.push(target)
    }
  }

  return plan
}

export interface GithubLike {
  putContent: (folder: string, id: string, content: string, baseSha: string | null) => Promise<{ content: { sha: string } }>
  getContent: (folder: string, id: string) => Promise<{ sha: string; content: string }>
  deleteContent?: (folder: string, id: string, sha: string) => Promise<void>
}


// baseSha===nullでのpush(新規作成)は、直前の試行がモバイル回線の瞬断等でレスポンスだけ
// 失われ、実際にはGitHub側で作成が成功しているケースがありうる。その場合GitHubは
// 「ファイルは既に存在するのにshaが無い」として422 "sha" wasn't supplied を返す。
// これを検知したら現在のリモートshaを取得し、更新として1回だけ再送して自己修復する。
function isShaMissingError(err: unknown): err is GithubApiError {
  return err instanceof GithubApiError && err.status === 422 && err.githubMessage.includes('sha')
}

async function pushNote(
  github: GithubLike,
  n: StoredNote,
  content: string,
): Promise<{ content: { sha: string } }> {
  try {
    return await github.putContent(n.folder, n.id, content, n.baseSha)
  } catch (err) {
    if (n.baseSha !== null || !isShaMissingError(err)) throw err
    const current = await github.getContent(n.folder, n.id)
    return github.putContent(n.folder, n.id, content, current.sha)
  }
}

// 読み取り(GET)はGitHubのセカンダリレート制限(書き込み系のみ対象)の影響を受けないため、
// 初回全件インポートのような大量pullを現実的な時間で終えるには並列化が要る。
// 逐次1件ずつだと5,000件超で数十分かかり、UI上「固まっている」ように見えてしまう。
const PULL_CONCURRENCY = 12

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

export async function runSync(
  localNotes: StoredNote[],
  remoteTree: Pick<TreeEntry, 'path' | 'sha'>[],
  github: GithubLike,
  // batchResult: このバッチで取得・更新されたノートだけを渡す。呼び出し側(fullSync)が
  // バッチ単位でIndexedDBに永続化できるようにするため。途中でレート制限等により
  // 後続バッチが失敗しても、既に処理済みのバッチの内容は失われない。
  onPullProgress?: (done: number, total: number, batchResult: StoredNote[]) => void | Promise<void>,
): Promise<{ updated: StoredNote[]; conflicts: string[]; plan: SyncPlan; permanentlyDeletedIds: string[] }> {
  const plan = planSync(localNotes, remoteTree)
  const byId = new Map(localNotes.map((n) => [n.id, { ...n }]))

  // push(書き込み)は設計書3.3節の方針通り逐次実行する
  const pushedSuccessfully = new Set<string>()
  for (const id of plan.toPush) {
    const n = byId.get(id)
    if (!n) continue
    const content = serializeNote(n)
    const res = await pushNote(github, n, content)
    n.dirty = false
    n.baseSha = res.content.sha
    pushedSuccessfully.add(id)
  }

  const permanentlyDeletedIds: string[] = []

  // 旧パスの削除・完全削除:
  // 新パスへのpushが成功したノート、またはローカルで既に未同期(dirty)でないノート、
  // もしくは完全削除(del.permanent)についてリモートのファイルを削除する。
  if (github.deleteContent && plan.toDelete.length > 0) {
    for (const del of plan.toDelete) {
      const local = byId.get(del.id)
      if (local && (del.permanent || pushedSuccessfully.has(del.id) || !local.dirty)) {
        await github.deleteContent(del.folder, del.id, del.sha)
        if (del.permanent) {
          byId.delete(del.id)
          permanentlyDeletedIds.push(del.id)
        } else {
          local.pendingOldPath = null
        }
      }
    }
  }


  // pull(読み取り)は並列バッチで処理する
  let pulled = 0
  for (const batch of chunk(plan.toPull, PULL_CONCURRENCY)) {
    const batchResult: StoredNote[] = []
    await Promise.all(
      batch.map(async (target) => {
        const res = await github.getContent(target.folder, target.id)
        const parsed = parseNote(res.content)
        const existing = byId.get(target.id)
        const merged = {
          ...(existing ?? {}),
          ...parsed,
          baseSha: res.sha,
          dirty: false,
          // pull(他端末での編集やフォルダ移動の取り込み含む)で確定した内容なので、
          // 自分自身の(今はもう無関係な)旧パス削除予定があれば破棄する
          pendingOldPath: null,
        } as StoredNote
        byId.set(target.id, merged)
        batchResult.push(merged)
      }),
    )
    pulled += batch.length
    await onPullProgress?.(pulled, plan.toPull.length, batchResult)
  }

  // フォルダ内 seq を createdAt 昇順で振り直す(3.2節Step 8)
  const byFolder = new Map<string, StoredNote[]>()
  for (const n of byId.values()) {
    if (!byFolder.has(n.folder)) byFolder.set(n.folder, [])
    byFolder.get(n.folder)?.push(n)
  }
  for (const notes of byFolder.values()) {
    notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    notes.forEach((n, i) => {
      n.seq = i
    })
  }

  return { updated: Array.from(byId.values()), conflicts: plan.conflicts, plan, permanentlyDeletedIds }
}
