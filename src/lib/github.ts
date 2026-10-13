const API = 'https://api.github.com'

export function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function decodeUtf8Base64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
}

// GitHubはレート制限・権限不足・単純なパスの誤りをいずれも403/404で返すことがあり、
// ステータスコードだけでは原因が分からない。レスポンス本文の"message"とレート制限の
// 残量ヘッダーを合わせて表示することで、ユーザーが原因を判断できるようにする。
async function describeError(prefix: string, res: Response): Promise<string> {
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  let body = ''
  try {
    const json = await res.json()
    body = json?.message ?? ''
  } catch {
    // レスポンスがJSONでない場合は本文なしで続行
  }
  const rateInfo =
    remaining !== null
      ? ` (レート制限残り${remaining}回${reset ? `, リセット: ${new Date(Number(reset) * 1000).toLocaleString('ja-JP')}` : ''})`
      : ''
  return `${prefix} failed: ${res.status}${body ? ` - ${body}` : ''}${rateInfo}`
}

// pathは "notes/前ノート/a.md" のようにスラッシュを含む。encodeURIComponent(path)を
// そのまま使うとスラッシュ自体も%2Fにエンコードされ、GitHub Contents APIのルーティングに
// 合わなくなるため、パスをセグメントごとに分けてエンコードしてから再結合する。
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export interface TreeEntry {
  path: string
  sha: string
  type?: string
}

export async function getTree(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<{ tree: TreeEntry[]; truncated: boolean }> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: headers(token),
  })
  if (!res.ok) throw new Error(await describeError('getTree', res))
  return res.json() as Promise<{ tree: TreeEntry[]; truncated: boolean }>
}

export async function getContent(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<{ sha: string; content: string }> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    headers: headers(token),
  })
  if (!res.ok) throw new Error(await describeError('getContent', res))
  const data = await res.json()
  return { sha: data.sha as string, content: decodeUtf8Base64(data.content as string) }
}

export async function putContent(
  owner: string,
  repo: string,
  path: string,
  content: string,
  baseSha: string | null,
  token: string,
): Promise<{ content: { sha: string } }> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `update ${path}`,
      content: encodeUtf8Base64(content),
      ...(baseSha ? { sha: baseSha } : {}),
    }),
  })
  if (!res.ok) throw new Error(await describeError('putContent', res))
  return res.json() as Promise<{ content: { sha: string } }>
}
