import Dexie, { type Table } from 'dexie'
import type { Note } from './frontmatter'

export interface StoredNote extends Note {
  baseSha: string | null // 最後に同期した時点のGit blob SHA。新規未push時はnull
  dirty: boolean // ローカル編集があり未pushかどうか
  // フォルダ移動時、移動前に同期済みだった場所(旧パス)を記録する。このデバイス自身が
  // 移動の当事者であることの唯一の証拠であり、「リモートのどのパスが本当に旧パスか」を
  // 判定するために使う(他デバイスがまだ知らない移動を誤って削除してしまう事故を防ぐ)。
  // frontmatter(GitHub上のMarkdown)には含めないローカル専用フィールド。
  // 省略(undefined)は「保留中の旧パスなし」とみなす(nullと同義)。
  pendingOldPath?: { folder: string; sha: string } | null
  // 完全削除が予約されていることを示す。trueの間は同期時にリモートファイルのDELETEを
  // 試み、成功したらローカルレコードごと消す。オフライン中はtrueのまま残り、
  // 次回オンライン時の同期で自動的に処理される。
  pendingPermanentDelete?: boolean
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

// 端末ローカルのUI設定を保存する汎用キーバリューstore。GitHub同期とは無関係。
// 現状はエクスポート先のFileSystemDirectoryHandleの保存にのみ使う。
export interface AppSetting {
  key: string
  value: unknown
}

class SomNoteDB extends Dexie {
  notes!: Table<StoredNote, string>
  folders!: Table<StoredFolder, string>
  syncMeta!: Table<SyncMeta, string>
  appSettings!: Table<AppSetting, string>

  constructor() {
    super('somnote')
    // 注意: IndexedDBのキーにboolean値は使えないため、`dirty`はインデックスに含めない
    // (未同期件数の集計は `db.notes.toArray()` + JSフィルタで行う)
    this.version(1).stores({
      notes: 'id, folder, [folder+seq], updatedAt',
      folders: 'folderId, seq',
      syncMeta: 'key',
    })
    // version(1)からの差分だけでなく、変更の無いテーブルも含めて全テーブルを再掲する
    // (Dexieの仕様上、stores()に書かなかったテーブルはそのバージョンで削除扱いになるため)
    this.version(2).stores({
      notes: 'id, folder, [folder+seq], updatedAt',
      folders: 'folderId, seq',
      syncMeta: 'key',
      appSettings: 'key',
    })
  }
}

export const db = new SomNoteDB()

