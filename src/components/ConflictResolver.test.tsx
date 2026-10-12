import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConflictResolver } from './ConflictResolver'

describe('ConflictResolver', () => {
  it('shows both local and remote body text', () => {
    render(<ConflictResolver localBody="ローカル版の本文" remoteBody="リモート版の本文" onResolve={() => {}} />)
    expect(screen.getByText('ローカル版の本文')).toBeInTheDocument()
    expect(screen.getByText('リモート版の本文')).toBeInTheDocument()
  })

  it('calls onResolve with "local" when ローカル版を残す is clicked', () => {
    const onResolve = vi.fn()
    render(<ConflictResolver localBody="a" remoteBody="b" onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'ローカル版を残す' }))
    expect(onResolve).toHaveBeenCalledWith('local')
  })

  it('calls onResolve with "remote" when リモート版を残す is clicked', () => {
    const onResolve = vi.fn()
    render(<ConflictResolver localBody="a" remoteBody="b" onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'リモート版を残す' }))
    expect(onResolve).toHaveBeenCalledWith('remote')
  })
})
