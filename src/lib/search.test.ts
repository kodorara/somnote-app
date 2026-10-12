import { describe, it, expect } from 'vitest'
import { buildIndex, search } from './search'

describe('search', () => {
  it('finds a note by a title substring at the start', () => {
    const idx = buildIndex([
      { id: 'a', title: '生きる意味は、今つくる。', body: '本文a' },
      { id: 'b', title: '戦争賛美', body: '本文b' },
    ])
    expect(search(idx, '生きる')).toEqual(['a'])
  })

  it('finds a note by a title substring in the middle (not just a prefix match)', () => {
    const idx = buildIndex([
      { id: 'a', title: '生きる意味は、今つくる。', body: '本文a' },
      { id: 'b', title: '戦争賛美', body: '本文b' },
    ])
    expect(search(idx, '意味')).toEqual(['a'])
  })

  it('finds a note by body content', () => {
    const idx = buildIndex([
      { id: 'a', title: 'タイトルA', body: '哲学について考えた' },
      { id: 'b', title: 'タイトルB', body: '日記' },
    ])
    expect(search(idx, '哲学')).toEqual(['a'])
  })
})
