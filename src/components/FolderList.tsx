import { useState } from 'react'
import type { StoredFolder } from '../lib/db'

interface Props {
  folders: StoredFolder[]
  selectedName: string | null
  onSelect: (folderName: string) => void
  onCreate: (name: string) => void
  onDelete: (folder: StoredFolder) => void
  onMove: (folderId: string, direction: 'up' | 'down') => void
}

export function FolderList({ folders, selectedName, onSelect, onCreate, onDelete, onMove }: Props) {
  const [newName, setNewName] = useState('')
  const sorted = [...folders].sort((a, b) => a.seq - b.seq)

  const submitCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setNewName('')
  }

  return (
    <div className="folder-list-wrap">
      <ul className="folder-list">
        {sorted.map((f, i) => (
          <li key={f.folderId} role="listitem">
            <div className="folder-move-btns">
              <button
                type="button"
                className="folder-move-btn"
                aria-label={`${f.name}を上へ`}
                disabled={i === 0}
                onClick={() => onMove(f.folderId, 'up')}
              >
                ▲
              </button>
              <button
                type="button"
                className="folder-move-btn"
                aria-label={`${f.name}を下へ`}
                disabled={i === sorted.length - 1}
                onClick={() => onMove(f.folderId, 'down')}
              >
                ▼
              </button>
            </div>
            <button
              type="button"
              className="folder-select-btn"
              aria-current={f.name === selectedName}
              style={{ borderLeft: `4px solid ${f.color}` }}
              onClick={() => onSelect(f.name)}
            >
              {f.name}
            </button>
            <button
              type="button"
              className="folder-delete-btn"
              aria-label={`${f.name}を削除`}
              onClick={() => onDelete(f)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="folder-create-form">
        <input
          className="input"
          aria-label="新しいフォルダ名"
          placeholder="新しいフォルダ名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate()
          }}
        />
        <button type="button" className="btn" onClick={submitCreate}>
          追加
        </button>
      </div>
    </div>
  )
}
