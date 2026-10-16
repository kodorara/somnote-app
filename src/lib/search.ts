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

// tokenize:'full'での索引構築は件数が多いと数百ms〜数秒かかりうる重い同期処理。
// 一度に全件処理するとその間メインスレッドがブロックされ、スワイプ等のタッチ
// 操作への反応が遅れる/取りこぼされる原因になる。chunkSizeごとに処理を区切り、
// 間でイベントループに制御を返す(setTimeout(0))ことで、ブラウザが保留中の
// 入力やレンダリングを処理できる隙間を作る。
export async function buildIndexAsync(
  notes: SearchableNote[],
  chunkSize = 300,
): Promise<SearchIndex> {
  const index = createIndex()
  for (let i = 0; i < notes.length; i += chunkSize) {
    for (const n of notes.slice(i, i + chunkSize)) index.add(n)
    if (i + chunkSize < notes.length) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
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

