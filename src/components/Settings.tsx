import { useState } from 'react'
import type { GithubSettings } from '../lib/githubSettings'

interface Props {
  initial: GithubSettings | null
  onSave: (settings: GithubSettings) => void
}

export function Settings({ initial, onSave }: Props) {
  const [token, setToken] = useState(initial?.token ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [repo, setRepo] = useState(initial?.repo ?? 'somnote-data')

  return (
    <div className="settings">
      <label htmlFor="pat">Personal Access Token</label>
      <input id="pat" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      <label htmlFor="owner">GitHubユーザー名</label>
      <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <label htmlFor="repo">データリポジトリ名</label>
      <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
      <button type="button" onClick={() => onSave({ token, owner, repo })}>
        保存
      </button>
    </div>
  )
}
