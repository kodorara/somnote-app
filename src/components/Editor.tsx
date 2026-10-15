import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { HighlightText } from './HighlightText'

interface Props {
  body: string
  onChange: (body: string) => void
  highlightQuery?: string
  mode?: 'edit' | 'preview'
  onModeChange?: (mode: 'edit' | 'preview') => void
  hideToolbar?: boolean
}

export function Editor({ body, onChange, highlightQuery, mode: externalMode, onModeChange, hideToolbar }: Props) {
  const [internalMode, setInternalMode] = useState<'edit' | 'preview'>('edit')
  const currentMode = externalMode !== undefined ? externalMode : internalMode

  const toggleMode = () => {
    const next = currentMode === 'edit' ? 'preview' : 'edit'
    if (onModeChange) {
      onModeChange(next)
    } else {
      setInternalMode(next)
    }
  }

  const markdownComponents = useMemo(() => {
    const query = highlightQuery?.trim() ?? ''
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
  }, [highlightQuery])

  return (
    <div className="editor">
      {!hideToolbar && (
        <div className="editor-toolbar">
          <button type="button" className="btn btn-ghost" onClick={toggleMode}>
            {currentMode === 'edit' ? 'プレビュー' : '編集'}
          </button>
        </div>
      )}
      {currentMode === 'edit' ? (
        <textarea aria-label="本文" value={body} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="preview">
          <ReactMarkdown components={markdownComponents}>{body}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

