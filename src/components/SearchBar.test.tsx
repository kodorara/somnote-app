import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SearchBar } from './SearchBar'

describe('SearchBar', () => {
  it('calls onQueryChange as the user types', () => {
    const onQueryChange = vi.fn()
    render(<SearchBar onQueryChange={onQueryChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '哲学' } })
    expect(onQueryChange).toHaveBeenCalledWith('哲学')
  })
})
