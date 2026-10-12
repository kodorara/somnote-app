import { useState } from 'react'
import type { LlmLink } from '../lib/frontmatter'

interface Props {
  body: string
  links: LlmLink[]
  onAddLink: (url: string, label: string) => void
}

const LLM_TARGETS = [
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
]

export function LlmLinkPanel({ body, links, onAddLink }: Props) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  const sendTo = async (target: { name: string; url: string }) => {
    await navigator.clipboard.writeText(body)
    window.open(target.url, '_blank')
  }

  return (
    <div className="llm-link-panel">
      <div className="llm-buttons">
        {LLM_TARGETS.map((t) => (
          <button type="button" key={t.name} onClick={() => sendTo(t)}>
            {t.name}へ
          </button>
        ))}
      </div>
      <ul>
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url}>{l.label}</a>
          </li>
        ))}
      </ul>
      <div className="add-link-form">
        <label htmlFor="llm-url">チャットURL</label>
        <input id="llm-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label htmlFor="llm-label">ラベル</label>
        <input id="llm-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            onAddLink(url, label)
            setUrl('')
            setLabel('')
          }}
        >
          追加
        </button>
      </div>
    </div>
  )
}
