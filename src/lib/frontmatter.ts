import { load, dump, JSON_SCHEMA } from 'js-yaml'

// gray-matterはNode.jsのBufferに依存しており、ブラウザ(本アプリの実行環境)では
// "ReferenceError: Buffer is not defined" で例外を投げる。Vitestのテストは
// Node環境で動くためこの依存漏れを検出できなかった。frontmatterの形式はこちらで
// 完全に把握している固定フォーマット(---\nYAML\n---\n本文)なので、
// gray-matterを使わずjs-yamlだけで split/join する。
//
// デフォルトのYAMLエンジン(js-yamlのDEFAULT_SCHEMA)は、クォートされていない
// "2015-09-19T10:10:35+09:00" のような文字列を自動的にDateオブジェクトへ変換してしまう。
// ユーザーや他ツールが将来frontmatterを手で編集する可能性があるため(設計書0章の前提)、
// timestampの暗黙解釈を行わないJSON_SCHEMAに固定する。
const YAML_OPTIONS = { schema: JSON_SCHEMA }

const OPEN_DELIMITER = '---\n'
const CLOSE_DELIMITER = '\n---\n'

export interface LlmLink {
  url: string
  label: string
  addedAt: string
}

export interface Note {
  id: string
  title: string
  folder: string
  seq: number
  tags: string[]
  createdAt: string
  updatedAt: string
  deleted: boolean
  llmLinks: LlmLink[]
  body: string
}

interface RawLlmLink {
  url: string
  label: string
  added_at: string
}

interface RawFrontmatter {
  id: string
  title: string
  folder: string
  seq: number
  tags?: string[]
  created_at: string
  updated_at: string
  deleted?: boolean
  llm_links?: RawLlmLink[]
}

export function parseNote(raw: string): Note {
  if (!raw.startsWith(OPEN_DELIMITER)) {
    throw new Error('invalid note format: missing opening frontmatter delimiter')
  }
  const closeIndex = raw.indexOf(CLOSE_DELIMITER, OPEN_DELIMITER.length)
  if (closeIndex === -1) {
    throw new Error('invalid note format: missing closing frontmatter delimiter')
  }
  const yamlText = raw.slice(OPEN_DELIMITER.length, closeIndex)
  const body = raw.slice(closeIndex + CLOSE_DELIMITER.length)

  const fm = load(yamlText, YAML_OPTIONS) as RawFrontmatter
  return {
    id: fm.id,
    title: fm.title,
    folder: fm.folder,
    seq: fm.seq,
    tags: fm.tags ?? [],
    createdAt: fm.created_at,
    updatedAt: fm.updated_at,
    deleted: fm.deleted ?? false,
    llmLinks: (fm.llm_links ?? []).map((l) => ({
      url: l.url,
      label: l.label,
      addedAt: l.added_at,
    })),
    body,
  }
}

export function serializeNote(note: Note): string {
  const data: RawFrontmatter = {
    id: note.id,
    title: note.title,
    folder: note.folder,
    seq: note.seq,
    tags: note.tags,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted: note.deleted,
    llm_links: note.llmLinks.map((l) => ({ url: l.url, label: l.label, added_at: l.addedAt })),
  }
  const yamlText = dump(data, YAML_OPTIONS)
  return `${OPEN_DELIMITER}${yamlText}---\n${note.body}`
}
