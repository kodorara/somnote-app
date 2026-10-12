export interface GithubSettings {
  token: string
  owner: string
  repo: string
}

const KEY = 'somnote.githubSettings'

export function getGithubSettings(): GithubSettings | null {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as GithubSettings) : null
}

export function saveGithubSettings(settings: GithubSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
