const KEY = 'somnote.emergencySave'

// pagehide/beforeunload内でdb.notes.put()(非同期)を呼んでも、ページが実際に
// 破棄されるまでに完了する保証がない(特にモバイルでの瞬間的な終了)。
// localStorage.setItemは同期的に完了するため、保険として本文だけをここに退避し、
// 次回起動時にIndexedDBの内容より新しければ復元する。
export interface EmergencySave {
  noteId: string
  body: string
  updatedAt: string
}

export function writeEmergencySave(save: EmergencySave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境では諦める
  }
}

export function readEmergencySave(): EmergencySave | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as EmergencySave).noteId !== 'string' ||
      typeof (parsed as EmergencySave).body !== 'string' ||
      typeof (parsed as EmergencySave).updatedAt !== 'string'
    ) {
      return null
    }
    return parsed as EmergencySave
  } catch {
    return null
  }
}

export function clearEmergencySave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
