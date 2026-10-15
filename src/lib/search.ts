import FlexSearch, { type DocumentValue } from 'flexsearch'

export interface SearchableNote {
  id: string
  title: string
  body: string
  [key: string]: DocumentValue | DocumentValue[]
}

export type SearchIndex = InstanceType<typeof FlexSearch.Document<SearchableNote>>

export function createIndex(): SearchIndex {
  return new FlexSearch.Document({
    document: { id: 'id', index: ['title', 'body'] },
    tokenize: 'full',
  }) as SearchIndex
}

export function buildIndex(notes: SearchableNote[]): SearchIndex {
  const index = createIndex()
  for (const n of notes) index.add(n)
  return index
}

export function indexNote(index: SearchIndex, note: SearchableNote): void {
  // FlexSearchのDocument.updateは存在しないIDの場合は自動的にaddとして機能する
  index.update(note)
}

export function removeNoteFromIndex(index: SearchIndex, id: string): void {
  index.remove(id)
}

export function search(index: SearchIndex, query: string): string[] {
  const results = index.search(query, { enrich: false })
  const ids = new Set<string>()
  for (const r of results as { result: (string | number)[] }[]) {
    for (const id of r.result) ids.add(String(id))
  }
  return Array.from(ids)
}

