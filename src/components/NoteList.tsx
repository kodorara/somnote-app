import { HighlightText } from './HighlightText'

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
  highlightQuery?: string
}

const SORTERS: Record<SortBy, (a: NoteSummary, b: NoteSummary) => number> = {
  seq: (a, b) => a.seq - b.seq,
  createdDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
  createdAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
  updatedDesc: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  updatedAsc: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
}

// ISO文字列(例: "2026-10-12T10:00:00+09:00")の日付部分だけを取り出す。
// Date経由で変換すると閲覧side(ブラウザ)のタイムゾーンで再解釈されてズレる恐れがあるため、
// 保存されている値の日付部分をそのまま切り出す。
function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return ''
  return iso.slice(0, 10).replace(/-/g, '/')
}

export function NoteList({ notes, selectedId, onSelect, tagFilter, wordFilter, sortBy, highlightQuery }: Props) {
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
            <span className="note-title">
              <HighlightText text={n.title} query={highlightQuery ?? ''} />
            </span>
            <span className="note-meta">
              作成 {formatDate(n.createdAt)} ・ 編集 {formatDate(n.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

