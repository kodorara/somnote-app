import { parseNote } from './frontmatter'
import { listCommitsForPath, getContentAtRef, type CommitInfo } from './github'
import type { GithubSettings } from './githubSettings'

export interface NoteHistoryEntry extends CommitInfo {
  formattedDate: string
}

export function notePathOf(folder: string, id: string): string {
  return `notes/${folder}/${id}.md`
}

/**
 * 過去コミットのRawファイル内容からメモ本文(body)を抽出する。
 * フロントマター形式の場合はbodyを、プレーンテキストの場合はそのまま返す。
 */
export function extractBodyFromContent(raw: string): string {
  try {
    return parseNote(raw).body
  } catch {
    return raw
  }
}

/**
 * ISO形式の日時文字列を画面表示用（例: "2026/10/15 12:34"）に整形する。
 */
export function formatCommitDate(isoDateString: string): string {
  if (!isoDateString) return ''
  try {
    const d = new Date(isoDateString)
    if (isNaN(d.getTime())) return isoDateString
    const pad = (n: number) => String(n).padStart(2, '0')
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const h = pad(d.getHours())
    const min = pad(d.getMinutes())
    return `${y}/${m}/${day} ${h}:${min}`
  } catch {
    return isoDateString
  }
}

/**
 * メモのコミット履歴一覧を取得する。
 */
export async function fetchNoteHistory(
  settings: GithubSettings,
  folder: string,
  noteId: string,
): Promise<NoteHistoryEntry[]> {
  const path = notePathOf(folder, noteId)
  const commits = await listCommitsForPath(settings.owner, settings.repo, path, settings.token)
  return commits.map((c) => ({
    ...c,
    formattedDate: formatCommitDate(c.authorDate),
  }))
}

/**
 * 指定したコミット時点のメモ本文を取得する。
 */
export async function fetchNoteBodyAtCommit(
  settings: GithubSettings,
  folder: string,
  noteId: string,
  commitSha: string,
): Promise<string> {
  const path = notePathOf(folder, noteId)
  const res = await getContentAtRef(settings.owner, settings.repo, path, commitSha, settings.token)
  return extractBodyFromContent(res.content)
}
