import type { StoredNote } from './db'
import type { TreeEntry } from './github'
import type { Note } from './frontmatter'
import { serializeNote, parseNote } from './frontmatter'

export interface PullTarget {
  id: string
  folder: string
}

export interface SyncPlan {
  toPush: string[] // ローカル優先でpushするノートID
  toPull: PullTarget[] // 新規取得または上書き取得するノート(リモートが新しい/未知のノート)
  conflicts: string[] // 両方変化しているノートID(ユーザー解決が必要)
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
  const plan: SyncPlan = { toPush: [], toPull: [], conflicts: [] }

  for (const n of localNotes) {
    const remoteSha = remoteByPath.get(notePath(n.folder, n.id))

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

  // リモートに存在するが、このデバイスのローカルには一度も現れていないノート
  // (他デバイスでの新規作成、または初回起動時の全件インポート)を検出する
  for (const entry of remoteTree) {
    const target = parseNotePath(entry.path)
    if (target && !localById.has(target.id)) {
      plan.toPull.push(target)
    }
  }

  return plan
}

export interface GithubLike {
  putContent: (folder: string, id: string, content: string, baseSha: string | null) => Promise<{ content: { sha: string } }>
  getContent: (folder: string, id: string) => Promise<{ sha: string; content: string }>
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
  onPullProgress?: (done: number, total: number) => void,
): Promise<{ updated: StoredNote[]; conflicts: string[]; plan: SyncPlan }> {
  const plan = planSync(localNotes, remoteTree)
  const byId = new Map(localNotes.map((n) => [n.id, { ...n }]))

  // push(書き込み)は設計書3.3節の方針通り逐次実行する
  for (const id of plan.toPush) {
    const n = byId.get(id)
    if (!n) continue
    const content = serializeNote(n)
    const res = await github.putContent(n.folder, n.id, content, n.baseSha)
    n.dirty = false
    n.baseSha = res.content.sha
  }

  // pull(読み取り)は並列バッチで処理する
  let pulled = 0
  for (const batch of chunk(plan.toPull, PULL_CONCURRENCY)) {
    await Promise.all(
      batch.map(async (target) => {
        const res = await github.getContent(target.folder, target.id)
        const parsed = parseNote(res.content)
        const existing = byId.get(target.id)
        byId.set(target.id, {
          ...(existing ?? {}),
          ...parsed,
          baseSha: res.sha,
          dirty: false,
        } as StoredNote)
      }),
    )
    pulled += batch.length
    onPullProgress?.(pulled, plan.toPull.length)
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

  return { updated: Array.from(byId.values()), conflicts: plan.conflicts, plan }
}
