import { useEffect, useRef, useState } from 'react'
import type { GithubSettings } from '../lib/githubSettings'
import type { StoredFolder } from '../lib/db'
import { sortedBySeq } from '../lib/folders'
import {
  createBackupData,
  validateBackupData,
  importBackupData,
  importFolderBackupData,
  formatNotesAsText,
  importTextNotes,
  buildExportFilename,
  downloadBackupJson,
  downloadTextFile,
} from '../lib/backup'
import {
  isFileSystemAccessSupported,
  pickExportDirectory,
  getSavedExportDirectory,
  clearSavedExportDirectory,
  writeFileToDirectory,
} from '../lib/fileSystemAccess'
import { CloseIcon, GearIcon } from './icons'

export interface SettingsProps {
  initial: GithubSettings | null
  onSave: (settings: GithubSettings) => void
  onClose?: () => void
  onBackupRestored?: (importedFolderName?: string) => void
  folders?: StoredFolder[]
}

export function Settings({ initial, onSave, onClose, onBackupRestored, folders = [] }: SettingsProps) {
  const [token, setToken] = useState(initial?.token ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [repo, setRepo] = useState(initial?.repo ?? 'somnote-data')
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)

  const [targetScope, setTargetScope] = useState<string>('')
  const [pasteInput, setPasteInput] = useState<string>('')
  const [exportedTextPreview, setExportedTextPreview] = useState<string | null>(null)
  const [exportDirName, setExportDirName] = useState<string | null>(null)
  const fsSupported = isFileSystemAccessSupported()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const sortedFolders = sortedBySeq(folders)

  useEffect(() => {
    if (!fsSupported) return
    void (async () => {
      const handle = await getSavedExportDirectory()
      setExportDirName(handle?.name ?? null)
    })()
  }, [fsSupported])

  const handlePickDirectory = async () => {
    const handle = await pickExportDirectory()
    setExportDirName(handle?.name ?? null)
  }

  const handleClearDirectory = async () => {
    await clearSavedExportDirectory()
    setExportDirName(null)
  }

  const handleExport = async () => {
    setBackupMessage(null)
    setBackupError(null)
    try {
      const scope = targetScope || undefined
      const data = await createBackupData(scope)
      const json = JSON.stringify(data, null, 2)
      const filename = buildExportFilename('somnote-backup', 'json')

      const dirHandle = fsSupported ? await getSavedExportDirectory() : null
      if (dirHandle) {
        await writeFileToDirectory(dirHandle, filename, json)
      } else {
        downloadBackupJson(data, filename)
      }
      if (scope) {
        setBackupMessage(`フォルダ「${scope}」を書き出しました（メモ${data.notes.length}件）`)
      } else {
        setBackupMessage(`バックアップを書き出しました（メモ${data.notes.length}件、フォルダ${data.folders.length}件）`)
      }
    } catch (err) {
      setBackupError(`書き出しエラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExportText = async () => {
    setBackupMessage(null)
    setBackupError(null)
    try {
      const scope = targetScope || undefined
      const data = await createBackupData(scope)
      const text = formatNotesAsText(data.notes)
      const filename = buildExportFilename('somnote-export', 'txt')

      const dirHandle = fsSupported ? await getSavedExportDirectory() : null
      if (dirHandle) {
        await writeFileToDirectory(dirHandle, filename, text)
      } else {
        downloadTextFile(text, filename)
      }
      setBackupMessage(
        scope
          ? `フォルダ「${scope}」をテキスト形式で書き出しました（メモ${data.notes.length}件）`
          : `全メモをテキスト形式で書き出しました（メモ${data.notes.filter((n) => !n.deleted).length}件）`,
      )
    } catch (err) {
      setBackupError(`テキスト書き出しエラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleCopyText = async () => {
    setBackupMessage(null)
    setBackupError(null)
    try {
      const scope = targetScope || undefined
      const data = await createBackupData(scope)
      const text = formatNotesAsText(data.notes)
      setExportedTextPreview(text)
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          // クリップボード権限がない環境でも下のテキスト欄から手動コピー可能
        }
      }
      setBackupMessage(`テキストをコピーしました（メモ${data.notes.filter((n) => !n.deleted).length}件）`)
    } catch (err) {
      setBackupError(`コピーエラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupMessage(null)
    setBackupError(null)
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const isTextFile = file.name.toLowerCase().endsWith('.txt')

      if (targetScope) {
        if (isTextFile) {
          const result = await importTextNotes(text, targetScope)
          setBackupMessage(`フォルダ「${targetScope}」にテキストからメモ${result.noteCount}件を追加しました`)
          onBackupRestored?.(targetScope)
          return
        }
        const json = JSON.parse(text)
        const validData = validateBackupData(json)
        const result = await importFolderBackupData(validData, targetScope)
        setBackupMessage(`フォルダ「${targetScope}」にメモ${result.noteCount}件を追加しました`)
        onBackupRestored?.(targetScope)
        return
      }

      if (isTextFile) {
        const fallbackFolder = sortedFolders[0]?.name || 'インポート'
        const result = await importTextNotes(text, fallbackFolder)
        setBackupMessage(`フォルダ「${fallbackFolder}」にテキストからメモ${result.noteCount}件を追加しました`)
        onBackupRestored?.(fallbackFolder)
        return
      }

      const json = JSON.parse(text)
      const validData = validateBackupData(json)

      const confirmed = window.confirm(
        `バックアップファイルからデータを復元しますか？\n（メモ: ${validData.notes.length}件、フォルダ: ${validData.folders.length}件）\n\n※現在のローカルデータはすべて置き換えられます。`,
      )
      if (!confirmed) return

      const result = await importBackupData(validData)
      setBackupMessage(`復元完了: フォルダ${result.folderCount}件、メモ${result.noteCount}件を読み込みました`)
      onBackupRestored?.()
    } catch (err) {
      setBackupError(`読み込みエラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handlePasteImport = async () => {
    setBackupMessage(null)
    setBackupError(null)
    const trimmed = pasteInput.trim()
    if (!trimmed) {
      setBackupError('貼り付けるテキストを入力してください')
      return
    }
    const targetFolder = targetScope || sortedFolders[0]?.name || 'インポート'
    try {
      const result = await importTextNotes(trimmed, targetFolder)
      setBackupMessage(`フォルダ「${targetFolder}」にメモ${result.noteCount}件を追加しました`)
      setPasteInput('')
      onBackupRestored?.(targetFolder)
    } catch (err) {
      setBackupError(`貼り付け取り込みエラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const content = (
    <div className="settings">
      {onClose && (
        <div className="settings-header">
          <div className="settings-title">
            <GearIcon size={18} />
            <span>設定</span>
          </div>
          <button
            type="button"
            className="action-bar-btn-close"
            aria-label="設定を閉じる"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>
      )}

      <div className="settings-section">
        <h3>GitHub同期設定</h3>
        <label htmlFor="pat">Personal Access Token</label>
        <input
          className="input"
          id="pat"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <label htmlFor="owner">GitHubユーザー名</label>
        <input
          className="input"
          id="owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
        <label htmlFor="repo">データリポジトリ名</label>
        <input
          className="input"
          id="repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave({ token, owner, repo })}
        >
          保存
        </button>
      </div>

      <div className="settings-section settings-backup-section">
        <h3>データバックアップ / インポート・エクスポート</h3>
        <p className="settings-section-desc">
          アプリ全体またはフォルダ単位で、JSON形式・テキスト形式（日付と区切り線付き）の書き出し・読み込みができます。
        </p>

        <div className="settings-field-row">
          <label>保存先</label>
          {fsSupported ? (
            <div className="settings-export-dir-row">
              <span>
                {exportDirName
                  ? `選択中: ${exportDirName}`
                  : '未選択(ブラウザの既定のダウンロード先に保存されます)'}
              </span>
              <button type="button" className="btn" onClick={handlePickDirectory}>
                保存先フォルダを選択
              </button>
              {exportDirName && (
                <button type="button" className="btn btn-ghost" onClick={handleClearDirectory}>
                  解除
                </button>
              )}
            </div>
          ) : (
            <p className="settings-section-desc">
              お使いのブラウザでは保存先フォルダを指定できないため、ブラウザの既定のダウンロード先に保存されます。
            </p>
          )}
        </div>

        <div className="settings-field-row">
          <label htmlFor="export-target-scope">対象範囲（フォルダ選択）</label>
          <select
            id="export-target-scope"
            aria-label="対象範囲"
            className="input settings-select"
            value={targetScope}
            onChange={(e) => setTargetScope(e.target.value)}
          >
            <option value="">アプリ全体（全フォルダ）</option>
            {sortedFolders.map((f) => (
              <option key={f.folderId} value={f.name}>
                フォルダ: {f.name}
              </option>
            ))}
          </select>
        </div>

        {backupMessage && <div className="settings-backup-success">{backupMessage}</div>}
        {backupError && <div className="settings-backup-error">{backupError}</div>}

        <div className="settings-backup-actions">
          <button
            type="button"
            className="btn"
            onClick={handleExport}
          >
            バックアップを書き出す (JSON)
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleExportText}
          >
            テキスト形式で書き出す (.txt)
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleCopyText}
          >
            テキストをコピー（スマホ貼り付け用）
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
          >
            バックアップを読み込む (JSON)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            style={{ display: 'none' }}
            aria-label="バックアップファイルを選択"
            onChange={handleFileChange}
          />
        </div>

        {exportedTextPreview !== null && (
          <div className="settings-text-box-wrap">
            <label htmlFor="exported-text-preview">書き出しテキスト（コピー用）</label>
            <textarea
              id="exported-text-preview"
              aria-label="書き出しテキスト"
              className="input settings-paste-textarea"
              readOnly
              value={exportedTextPreview}
              rows={5}
            />
          </div>
        )}

        <div className="settings-text-box-wrap">
          <label htmlFor="paste-import-input">スマホ貼り付けインポート（テキスト）</label>
          <textarea
            id="paste-import-input"
            aria-label="インポートするテキスト"
            className="input settings-paste-textarea"
            placeholder="区切り線付きテキスト、またはプレーンテキストをここに貼り付けて取り込めます..."
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            rows={4}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePasteImport}
          >
            貼り付けた内容を取り込む
          </button>
        </div>
      </div>
    </div>
  )

  if (onClose) {
    return (
      <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label="設定">
        <div className="settings-modal">{content}</div>
      </div>
    )
  }

  return content
}
