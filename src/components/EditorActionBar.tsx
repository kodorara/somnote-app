import { useState } from 'react'
import type { StoredFolder } from '../lib/db'
import {
  SaveIcon,
  FolderIcon,
  SearchIcon,
  LinkIcon,
  PreviewIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  RefreshIcon,
  HistoryIcon,
} from './icons'

export interface EditorActionBarProps {
  onSave: () => void
  currentFolder: string
  folders: StoredFolder[]
  onMoveFolder: (folderName: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  previewMode: 'edit' | 'preview'
  onTogglePreview: () => void
  llmLinksCount: number
  isLlmOpen: boolean
  onToggleLlm: () => void
  onDelete: () => void
  isTrashNote?: boolean
  onRestore?: () => void
  isHistoryOpen?: boolean
  onToggleHistory?: () => void
}


export function EditorActionBar({
  onSave,
  currentFolder,
  folders,
  onMoveFolder,
  searchQuery,
  onSearchChange,
  previewMode,
  onTogglePreview,
  llmLinksCount,
  isLlmOpen,
  onToggleLlm,
  onDelete,
  isTrashNote = false,
  onRestore,
  isHistoryOpen = false,
  onToggleHistory,
}: EditorActionBarProps) {
  const [searchExpanded, setSearchExpanded] = useState(false)


  return (
    <div className="editor-action-bar-container">
      <div className="editor-action-bar">
        {/* 1. 保存ボタン (大きめアイコン・押しやすいスタイル) */}
        <button
          type="button"
          className="action-bar-btn action-bar-btn-save"
          aria-label="保存"
          onClick={onSave}
          title="保存"
        >
          <SaveIcon size={22} />
        </button>

        {/* 2. フォルダ移動 (フォルダアイコン + セレクト) */}
        <div className="action-bar-folder-select" title="フォルダ移動">
          <FolderIcon size={18} className="folder-select-icon" />
          <select
            className="action-bar-select"
            aria-label="フォルダ移動"
            value={currentFolder}
            onChange={(e) => onMoveFolder(e.target.value)}
          >
            {folders.map((f) => (
              <option key={f.folderId} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* 3. メモ内検索トグル */}
        <button
          type="button"
          className={`action-bar-btn ${searchExpanded || searchQuery ? 'is-active' : ''}`}
          aria-label="メモ内を検索"
          onClick={() => {
            const next = !searchExpanded
            setSearchExpanded(next)
            if (!next && searchQuery) {
              onSearchChange('')
            }
          }}
          title="メモ内を検索"
        >
          <SearchIcon size={18} />
        </button>

        {/* 4. リンク (🔗 旧LLM連携) */}
        <button
          type="button"
          className={`action-bar-btn ${isLlmOpen ? 'is-active' : ''}`}
          aria-label="LLM連携"
          onClick={onToggleLlm}
          title="LLM連携"
        >
          <LinkIcon size={18} />
          {llmLinksCount > 0 && <span className="action-bar-badge">{llmLinksCount}</span>}
        </button>

        {/* 5. プレビュー切替 */}
        <button
          type="button"
          className={`action-bar-btn ${previewMode === 'preview' ? 'is-active' : ''}`}
          aria-label={previewMode === 'edit' ? 'プレビュー' : '編集'}
          onClick={onTogglePreview}
          title={previewMode === 'edit' ? 'プレビューに切り替え' : '編集に切り替え'}
        >
          {previewMode === 'edit' ? <PreviewIcon size={18} /> : <EditIcon size={18} />}
        </button>

        {/* 6. 編集履歴 */}
        {onToggleHistory && (
          <button
            type="button"
            className={`action-bar-btn ${isHistoryOpen ? 'is-active' : ''}`}
            aria-label="編集履歴"
            onClick={onToggleHistory}
            title="編集履歴（巻き戻し）"
          >
            <HistoryIcon size={18} />
          </button>
        )}

        {/* 7. ゴミ箱 または 復元 */}

        {isTrashNote ? (
          <button
            type="button"
            className="action-bar-btn action-bar-btn-restore"
            aria-label="復元"
            onClick={onRestore}
            title="メモを復元"
          >
            <RefreshIcon size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="action-bar-btn action-bar-btn-delete"
            aria-label="ゴミ箱に移動"
            onClick={onDelete}
            title="ゴミ箱に移動"
          >
            <TrashIcon size={18} />
          </button>
        )}
      </div>

      {/* ゴミ箱バナー */}
      {isTrashNote && (
        <div className="trash-banner">
          <span>このメモはゴミ箱に入っています</span>
          <button type="button" className="btn btn-primary restore-btn" onClick={onRestore}>
            復元する
          </button>
        </div>
      )}

      {/* メモ内検索入力バー (トグル時または検索文字列がある時に展開) */}
      {(searchExpanded || searchQuery) && (
        <div className="editor-search-row">
          <input
            type="search"
            className="input editor-search-input"
            aria-label="本文内を検索"
            placeholder="本文内を検索"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="action-bar-btn-close"
              aria-label="検索をクリア"
              onClick={() => onSearchChange('')}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
