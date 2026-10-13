import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AppLock } from './AppLock'

describe('AppLock', () => {
  it('calls onUnlock when the password is correct', async () => {
    const onUnlock = vi.fn()
    const checkPassword = vi.fn().mockResolvedValue(true)
    render(<AppLock onUnlock={onUnlock} checkPassword={checkPassword} />)

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'waki1223' } })
    fireEvent.click(screen.getByRole('button', { name: '開く' }))

    await waitFor(() => expect(onUnlock).toHaveBeenCalled())
    expect(checkPassword).toHaveBeenCalledWith('waki1223')
  })

  it('shows an error and does not unlock when the password is wrong', async () => {
    const onUnlock = vi.fn()
    const checkPassword = vi.fn().mockResolvedValue(false)
    render(<AppLock onUnlock={onUnlock} checkPassword={checkPassword} />)

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '開く' }))

    await waitFor(() => expect(screen.getByText('パスワードが違います')).toBeInTheDocument())
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('submits on Enter key', async () => {
    const onUnlock = vi.fn()
    const checkPassword = vi.fn().mockResolvedValue(true)
    render(<AppLock onUnlock={onUnlock} checkPassword={checkPassword} />)

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'waki1223' } })
    fireEvent.keyDown(screen.getByLabelText('パスワード'), { key: 'Enter' })

    await waitFor(() => expect(onUnlock).toHaveBeenCalled())
  })
})
