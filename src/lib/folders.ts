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
