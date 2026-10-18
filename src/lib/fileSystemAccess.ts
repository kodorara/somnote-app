import { db } from './db'

const EXPORT_DIR_SETTING_KEY = 'exportDirectoryHandle'

export interface DirectoryHandleWithPermission extends FileSystemDirectoryHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: () => Promise<DirectoryHandleWithPermission>
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * 保存先フォルダをユーザーに選ばせ、選択結果をIndexedDBに保存する。
 * 非対応ブラウザ・ユーザーがキャンセルした場合はnullを返す。
 */
export async function pickExportDirectory(): Promise<DirectoryHandleWithPermission | null> {
  if (!isFileSystemAccessSupported()) return null
  try {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker
    if (!picker) return null
    const handle = await picker()
    await db.appSettings.put({ key: EXPORT_DIR_SETTING_KEY, value: handle })
    return handle
  } catch (err) {
    // ユーザーがピッカーをキャンセルした場合もここに来る(AbortError)。エラー扱いしない。
    if (err instanceof Error && err.name === 'AbortError') return null
    throw err
  }
}

/**
 * 以前に選択・保存した保存先フォルダのハンドルを復元する。
 * 書き込み権限が無い/失効している場合は再度リクエストし、拒否されたらnullを返す
 * (呼び出し側はnullの場合、従来のダウンロード方式にフォールバックすること)。
 */
export async function getSavedExportDirectory(): Promise<DirectoryHandleWithPermission | null> {
  const record = await db.appSettings.get(EXPORT_DIR_SETTING_KEY)
  const handle = record?.value as DirectoryHandleWithPermission | undefined
  if (!handle) return null

  const opts = { mode: 'readwrite' as const }
  if (typeof handle.queryPermission === 'function') {
    const permission = await handle.queryPermission(opts)
    if (permission === 'granted') return handle
  }
  if (typeof handle.requestPermission === 'function') {
    const requested = await handle.requestPermission(opts)
    return requested === 'granted' ? handle : null
  }
  return handle
}

/** 保存先フォルダの設定を解除する(「保存先をリセット」ボタン用)。 */
export async function clearSavedExportDirectory(): Promise<void> {
  await db.appSettings.delete(EXPORT_DIR_SETTING_KEY)
}

/** 選択済みのディレクトリへファイルを書き込む。 */
export async function writeFileToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: string | Blob,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}
