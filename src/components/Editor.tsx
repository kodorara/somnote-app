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
      <button type="button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
        {mode === 'edit' ? 'プレビュー' : '編集'}
      </button>
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
