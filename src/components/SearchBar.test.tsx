import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SearchBar } from './SearchBar'

describe('SearchBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces onQueryChange calls until delay passes', () => {
    const onQueryChange = vi.fn()
    render(<SearchBar onQueryChange={onQueryChange} debounceMs={200} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '哲学' } })
    expect(onQueryChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onQueryChange).toHaveBeenCalledTimes(1)
    expect(onQueryChange).toHaveBeenCalledWith('哲学')
  })

  it('only fires once for rapid consecutive key strokes', () => {
    const onQueryChange = vi.fn()
    render(<SearchBar onQueryChange={onQueryChange} debounceMs={200} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '哲' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '哲学' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '哲学メモ' } })
    expect(onQueryChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onQueryChange).toHaveBeenCalledTimes(1)
    expect(onQueryChange).toHaveBeenCalledWith('哲学メモ')
  })

  it('updates display value when value prop changes (e.g. search reset)', () => {
    const onQueryChange = vi.fn()
    const { rerender } = render(<SearchBar value="初期" onQueryChange={onQueryChange} />)
    expect(screen.getByRole('searchbox')).toHaveValue('初期')

    rerender(<SearchBar value="" onQueryChange={onQueryChange} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('renders default placeholder "検索" and applies has-value class when input has text', () => {
    const onQueryChange = vi.fn()
    const { container, rerender } = render(<SearchBar onQueryChange={onQueryChange} />)
    const searchbox = screen.getByRole('searchbox')
    expect(searchbox).toHaveAttribute('placeholder', '検索')
    expect(container.querySelector('.search-bar-wrap')).not.toHaveClass('has-value')

    rerender(<SearchBar value="入力中" onQueryChange={onQueryChange} />)
    expect(container.querySelector('.search-bar-wrap')).toHaveClass('has-value')
  })
})


