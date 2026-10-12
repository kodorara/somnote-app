import type { StoredFolder } from '../lib/db'

interface Props {
  folders: StoredFolder[]
  selectedName: string | null
  onSelect: (folderName: string) => void
}

export function FolderList({ folders, selectedName, onSelect }: Props) {
  const sorted = [...folders].sort((a, b) => a.seq - b.seq)
  return (
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
        </li>
      ))}
    </ul>
  )
}
