import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { HighlightText } from './HighlightText'
import { PreviewErrorBoundary } from './PreviewErrorBoundary'

const ReactMarkdown = lazy(() => import('react-markdown'))

interface Props {
  body: string
  onChange: (body: string) => void
  highlightQuery?: string
  mode?: 'edit' | 'preview'
  onModeChange?: (mode: 'edit' | 'preview') => void
  hideToolbar?: boolean
}

interface SearchMatch {
  index: number
  length: number
  ratio: number
  lineIndex: number
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function Editor({ body, onChange, highlightQuery, mode: externalMode, onModeChange, hideToolbar }: Props) {
  const [internalMode, setInternalMode] = useState<'edit' | 'preview'>('edit')
  const currentMode = externalMode !== undefined ? externalMode : internalMode
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)

  const query = highlightQuery?.trim() ?? ''

  const matches = useMemo<SearchMatch[]>(() => {
    if (!query || !body) return []
    const regex = new RegExp(escapeRegExp(query), 'gi')
    const totalLines = Math.max(1, body.split('\n').length)
    const result: SearchMatch[] = []
    let m: RegExpExecArray | null
    while ((m = regex.exec(body)) !== null) {
      const prefix = body.slice(0, m.index)
      const lineIndex = prefix.split('\n').length - 1
      const ratio = totalLines > 1 ? lineIndex / (totalLines - 1) : 0
      result.push({
        index: m.index,
        length: m[0].length,
        ratio: Math.min(1, Math.max(0, ratio)),
        lineIndex,
      })
      if (m[0].length === 0) regex.lastIndex++
    }
    return result
  }, [body, query])

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [query])

  const clampedMatchIndex = matches.length > 0 ? Math.min(activeMatchIndex, matches.length - 1) : 0

  const scrollToMatch = (matchIdx: number) => {
    if (matches.length === 0) return
    const targetIdx = ((matchIdx % matches.length) + matches.length) % matches.length
    setActiveMatchIndex(targetIdx)
    const targetMatch = matches[targetIdx]
    const marks = backdropRef.current?.querySelectorAll('mark.search-highlight')
    const markEl = marks?.[targetIdx] as HTMLElement | undefined
    if (markEl && textareaRef.current) {
      const targetScroll = Math.max(0, markEl.offsetTop - textareaRef.current.clientHeight / 3)
      textareaRef.current.scrollTop = targetScroll
      if (backdropRef.current) {
        backdropRef.current.scrollTop = targetScroll
      }
    } else if (textareaRef.current && targetMatch) {
      const maxScroll = Math.max(0, textareaRef.current.scrollHeight - textareaRef.current.clientHeight)
      const nextScroll = maxScroll * targetMatch.ratio
      textareaRef.current.scrollTop = nextScroll
      if (backdropRef.current) {
        backdropRef.current.scrollTop = nextScroll
      }
    }
  }

  const toggleMode = () => {
    const next = currentMode === 'edit' ? 'preview' : 'edit'
    if (onModeChange) {
      onModeChange(next)
    } else {
      setInternalMode(next)
    }
  }

  const editHighlightedNodes = useMemo(() => {
    if (!query || matches.length === 0) return null
    const nodes: React.ReactNode[] = []
    let cursor = 0
    matches.forEach((m, idx) => {
      if (m.index > cursor) {
        nodes.push(body.slice(cursor, m.index))
      }
      const matchedText = body.slice(m.index, m.index + m.length)
      const isCurrent = idx === clampedMatchIndex
      nodes.push(
        <mark
          key={`${m.index}-${idx}`}
          className={`search-highlight ${isCurrent ? 'is-current' : ''}`}
        >
          {matchedText}
        </mark>,
      )
      cursor = m.index + m.length
    })
    if (cursor < body.length) {
      nodes.push(body.slice(cursor))
    }
    return nodes
  }, [body, query, matches, clampedMatchIndex])

  const markdownComponents = useMemo(() => {
    if (!query) return {}

    const highlightChildren = (children: React.ReactNode): React.ReactNode => {
      if (typeof children === 'string') {
        return <HighlightText text={children} query={query} />
      }
      if (Array.isArray(children)) {
        return children.map((c, i) =>
          typeof c === 'string' ? <HighlightText key={i} text={c} query={query} /> : c,
        )
      }
      return children
    }

    return {
      p: ({ children }: { children?: React.ReactNode }) => <p>{highlightChildren(children)}</p>,
      li: ({ children }: { children?: React.ReactNode }) => <li>{highlightChildren(children)}</li>,
      h1: ({ children }: { children?: React.ReactNode }) => <h1>{highlightChildren(children)}</h1>,
      h2: ({ children }: { children?: React.ReactNode }) => <h2>{highlightChildren(children)}</h2>,
      h3: ({ children }: { children?: React.ReactNode }) => <h3>{highlightChildren(children)}</h3>,
      h4: ({ children }: { children?: React.ReactNode }) => <h4>{highlightChildren(children)}</h4>,
      h5: ({ children }: { children?: React.ReactNode }) => <h5>{highlightChildren(children)}</h5>,
      h6: ({ children }: { children?: React.ReactNode }) => <h6>{highlightChildren(children)}</h6>,
      strong: ({ children }: { children?: React.ReactNode }) => <strong>{highlightChildren(children)}</strong>,
      em: ({ children }: { children?: React.ReactNode }) => <em>{highlightChildren(children)}</em>,
      blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote>{highlightChildren(children)}</blockquote>,
    }
  }, [query])

  return (
    <div className="editor">
      {!hideToolbar && (
        <div className="editor-toolbar">
          <button type="button" className="btn btn-ghost" onClick={toggleMode}>
            {currentMode === 'edit' ? 'プレビュー' : '編集'}
          </button>
        </div>
      )}
      {query && (
        <div className="editor-search-nav" role="status" aria-label="検索結果ナビゲーション">
          <span className="editor-search-count">
            {matches.length > 0 ? `${clampedMatchIndex + 1} / ${matches.length}件` : '0件'}
          </span>
          {matches.length > 0 && (
            <div className="editor-search-nav-btns">
              <button
                type="button"
                className="btn btn-ghost editor-search-jump-btn"
                aria-label="前の一致箇所"
                onClick={() => scrollToMatch(clampedMatchIndex - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn btn-ghost editor-search-jump-btn"
                aria-label="次の一致箇所"
                onClick={() => scrollToMatch(clampedMatchIndex + 1)}
              >
                ▼
              </button>
            </div>
          )}
        </div>
      )}
      <div className="editor-body-wrap">
        {currentMode === 'edit' ? (
          <div className="editor-textarea-container">
            {query && matches.length > 0 && (
              <div
                ref={backdropRef}
                className="editor-highlight-backdrop"
                aria-hidden="true"
                data-testid="editor-highlight-backdrop"
              >
                {editHighlightedNodes}
              </div>
            )}
            <textarea
              ref={textareaRef}
              aria-label="本文"
              className={query && matches.length > 0 ? 'has-search-highlights' : undefined}
              value={body}
              onChange={(e) => onChange(e.target.value)}
              onScroll={(e) => {
                if (backdropRef.current) {
                  backdropRef.current.scrollTop = e.currentTarget.scrollTop
                }
              }}
            />
          </div>
        ) : (
          <div className="preview">
            <PreviewErrorBoundary onFallbackToEdit={() => (onModeChange ? onModeChange('edit') : setInternalMode('edit'))}>
              <Suspense fallback={null}>
                <ReactMarkdown components={markdownComponents}>{body}</ReactMarkdown>
              </Suspense>
            </PreviewErrorBoundary>
          </div>
        )}
        {query && matches.length > 0 && (
          <div className="editor-search-slider" data-testid="editor-search-slider">
            <div
              className="editor-search-ticks"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                if (rect.height === 0) return
                const ratio = (e.clientY - rect.top) / rect.height
                let nearestIdx = 0
                let nearestDist = Infinity
                matches.forEach((m, idx) => {
                  const dist = Math.abs(m.ratio - ratio)
                  if (dist < nearestDist) {
                    nearestDist = dist
                    nearestIdx = idx
                  }
                })
                scrollToMatch(nearestIdx)
              }}
            >
              {matches.map((m, idx) => (
                <button
                  key={`${m.index}-${idx}`}
                  type="button"
                  className={`editor-search-tick ${idx === clampedMatchIndex ? 'is-current' : ''}`}
                  style={{ top: `${m.ratio * 100}%` }}
                  aria-label={`一致箇所 ${idx + 1} へ移動`}
                  onClick={(e) => {
                    e.stopPropagation()
                    scrollToMatch(idx)
                  }}
                />
              ))}
            </div>
            <input
              type="range"
              className="editor-search-range"
              aria-label="検索一致箇所スライダー"
              min={0}
              max={Math.max(0, matches.length - 1)}
              value={clampedMatchIndex}
              onChange={(e) => scrollToMatch(Number(e.target.value))}
            />
          </div>
        )}
      </div>
    </div>
  )
}

