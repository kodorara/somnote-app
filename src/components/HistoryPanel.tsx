import { useEffect, useState } from 'react'
import type { GithubSettings } from '../lib/githubSettings'
import {
  fetchNoteHistory,
  fetchNoteBodyAtCommit,
  type NoteHistoryEntry,
} from '../lib/history'
import { CloseIcon, HistoryIcon } from './icons'

export interface HistoryPanelProps {
  isOpen: boolean
  onClose: () => void
  folder: string
  noteId: string
  settings: GithubSettings | null
  online: boolean
  onRestoreContent: (body: string) => void
}

export function HistoryPanel({
  isOpen,
  onClose,
  folder,
  noteId,
  settings,
  online,
  onRestoreContent,
}: HistoryPanelProps) {
  const [commits, setCommits] = useState<NoteHistoryEntry[]>([])
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const [previewBody, setPreviewBody] = useState<string>('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingBody, setLoadingBody] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // パネルが開いた時にコミット履歴を取得
  useEffect(() => {
    if (!isOpen) {
      setCommits([])
      setSelectedSha(null)
      setPreviewBody('')
      setError(null)
      return
    }

    if (!online) {
      setError('オフラインのため、編集履歴を表示できません（GitHub APIへの接続が必要です）')
      return
    }

    if (!settings) {
      setError('GitHub設定が未登録です')
      return
    }

    let cancelled = false
    setLoadingHistory(true)
    setError(null)

    fetchNoteHistory(settings, folder, noteId)
      .then((history) => {
        if (cancelled) return
        setCommits(history)
        if (history.length > 0) {
          setSelectedSha(history[0].sha)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, online, settings, folder, noteId])

  // コミット選択が切り替わった時にそのコミットの本文を取得
  useEffect(() => {
    if (!isOpen || !selectedSha || !settings) {
      setPreviewBody('')
      return
    }

    let cancelled = false
    setLoadingBody(true)

    fetchNoteBodyAtCommit(settings, folder, noteId, selectedSha)
      .then((body) => {
        if (cancelled) return
        setPreviewBody(body)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedSha, settings, folder, noteId])

  if (!isOpen) return null

  const handleRestore = () => {
    if (!previewBody && previewBody !== '') return
    onRestoreContent(previewBody)
    onClose()
  }

  return (
    <div className="history-modal-overlay" role="dialog" aria-modal="true" aria-label="編集履歴">
      <div className="history-modal">
        <div className="history-modal-header">
          <div className="history-modal-title">
            <HistoryIcon size={18} />
            <span>編集履歴（GitHubコミット履歴）</span>
          </div>
          <button
            type="button"
            className="action-bar-btn-close"
            aria-label="履歴を閉じる"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="history-modal-body">
          {error && <div className="history-error-message">{error}</div>}

          {loadingHistory ? (
            <div className="history-loading">履歴を取得中...</div>
          ) : commits.length === 0 && !error ? (
            <div className="history-empty">
              このメモのコミット履歴はありません（まだ同期・pushされていない可能性があります）
            </div>
          ) : (
            <div className="history-content-split">
              {/* 左側: コミット一覧 */}
              <div className="history-commit-list">
                <div className="history-commit-list-header">変更履歴</div>
                <ul>
                  {commits.map((c) => {
                    const isSelected = c.sha === selectedSha
                    return (
                      <li key={c.sha}>
                        <button
                          type="button"
                          className={`history-commit-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedSha(c.sha)}
                          aria-current={isSelected ? 'true' : 'false'}
                        >
                          <span className="history-commit-date">{c.formattedDate}</span>
                          <span className="history-commit-msg">{c.message}</span>
                          <span className="history-commit-sha">{c.sha.slice(0, 7)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* 右側: プレビュー & 巻き戻し */}
              <div className="history-preview-panel">
                <div className="history-preview-header">
                  <span>選択した時点の本文プレビュー</span>
                  <button
                    type="button"
                    className="btn btn-primary history-restore-btn"
                    onClick={handleRestore}
                    disabled={loadingBody || loadingHistory}
                  >
                    この内容に戻す
                  </button>
                </div>
                {loadingBody ? (
                  <div className="history-loading">本文を取得中...</div>
                ) : (
                  <textarea
                    className="history-preview-text"
                    value={previewBody}
                    readOnly
                    aria-label="過去バージョンの本文"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
