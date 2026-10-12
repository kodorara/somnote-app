import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Settings } from './Settings'

describe('Settings', () => {
  it('calls onSave with the entered token/owner/repo', () => {
    const onSave = vi.fn()
    render(<Settings initial={null} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Personal Access Token'), { target: { value: 'ghp_xxx' } })
    fireEvent.change(screen.getByLabelText('GitHubユーザー名'), { target: { value: 'uranari' } })
    fireEvent.change(screen.getByLabelText('データリポジトリ名'), { target: { value: 'somnote-data' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledWith({ token: 'ghp_xxx', owner: 'uranari', repo: 'somnote-data' })
  })
})
