import { db, type StoredFolder } from './db'

export async function createFolder(name: string, existingFolders: StoredFolder[]): Promise<StoredFolder> {
  const maxSeq = existingFolders.reduce((m, f) => Math.max(m, f.seq), -1)
  const folder: StoredFolder = {
    folderId: crypto.randomUUID(),
    name,
    color: '#9184d9',
    seq: maxSeq + 1,
  }
  await db.folders.add(folder)
  return folder
}

export async function deleteFolder(folder: StoredFolder): Promise<void> {
  const count = await db.notes.where('folder').equals(folder.name).count()
  if (count > 0) {
    throw new Error(`「${folder.name}」には${count}件のメモがあるため削除できません`)
  }
  await db.folders.delete(folder.folderId)
}

// 表示順(seq)で隣り合うフォルダと入れ替える。戻り値は「変更後の全フォルダ一覧」。
// 一番上(上へ不可)/一番下(下へ不可)の場合は何もせず元の配列をそのまま返す。
export function moveFolder(folders: StoredFolder[], folderId: string, direction: 'up' | 'down'): StoredFolder[] {
  const sorted = [...folders].sort((a, b) => a.seq - b.seq)
  const idx = sorted.findIndex((f) => f.folderId === folderId)
  if (idx === -1) return folders

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sorted.length) return folders

  const a = sorted[idx]
  const b = sorted[swapIdx]
  return folders.map((f) => {
    if (f.folderId === a.folderId) return { ...f, seq: b.seq }
    if (f.folderId === b.folderId) return { ...f, seq: a.seq }
    return f
  })
}

// 現在表示中のフォルダ(一番上=seqが最小)を返す。新規起動時の初期フォルダ決定に使う。
export function topFolder(folders: StoredFolder[]): StoredFolder | undefined {
  return [...folders].sort((a, b) => a.seq - b.seq)[0]
}
