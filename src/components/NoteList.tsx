interface NoteSummary {
  id: string
  title: string
  seq: number
  updatedAt: string
  tags: string[]
  deleted: boolean
}

interface Props {
  notes: NoteSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  tagFilter: string | null
}

export function NoteList({ notes, selectedId, onSelect, tagFilter }: Props) {
  const visible = notes.filter((n) => !n.deleted)
  const filtered = tagFilter ? visible.filter((n) => n.tags.includes(tagFilter)) : visible
  const sorted = [...filtered].sort((a, b) => a.seq - b.seq)
  return (
    <ul className="note-list">
      {sorted.map((n) => (
        <li key={n.id} role="listitem">
          <button type="button" aria-current={n.id === selectedId} onClick={() => onSelect(n.id)}>
            {n.title}
          </button>
        </li>
      ))}
    </ul>
  )
}
