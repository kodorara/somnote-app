interface Props {
  onQueryChange: (query: string) => void
}

export function SearchBar({ onQueryChange }: Props) {
  return (
    <input
      type="search"
      role="searchbox"
      placeholder="検索(タイトル・本文・タグ)"
      onChange={(e) => onQueryChange(e.target.value)}
    />
  )
}
