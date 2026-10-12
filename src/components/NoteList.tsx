export type SortBy = 'seq' | 'createdDesc' | 'createdAsc' | 'updatedDesc' | 'updatedAsc'

interface NoteSummary {
  id: string
  title: string
  seq: number
  createdAt: string
  updatedAt: string
  tags: string[]
  deleted: boolean
}

interface Props {
  notes: NoteSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  tagFilter: string | null
  wordFilter: string
  sortBy: SortBy
}

const SORTERS: Record<SortBy, (a: NoteSummary, b: NoteSummary) => number> = {
  seq: (a, b) => a.seq - b.seq,
  createdDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
  createdAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
  updatedDesc: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  updatedAsc: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
}

export function NoteList({ notes, selectedId, onSelect, tagFilter, wordFilter, sortBy }: Props) {
  const visible = notes.filter((n) => !n.deleted)
  const tagFiltered = tagFilter ? visible.filter((n) => n.tags.includes(tagFilter)) : visible
  const word = wordFilter.trim().toLowerCase()
  const wordFiltered = word ? tagFiltered.filter((n) => n.title.toLowerCase().includes(word)) : tagFiltered
  const sorted = [...wordFiltered].sort(SORTERS[sortBy])
  return (
    <ul className="note-list">
      {sorted.map((n) => (
        <li key={n.id} role="listitem">
          <button type="button" aria-current={n.id === selectedId} onClick={() => onSelect(n.id)}>
            <span className="note-title">{n.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
