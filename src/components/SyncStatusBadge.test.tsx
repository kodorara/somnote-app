import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SyncStatusBadge } from './SyncStatusBadge'

describe('SyncStatusBadge', () => {
  it('shows offline status and pending count', () => {
    render(<SyncStatusBadge online={false} pendingCount={3} onSyncNow={() => {}} />)
    expect(screen.getByText(/オフライン/)).toBeInTheDocument()
    expect(screen.getByText(/3件/)).toBeInTheDocument()
  })

  it('calls onSyncNow when the manual sync button is clicked', () => {
    const onSyncNow = vi.fn()
    render(<SyncStatusBadge online={true} pendingCount={0} onSyncNow={onSyncNow} />)
    fireEvent.click(screen.getByRole('button', { name: '今すぐ同期' }))
    expect(onSyncNow).toHaveBeenCalled()
  })
})
