import matter from 'gray-matter'
import { load, dump, JSON_SCHEMA } from 'js-yaml'

// デフォルトのYAMLエンジン(js-yamlのDEFAULT_SCHEMA)は、クォートされていない
// "2015-09-19T10:10:35+09:00" のような文字列を自動的にDateオブジェクトへ変換してしまう。
// ユーザーや他ツールが将来frontmatterを手で編集する可能性があるため(設計書0章の前提)、
// timestampの暗黙解釈を行わないJSON_SCHEMAに固定する。
const YAML_ENGINE = {
  parse: (s: string) => load(s, { schema: JSON_SCHEMA }) as object,
  stringify: (data: object) => dump(data, { schema: JSON_SCHEMA }),
}

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
  const { data, content } = matter(raw, { engines: { yaml: YAML_ENGINE } })
  const fm = data as RawFrontmatter
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
    body: content,
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
  return matter.stringify(note.body, data, { engines: { yaml: YAML_ENGINE } })
}
