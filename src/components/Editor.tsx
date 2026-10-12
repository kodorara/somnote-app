import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface Props {
  body: string
  onChange: (body: string) => void
}

export function Editor({ body, onChange }: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
          {mode === 'edit' ? 'プレビュー' : '編集'}
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea aria-label="本文" value={body} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="preview">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
