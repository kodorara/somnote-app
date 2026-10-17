import { db, type StoredFolder } from './db'

export const TRASH_FOLDER_NAME = 'ゴミ箱'

export function isTrashFolder(folderName: string | null | undefined): boolean {
  return folderName === TRASH_FOLDER_NAME
}

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
  await db.folders.delete(folder.folderId)
}

// ドラッグ&ドロップで確定した表示順(folderIdの配列)から、各フォルダのseqを
// 0始まりで振り直す。配列に含まれないfolderIdは無視する。
export function reorderFolders(folders: StoredFolder[], orderedIds: string[]): StoredFolder[] {
  const byId = new Map(folders.map((f) => [f.folderId, f]))
  return orderedIds
    .map((id) => byId.get(id))
    .filter((f): f is StoredFolder => f !== undefined)
    .map((f, i) => ({ ...f, seq: i }))
}

// 現在表示中のフォルダ(一番上=seqが最小)を返す。新規起動時の初期フォルダ決定に使う。
export function topFolder(folders: StoredFolder[]): StoredFolder | undefined {
  return sortedBySeq(folders)[0]
}

// フォルダ一覧画面(FolderList)の表示順と全く同じ並び順で返す。フォルダを選ぶUIが
// 複数箇所(フォルダ一覧本体、メモ編集画面のフォルダ移動セレクト、メモ一覧の複数選択
// 一括移動セレクト等)にあるため、「同じseq昇順」であることをこの1関数に集約し、
// 個別に`.sort()`を書いて順序がずれることを防ぐ。
export function sortedBySeq(folders: StoredFolder[]): StoredFolder[] {
  return [...folders].sort((a, b) => a.seq - b.seq)
}
