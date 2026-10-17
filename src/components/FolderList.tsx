import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { StoredFolder } from '../lib/db'
import { sortedBySeq } from '../lib/folders'
import { TrashIcon, GearIcon } from './icons'

interface Props {
  folders: StoredFolder[]
  selectedName: string | null
  onSelect: (folderName: string) => void
  onCreate: (name: string) => void
  onDelete: (folder: StoredFolder) => void
  onReorder: (orderedFolderIds: string[]) => void
  trashCount?: number
  noteCounts?: Record<string, number>
  onOpenSettings?: () => void
}


function GripIcon() {
  return (
    <svg className="drag-handle-icon" width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
      {[2, 8, 14].map((cy) => (
        <g key={cy}>
          <circle cx="3" cy={cy} r="1.4" fill="currentColor" />
          <circle cx="9" cy={cy} r="1.4" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 10

export function FolderList({
  folders,
  selectedName,
  onSelect,
  onCreate,
  onDelete,
  onReorder,
  trashCount,
  noteCounts,
  onOpenSettings,
}: Props) {
  const [newName, setNewName] = useState('')

  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const draggingId = useRef<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const longPressTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleRowPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, folder: StoredFolder) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    longPressFiredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true
      if (window.confirm(`「${folder.name}」を削除しますか？`)) {
        onDelete(folder)
      }
    }, LONG_PRESS_MS)
  }

  const handleRowPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return
    const dx = e.clientX - pointerStartRef.current.x
    const dy = e.clientY - pointerStartRef.current.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearLongPressTimer()
  }

  const handleRowPointerUp = () => clearLongPressTimer()

  const handleRowClick = (folder: StoredFolder) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    onSelect(folder.name)
  }

  const byId = new Map(folders.map((f) => [f.folderId, f]))
  const baseOrder = sortedBySeq(folders).map((f) => f.folderId)
  const order = dragOrder ?? baseOrder

  // ドラッグ中、指/カーソルが各フォルダ行の中点より上にあるかどうかで
  // 挿入位置を決める(各行の実測位置を見るため、見た目の行高さに依存しない)。
  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, folderId: string) => {
    e.preventDefault()
    draggingId.current = folderId
    setDragOrder(baseOrder)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 一部環境(テスト用jsdom等)ではPointer Capture未実装のため無視する
    }
  }

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const id = draggingId.current
    const currentOrder = dragOrder
    if (!id || !currentOrder) return

    let targetIndex = currentOrder.length - 1
    for (let i = 0; i < currentOrder.length; i++) {
      const el = rowRefs.current.get(currentOrder[i])
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (e.clientY < rect.top + rect.height / 2) {
        targetIndex = i
        break
      }
    }

    const fromIndex = currentOrder.indexOf(id)
    if (fromIndex === -1 || fromIndex === targetIndex) return
    const next = [...currentOrder]
    next.splice(fromIndex, 1)
    next.splice(targetIndex, 0, id)
    setDragOrder(next)
  }

  const endDrag = () => {
    const changed = dragOrder && dragOrder.some((id, i) => id !== baseOrder[i])
    if (draggingId.current && changed) onReorder(dragOrder)
    draggingId.current = null
    setDragOrder(null)
  }

  const submitCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setNewName('')
  }

  return (
    <div className="folder-list-wrap">
      <ul className="folder-list">
        {order.map((id) => {
          const f = byId.get(id)
          if (!f) return null
          return (
            <li
              key={f.folderId}
              ref={(el) => {
                if (el) rowRefs.current.set(f.folderId, el)
                else rowRefs.current.delete(f.folderId)
              }}
              role="listitem"
              className={draggingId.current === f.folderId ? 'is-dragging' : undefined}
            >
              <button
                type="button"
                className="folder-drag-handle"
                aria-label={`${f.name}をドラッグして並び替え`}
                onPointerDown={(e) => startDrag(e, f.folderId)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <GripIcon />
              </button>
              <button
                type="button"
                className="folder-select-btn"
                aria-current={f.name === selectedName}
                onPointerDown={(e) => handleRowPointerDown(e, f)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={handleRowPointerUp}
                onPointerCancel={handleRowPointerUp}
                onClick={() => handleRowClick(f)}
              >
                <span className="folder-dot" style={{ background: f.color }} aria-hidden="true" />
                <span className="folder-name">{f.name}</span>
                {!!noteCounts?.[f.name] && (
                  <span className="folder-count-badge" aria-hidden="true">
                    {noteCounts[f.name]}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="folder-trash-wrap">
        <button
          type="button"
          className="folder-select-btn folder-trash-btn"
          aria-label={trashCount !== undefined && trashCount > 0 ? `ゴミ箱 (${trashCount})` : 'ゴミ箱'}
          aria-current={selectedName === 'ゴミ箱'}
          onClick={() => onSelect('ゴミ箱')}
        >
          <TrashIcon size={16} className="trash-folder-icon" />
          <span className="folder-trash-label">ゴミ箱</span>
          {trashCount !== undefined && trashCount > 0 && (
            <span className="trash-count-badge">{trashCount}</span>
          )}
        </button>
      </div>

      <div className="folder-create-form">
        <input
          className="input"
          aria-label="新しいフォルダ名"
          placeholder="新しいフォルダ名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate()
          }}
        />
        <button type="button" className="btn" onClick={submitCreate}>
          追加
        </button>
      </div>

      {onOpenSettings && (
        <div className="folder-settings-wrap">
          <button
            type="button"
            className="folder-settings-btn"
            aria-label="設定を開く"
            onClick={onOpenSettings}
          >
            <GearIcon size={16} />
            <span>設定</span>
          </button>
        </div>
      )}
    </div>
  )
}

