import type { SortBy } from './NoteList'

interface Props {
  sortBy: SortBy
  onSortByChange: (sortBy: SortBy) => void
  wordFilter: string
  onWordFilterChange: (word: string) => void
  availableTags: string[]
  tagFilter: string | null
  onTagFilterChange: (tag: string | null) => void
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'seq', label: 'フォルダ内順' },
  { value: 'createdDesc', label: '作成が新しい順' },
  { value: 'createdAsc', label: '作成が古い順' },
  { value: 'updatedDesc', label: '更新が新しい順' },
  { value: 'updatedAsc', label: '更新が古い順' },
]

export function NoteListControls({
  sortBy,
  onSortByChange,
  wordFilter,
  onWordFilterChange,
  availableTags,
  tagFilter,
  onTagFilterChange,
}: Props) {
  return (
    <div className="note-list-controls">
      <select
        className="input"
        aria-label="並び替え"
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as SortBy)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="text"
        aria-label="タイトルで絞り込み"
        placeholder="タイトルで絞り込み"
        value={wordFilter}
        onChange={(e) => onWordFilterChange(e.target.value)}
      />
      {availableTags.length > 0 && (
        <div className="tag-chips">
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="chip"
              aria-current={tagFilter === tag}
              onClick={() => onTagFilterChange(tagFilter === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
