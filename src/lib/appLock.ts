// アプリURLを知っているだけの第三者が開けないようにする簡易ロック。
// 本格的な認証ではなく、「URLを知っていれば誰でも開ける」ことへの軽い抑止として、
// パスワードの平文はソースに埋め込まずSHA-256ハッシュで比較する。
const PASSWORD_HASH = '2f58a9d9925133c9b16dcae2f9d3df476d8a0d46c1432b72731e7c5cbceb6a7e'
const UNLOCK_KEY = 'somnote.unlocked'

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function checkPassword(input: string): Promise<boolean> {
  const hash = await sha256Hex(input)
  return hash === PASSWORD_HASH
}

export function isUnlocked(): boolean {
  return localStorage.getItem(UNLOCK_KEY) === 'true'
}

export function setUnlocked(): void {
  localStorage.setItem(UNLOCK_KEY, 'true')
}
