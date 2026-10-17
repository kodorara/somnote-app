import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { StoredFolder } from '../lib/db'
import { sortedBySeq } from '../lib/folders'
import { HighlightText } from './HighlightText'
import { CheckIcon, FolderIcon, TrashIcon, CloseIcon } from './icons'

export type SortBy = 'seq' | 'createdDesc' | 'createdAsc' | 'updatedDesc' | 'updatedAsc'

interface NoteSummary {
  id: string
  title: string
  seq: number
  createdAt: string
  updatedAt: string
  tags: string[]
  deleted: boolean
  folder?: string
}

interface Props {
  notes: NoteSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  tagFilter: string | null
  wordFilter: string
  sortBy: SortBy
  highlightQuery?: string
  isTrash?: boolean
  folders?: StoredFolder[]
  onBulkMove?: (ids: string[], folderName: string) => void
  onBulkDelete?: (ids: string[]) => void
  onBulkPermanentDelete?: (ids: string[]) => void
}

const SORTERS: Record<SortBy, (a: NoteSummary, b: NoteSummary) => number> = {
  seq: (a, b) => a.seq - b.seq,
  createdDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
  createdAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
  updatedDesc: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  updatedAsc: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
}

// ISO文字列(例: "2026-10-12T10:00:00+09:00")の日付部分だけを取り出す。
// Date経由で変換すると閲覧side(ブラウザ)のタイムゾーンで再解釈されてズレる恐れがあるため、
// 保存されている値の日付部分をそのまま切り出す。
function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return ''
  return iso.slice(0, 10).replace(/-/g, '/')
}

const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 10

export function NoteList({
  notes,
  selectedId,
  onSelect,
  tagFilter,
  wordFilter,
  sortBy,
  highlightQuery,
  isTrash = false,
  folders = [],
  onBulkMove,
  onBulkDelete,
  onBulkPermanentDelete,
}: Props) {
  const visible = isTrash ? notes.filter((n) => n.deleted) : notes.filter((n) => !n.deleted)
  const tagFiltered = tagFilter ? visible.filter((n) => n.tags.includes(tagFilter)) : visible
  const word = wordFilter.trim().toLowerCase()
  const wordFiltered = word ? tagFiltered.filter((n) => n.title.toLowerCase().includes(word)) : tagFiltered
  const sorted = [...wordFiltered].sort(SORTERS[sortBy])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const multiSelectMode = selectedIds.size > 0
  const longPressTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitMultiSelect = () => setSelectedIds(new Set())

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    longPressFiredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true
      toggleSelected(id)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return
    const dx = e.clientX - pointerStartRef.current.x
    const dy = e.clientY - pointerStartRef.current.y
    // 大きく動いた場合はスクロール操作とみなし、長押し判定をキャンセルする
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearLongPressTimer()
  }

  const handlePointerUp = () => {
    clearLongPressTimer()
  }

  const handleRowClick = (id: string) => {
    if (longPressFiredRef.current) {
      // 長押しで既に選択トグル済みなので、同じ操作由来のクリックは無視する
      longPressFiredRef.current = false
      return
    }
    if (multiSelectMode) {
      toggleSelected(id)
    } else {
      onSelect(id)
    }
  }

  return (
    <div className="note-list-wrap">
      {multiSelectMode && (
        <div className="note-bulk-bar">
          <span className="note-bulk-count">{selectedIds.size}件選択中</span>
          {isTrash ? (
            <button
              type="button"
              className="btn btn-danger note-bulk-delete-btn"
              aria-label="選択したメモを完全に削除"
              onClick={() => {
                onBulkPermanentDelete?.(Array.from(selectedIds))
                exitMultiSelect()
              }}
            >
              完全に削除
            </button>
          ) : (
            <>
              <div className="action-bar-folder-select" title="選択したメモをフォルダ移動">
                <FolderIcon size={16} className="folder-select-icon" />
                <select
                  className="action-bar-select"
                  aria-label="選択したメモをフォルダ移動"
                  value=""
                  onChange={(e) => {
                    const folderName = e.target.value
                    if (!folderName) return
                    onBulkMove?.(Array.from(selectedIds), folderName)
                    exitMultiSelect()
                  }}
                >
                  <option value="" disabled>
                    フォルダへ移動
                  </option>
                  {sortedBySeq(folders).map((f) => (
                    <option key={f.folderId} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn note-bulk-delete-btn"
                aria-label="選択したメモをゴミ箱に移動"
                onClick={() => {
                  onBulkDelete?.(Array.from(selectedIds))
                  exitMultiSelect()
                }}
              >
                <TrashIcon size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            className="action-bar-btn-close"
            aria-label="選択を解除"
            onClick={exitMultiSelect}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
      <ul className="note-list">
        {sorted.map((n) => (
          <li key={n.id} role="listitem" className={selectedIds.has(n.id) ? 'is-selected' : undefined}>
            <button
              type="button"
              aria-current={n.id === selectedId}
              aria-pressed={multiSelectMode ? selectedIds.has(n.id) : undefined}
              onPointerDown={(e) => handlePointerDown(e, n.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={() => handleRowClick(n.id)}
            >
              {multiSelectMode && (
                <span className={`note-select-indicator ${selectedIds.has(n.id) ? 'is-checked' : ''}`} aria-hidden="true">
                  {selectedIds.has(n.id) && <CheckIcon size={13} />}
                </span>
              )}
              <span className="note-row-main">
                <span className="note-title">
                  <HighlightText text={n.title} query={highlightQuery ?? ''} />
                </span>
                <span className="note-meta">
                  {isTrash && n.folder ? `[${n.folder}] ` : ''}作成 {formatDate(n.createdAt)} ・ 編集 {formatDate(n.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
