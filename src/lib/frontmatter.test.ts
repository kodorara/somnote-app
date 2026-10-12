import { describe, it, expect } from 'vitest'
import { parseNote, serializeNote, type Note } from './frontmatter'

describe('parseNote', () => {
  it('parses frontmatter and body from a note file', () => {
    const raw = `---
id: 55fcd732150ba0a752c9151d
title: 黙っていて、察してもらおうなんて虫がいい。
folder: 前ノート
seq: 0
tags: [哲学]
created_at: 2015-09-19T10:10:35+09:00
updated_at: 2015-09-19T10:10:35+09:00
deleted: false
llm_links: []
---
本文1行目
本文2行目
`
    const note = parseNote(raw)
    expect(note.id).toBe('55fcd732150ba0a752c9151d')
    expect(note.title).toBe('黙っていて、察してもらおうなんて虫がいい。')
    expect(note.folder).toBe('前ノート')
    expect(note.seq).toBe(0)
    expect(note.tags).toEqual(['哲学'])
    expect(note.deleted).toBe(false)
    expect(note.llmLinks).toEqual([])
    expect(note.body).toBe('本文1行目\n本文2行目\n')
    // クォートされていないISO8601風の日付文字列はDateオブジェクトに暗黙変換されがち。
    // created_at/updated_atは必ず文字列として返ってくることを明示的に検証する。
    expect(typeof note.createdAt).toBe('string')
    expect(note.createdAt).toBe('2015-09-19T10:10:35+09:00')
    expect(typeof note.updatedAt).toBe('string')
    expect(note.updatedAt).toBe('2015-09-19T10:10:35+09:00')
  })
})

describe('serializeNote', () => {
  it('round-trips a note through serialize then parse', () => {
    const note: Note = {
      id: 'abc123',
      title: 'テスト',
      folder: '仕事',
      seq: 3,
      tags: ['tag1', 'tag2'],
      createdAt: '2026-10-12T10:00:00+09:00',
      updatedAt: '2026-10-12T10:00:00+09:00',
      deleted: false,
      llmLinks: [{ url: 'https://claude.ai/chat/xxx', label: '深掘り', addedAt: '2026-10-12T10:00:00+09:00' }],
      body: '本文です\n',
    }
    const raw = serializeNote(note)
    const reparsed = parseNote(raw)
    expect(reparsed).toEqual(note)
  })
})
