import Dexie, { type Table } from 'dexie'
import type { Note } from './frontmatter'

export interface StoredNote extends Note {
  baseSha: string | null // 最後に同期した時点のGit blob SHA。新規未push時はnull
  dirty: boolean // ローカル編集があり未pushかどうか
}

export interface StoredFolder {
  folderId: string
  name: string
  color: string
  seq: number
}

export interface SyncMeta {
  key: string
  value: string
}

class SomNoteDB extends Dexie {
  notes!: Table<StoredNote, string>
  folders!: Table<StoredFolder, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('somnote')
    // 注意: IndexedDBのキーにboolean値は使えないため、`dirty`はインデックスに含めない
    // (未同期件数の集計は `db.notes.toArray()` + JSフィルタで行う)
    this.version(1).stores({
      notes: 'id, folder, [folder+seq], updatedAt',
      folders: 'folderId, seq',
      syncMeta: 'key',
    })
  }
}

export const db = new SomNoteDB()
