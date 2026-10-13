import { useState } from 'react'

interface Props {
  onUnlock: () => void
  checkPassword: (input: string) => Promise<boolean>
}

export function AppLock({ onUnlock, checkPassword }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const submit = async () => {
    const ok = await checkPassword(password)
    if (ok) {
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <div className="app-lock">
      <label htmlFor="app-lock-password">パスワード</label>
      <input
        id="app-lock-password"
        type="password"
        className="input"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
      <button type="button" className="btn btn-primary" onClick={submit}>
        開く
      </button>
      {error && <p className="app-lock-error">パスワードが違います</p>}
    </div>
  )
}
