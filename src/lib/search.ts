import FlexSearch, { type DocumentValue } from 'flexsearch'

export interface SearchableNote {
  id: string
  title: string
  body: string
  [key: string]: DocumentValue | DocumentValue[]
}

export function buildIndex(notes: SearchableNote[]) {
  const index = new FlexSearch.Document({
    document: { id: 'id', index: ['title', 'body'] },
    tokenize: 'full',
  })
  for (const n of notes) index.add(n)
  return index
}

export function search(index: ReturnType<typeof buildIndex>, query: string): string[] {
  const results = index.search(query, { enrich: false })
  const ids = new Set<string>()
  for (const r of results as { result: (string | number)[] }[]) {
    for (const id of r.result) ids.add(String(id))
  }
  return Array.from(ids)
}
