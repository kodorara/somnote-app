import type { ReactNode } from 'react'

interface Props {
  text: string
  query: string
}

/**
 * 検索キーワードにマッチする箇所をハイライト(<mark>)表示するコンポーネント。
 * 大文字・小文字を区別せず、正規表現の特殊文字も安全にエスケープして処理する。
 */
export function HighlightText({ text, query }: Props): ReactNode {
  const trimmed = query.trim()
  if (!trimmed || !text) return text

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={index} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
