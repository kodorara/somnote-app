import { useRef, useState } from 'react'
import type { GithubSettings } from '../lib/githubSettings'
import {
  createBackupData,
  validateBackupData,
  importBackupData,
  downloadBackupJson,
} from '../lib/backup'
import { CloseIcon, GearIcon } from './icons'

export interface SettingsProps {
  initial: GithubSettings | null
  onSave: (settings: GithubSettings) => void
  onClose?: () => void
  onBackupRestored?: () => void
}

export function Settings({ initial, onSave, onClose, onBackupRestored }: SettingsProps) {
  const [token, setToken] = useState(initial?.token ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [repo, setRepo] = useState(initial?.repo ?? 'somnote-data')
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleExport = async () => {
    setBackupMessage(null)
    setBackupError(null)
    try {
      const data = await createBackupData()
      downloadBackupJson(data)
      setBackupMessage(`バックアップを書き出しました（メモ${data.notes.length}件、フォルダ${data.folders.length}件）`)
    } catch (err) {
      setBackupError(`書き出しエラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupMessage(null)
    setBackupError(null)
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
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
        <h3>データバックアップ</h3>
        <p className="settings-section-desc">
          端末内の全メモとフォルダを1つのJSONファイルとして保存・復元できます。
        </p>

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
            onClick={() => fileInputRef.current?.click()}
          >
            バックアップを読み込む (JSON)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            aria-label="バックアップファイルを選択"
            onChange={handleFileChange}
          />
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
