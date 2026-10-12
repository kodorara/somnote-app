import { describe, it, expect } from 'vitest'
import { extractTags } from './tags'

describe('extractTags', () => {
  it('extracts a tag written inline', () => {
    expect(extractTags('今日は #日記 を書いた')).toEqual(['日記'])
  })

  it('extracts multiple tags', () => {
    expect(extractTags('#哲学 #創作 について考えた')).toEqual(['哲学', '創作'])
  })

  it('does not treat a markdown heading as a tag', () => {
    expect(extractTags('# 見出しです\n本文')).toEqual([])
  })

  it('extracts a hierarchical tag with a slash', () => {
    expect(extractTags('#創作/短編 のネタ')).toEqual(['創作/短編'])
  })

  it('deduplicates repeated tags', () => {
    expect(extractTags('#日記 ...あとで #日記 にも触れる')).toEqual(['日記'])
  })
})
