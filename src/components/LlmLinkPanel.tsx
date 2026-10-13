import { useState } from 'react'
import type { LlmLink } from '../lib/frontmatter'

interface Props {
  body: string
  links: LlmLink[]
  onAddLink: (url: string, memo: string) => void
}

const LLM_TARGETS = [
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
]

export function LlmLinkPanel({ body, links, onAddLink }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [url, setUrl] = useState('')
  const [memo, setMemo] = useState('')

  const sendTo = async (target: { name: string; url: string }) => {
    await navigator.clipboard.writeText(body)
    window.open(target.url, '_blank')
    // どのLLMへ送ったか覚えておき、戻ってきてURLを貼るだけで追加できるようにする
    setMemo(target.name)
  }

  const submitAdd = () => {
    if (!url.trim()) return
    onAddLink(url, memo)
    setUrl('')
    setMemo('')
  }

  if (!expanded) {
    return (
      <button type="button" className="btn btn-ghost llm-panel-toggle" onClick={() => setExpanded(true)}>
        LLM連携{links.length > 0 ? `(${links.length})` : ''}
      </button>
    )
  }

  return (
    <div className="llm-link-panel">
      <button type="button" className="btn btn-ghost llm-panel-toggle" onClick={() => setExpanded(false)}>
        LLM連携を閉じる
      </button>
      <div className="llm-buttons">
        {LLM_TARGETS.map((t) => (
          <button type="button" className="btn" key={t.name} onClick={() => sendTo(t)}>
            {t.name}へ
          </button>
        ))}
      </div>
      <ul>
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url}>{l.label || l.url}</a>
          </li>
        ))}
      </ul>
      <div className="add-link-form">
        <label htmlFor="llm-url">チャットURL</label>
        <input className="input" id="llm-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label htmlFor="llm-memo">メモ</label>
        <input className="input" id="llm-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <button type="button" className="btn" onClick={submitAdd}>
          追加
        </button>
      </div>
    </div>
  )
}
