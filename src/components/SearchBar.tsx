import { useEffect, useRef, useState } from 'react'

interface Props {
  value?: string
  onQueryChange: (query: string) => void
  debounceMs?: number
}

export function SearchBar({ value = '', onQueryChange, debounceMs = 200 }: Props) {
  const [innerValue, setInnerValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInnerValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setInnerValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onQueryChange(next)
    }, debounceMs)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <input
      type="search"
      role="searchbox"
      className="input"
      placeholder="検索(タイトル・本文・タグ)"
      value={innerValue}
      onChange={handleChange}
    />
  )
}

