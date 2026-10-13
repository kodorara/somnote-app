import { useState } from 'react'
import type { StoredFolder } from '../lib/db'

interface Props {
  folders: StoredFolder[]
  selectedName: string | null
  onSelect: (folderName: string) => void
  onCreate: (name: string) => void
  onDelete: (folder: StoredFolder) => void
}

export function FolderList({ folders, selectedName, onSelect, onCreate, onDelete }: Props) {
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
        {sorted.map((f) => (
          <li key={f.folderId} role="listitem">
            <button
              type="button"
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
