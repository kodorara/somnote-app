import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HighlightText } from './HighlightText'

describe('HighlightText', () => {
  it('renders raw text as-is when query is empty', () => {
    const { container } = render(<HighlightText text="哲学の思索" query="" />)
    expect(container.textContent).toBe('哲学の思索')
    expect(container.querySelector('mark')).toBeNull()
  })

  it('highlights matched substring with <mark className="search-highlight">', () => {
    const { container } = render(<HighlightText text="現代哲学の思索" query="哲学" />)
    expect(container.textContent).toBe('現代哲学の思索')
    const mark = container.querySelector('mark.search-highlight')
    expect(mark).toBeInTheDocument()
    expect(mark?.textContent).toBe('哲学')
  })

  it('is case-insensitive when matching latin characters', () => {
    const { container } = render(<HighlightText text="Hello World Note" query="world" />)
    const mark = container.querySelector('mark.search-highlight')
    expect(mark).toBeInTheDocument()
    expect(mark?.textContent).toBe('World')
  })

  it('safely escapes special regex characters in query', () => {
    const { container } = render(<HighlightText text="Price is $100 [USD]?" query="$100 [USD]?" />)
    const mark = container.querySelector('mark.search-highlight')
    expect(mark).toBeInTheDocument()
    expect(mark?.textContent).toBe('$100 [USD]?')
  })

  it('highlights multiple occurrences across the text', () => {
    const { container } = render(<HighlightText text="メモとメモの連携" query="メモ" />)
    const marks = container.querySelectorAll('mark.search-highlight')
    expect(marks).toHaveLength(2)
  })
})
