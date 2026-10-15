import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type StoredNote, type StoredFolder } from './lib/db'
import { createDraftNote, shouldDiscardDraft, deriveTitle } from './lib/draftNote'
import { getGithubSettings, saveGithubSettings, type GithubSettings } from './lib/githubSettings'
import { buildIndex, search, indexNote, removeNoteFromIndex, type SearchIndex } from './lib/search'
import { fullSync } from './lib/fullSync'
import { pushFolders } from './lib/folderSync'
import { createFolder, deleteFolder, reorderFolders, topFolder } from './lib/folders'
import * as githubClient from './lib/github'
import type { ConflictItem } from './lib/sync'
import { FolderList } from './components/FolderList'
import { NoteList, type SortBy } from './components/NoteList'
import { NoteListControls } from './components/NoteListControls'
import { Editor } from './components/Editor'
import { SearchBar } from './components/SearchBar'
import { LlmLinkPanel } from './components/LlmLinkPanel'
import { SyncStatusBadge } from './components/SyncStatusBadge'
import { ConflictResolver } from './components/ConflictResolver'
import { Settings } from './components/Settings'
import { AppLock } from './components/AppLock'
import { checkPassword, isUnlocked, setUnlocked } from './lib/appLock'
import './App.css'

type MobileScreen = 'folders' | 'notes' | 'editor'

export default function App() {
  const [unlocked, setUnlockedState] = useState(isUnlocked())
  const [settings, setSettings] = useState<GithubSettings | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [activeNote, setActiveNote] = useState<StoredNote | null>(null)
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('editor')
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('createdDesc')
  const [wordFilter, setWordFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const syncInFlightRef = useRef(false)
  const searchIndexRef = useRef<SearchIndex | null>(null)

  useEffect(() => {
    const s = getGithubSettings()
    setSettings(s)
    setSettingsLoaded(true)
  }, [])

  const refreshPendingCount = async () => {
    const all = await db.notes.toArray()
    setPendingCount(all.filter((n) => n.dirty).length)
  }

  const rebuildSearchIndex = async () => {
    const all = await db.notes.toArray()
    searchIndexRef.current = buildIndex(
      all.filter((n) => !n.deleted).map((n) => ({ id: n.id, title: n.title, body: n.body })),
    )
  }

  const updateSearchIndexForNote = (note: StoredNote) => {
    if (!searchIndexRef.current) return
    if (note.deleted) {
      removeNoteFromIndex(searchIndexRef.current, note.id)
    } else {
      indexNote(searchIndexRef.current, { id: note.id, title: note.title, body: note.body })
    }
  }

  const [searchResetKey, setSearchResetKey] = useState(0)
  const [globalSearchResults, setGlobalSearchResults] = useState<StoredNote[] | null>(null)

  const resetSearch = () => {
    setSearchQuery('')
    setSearchResultIds(null)
    setGlobalSearchResults(null)
    setSearchResetKey((k) => k + 1)
  }



  const loadFolderAndDraft = async (allFolders: StoredFolder[]) => {
    // 起動時は常に一番上(表示順が最小)のフォルダで新規メモを書き始める。
    // フォルダの並び替え(上下ボタン)で、どのフォルダを起動時の既定にするか選べる。
    const folder = topFolder(allFolders)
    if (!folder) return
    setSelectedFolder(folder.name)

    const folderNotes = await db.notes.where('folder').equals(folder.name).toArray()
    setNotes(folderNotes)
    await refreshPendingCount()

    const maxSeq = folderNotes.reduce((m, n) => Math.max(m, n.seq), -1)
    const draft = createDraftNote(folder.name, maxSeq)
    setActiveNote(draft)
    setMobileScreen('editor')
  }

  useEffect(() => {
    if (!settings) return

    const doSync = async () => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true
      try {
        if (navigator.onLine) {
          try {
            const result = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
            setConflicts(result.conflicts)
            setSyncError(null)
          } catch (err) {
            // バッチごとに永続化しているため、途中で失敗してもここまでの分はIndexedDBに
            // 残っている。エラーは画面に出した上で、残っている分だけでも表示に進む。
            setSyncError(err instanceof Error ? err.message : String(err))
          } finally {
            setSyncProgress(null)
          }
        }
        const allFolders = await db.folders.toArray()
        setFolders(allFolders)
        await loadFolderAndDraft(allFolders)
        await rebuildSearchIndex()
      } finally {
        syncInFlightRef.current = false
      }
    }
    doSync()

    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])


  const activeNoteRef = useRef<StoredNote | null>(null)
  const notesRef = useRef<StoredNote[]>([])
  const lastSavedBodyRef = useRef<string | null>(null)

  useEffect(() => {
    activeNoteRef.current = activeNote
  }, [activeNote])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    lastSavedBodyRef.current = activeNote?.body ?? null
  }, [activeNote?.id])

  const updateBody = (body: string) => {
    if (!activeNote) return
    setActiveNote({ ...activeNote, body, dirty: true, updatedAt: new Date().toISOString() })
  }

  // noteを明示的な引数で受け取る(activeNoteのstate更新は非同期なため、呼び出し直後の
  // 最新値を確実に使うには呼び出し元から渡してもらう方が安全)
  const saveNote = async (note: StoredNote) => {
    // 設計書2.2節: タイトルは保存のたびに本文1行目から自動算出する
    const withTitle = { ...note, title: deriveTitle(note.body) }
    await db.notes.put(withTitle)
    lastSavedBodyRef.current = withTitle.body
    updateSearchIndexForNote(withTitle)
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === withTitle.id)
      return exists ? prev.map((n) => (n.id === withTitle.id ? withTitle : n)) : [...prev, withTitle]
    })
    if (activeNote?.id === withTitle.id) setActiveNote(withTitle)
    await refreshPendingCount()
  }

  const saveActiveNote = async () => {
    if (!activeNote) return
    await saveNote(activeNote)
  }

  const autoSaveActiveNote = async () => {
    const note = activeNoteRef.current
    if (!note) return
    if (note.body === lastSavedBodyRef.current) return
    if (shouldDiscardDraft(note.body) && !notesRef.current.some((n) => n.id === note.id)) {
      return
    }
    await saveNote(note)
  }

  useEffect(() => {
    // 30秒インターバルでの自動保存
    const timer = setInterval(() => {
      void autoSaveActiveNote()
    }, 30000)

    // バックグラウンド化(アプリ切替・ホーム画面・画面オフなど)の即時保存
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void autoSaveActiveNote()
      }
    }

    // タブクローズ・ページ離脱(モバイル/PC)
    const handlePageHide = () => {
      void autoSaveActiveNote()
    }

    // デスクトップでのタブ閉じ/リロード
    const handleBeforeUnload = () => {
      void autoSaveActiveNote()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])


  const leaveEditor = async () => {
    if (!activeNote) return
    if (!shouldDiscardDraft(activeNote.body) || notes.some((n) => n.id === activeNote.id)) {
      await saveNote(activeNote)
    }
  }

  const deleteActiveNote = async () => {
    if (!activeNote) return
    const deletedNote = { ...activeNote, deleted: true, dirty: true, updatedAt: new Date().toISOString() }
    await db.notes.put(deletedNote)
    updateSearchIndexForNote(deletedNote)
    setNotes(notes.filter((n) => n.id !== deletedNote.id))
    setActiveNote(null)
    resetSearch()
    setMobileScreen('notes')
    await refreshPendingCount()
  }

  const goBack = async () => {
    resetSearch()
    if (mobileScreen === 'editor') {
      await leaveEditor()
      setMobileScreen('notes')
    } else if (mobileScreen === 'notes') {
      setMobileScreen('folders')
    }
  }

  const createNewNote = async () => {
    if (!selectedFolder) return
    await leaveEditor()
    resetSearch()
    const maxSeq = notes.reduce((m, n) => Math.max(m, n.seq), -1)
    const draft = createDraftNote(selectedFolder, maxSeq)
    setActiveNote(draft)
    setMobileScreen('editor')
  }

  const moveNoteToFolder = async (newFolderName: string) => {
    if (!activeNote || newFolderName === activeNote.folder) return
    const moved = {
      ...activeNote,
      folder: newFolderName,
      baseSha: null, // 新フォルダへの新規作成としてpushし、旧パスは同期時にDELETEする
      dirty: true,
      updatedAt: new Date().toISOString(),
    }
    await db.notes.put(moved)
    updateSearchIndexForNote(moved)
    // 現在表示中のフォルダ一覧には、移動先が別フォルダなのでもう含めない
    setNotes(notes.filter((n) => n.id !== moved.id))
    setActiveNote(null)
    resetSearch()
    setMobileScreen('notes')
    await refreshPendingCount()
  }


  const handleCreateFolder = async (name: string) => {
    setFolderError(null)
    const folder = await createFolder(name, folders)
    setFolders((prev) => [...prev, folder])
    if (settings && navigator.onLine) {
      try {
        await pushFolders(settings, githubClient)
      } catch (err) {
        setFolderError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleReorderFolders = async (orderedIds: string[]) => {
    const updated = reorderFolders(folders, orderedIds)
    await db.folders.bulkPut(updated)
    setFolders(updated)
    if (settings && navigator.onLine) {
      try {
        await pushFolders(settings, githubClient)
      } catch (err) {
        setFolderError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleDeleteFolder = async (folder: StoredFolder) => {
    setFolderError(null)
    resetSearch()
    try {
      await deleteFolder(folder)
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : String(err))
      return
    }
    const remaining = folders.filter((f) => f.folderId !== folder.folderId)
    setFolders(remaining)
    if (selectedFolder === folder.name) {
      const next = remaining[0]
      if (next) {
        setSelectedFolder(next.name)
        setNotes(await db.notes.where('folder').equals(next.name).toArray())
      } else {
        setSelectedFolder(null)
        setNotes([])
      }
    }
    if (settings && navigator.onLine) {
      try {
        await pushFolders(settings, githubClient)
      } catch (err) {
        setFolderError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const searchPlaceholder = useMemo(() => {
    if (mobileScreen === 'folders') return '全メモを検索'
    if (mobileScreen === 'notes') return selectedFolder ? `"${selectedFolder}"内を検索` : 'フォルダ内を検索'
    return '本文内を検索'
  }, [mobileScreen, selectedFolder])

  const runSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query) {
      setSearchResultIds(null)
      setGlobalSearchResults(null)
      return
    }
    if (!searchIndexRef.current) {
      setSearchResultIds([])
      setGlobalSearchResults([])
      return
    }
    const matchedIds = search(searchIndexRef.current, query)
    const idSet = new Set(matchedIds)

    if (mobileScreen === 'folders') {
      // フォルダ一覧画面: 全メモ対象 (全フォルダ横断検索)
      const all = await db.notes.toArray()
      const results = all.filter((n) => !n.deleted && idSet.has(n.id))
      setGlobalSearchResults(results)
      setSearchResultIds(matchedIds)
      setMobileScreen('notes')
    } else {
      // フォルダ画面 / エディタ画面
      setGlobalSearchResults(null)
      setSearchResultIds(matchedIds)
    }
  }

  const visibleNotes = useMemo(() => {
    if (globalSearchResults !== null) return globalSearchResults
    if (!searchResultIds) return notes
    const idSet = new Set(searchResultIds)
    return notes.filter((n) => idSet.has(n.id))
  }, [notes, searchResultIds, globalSearchResults])


  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const n of notes) {
      if (n.deleted) continue
      for (const t of n.tags) tagSet.add(t)
    }
    return Array.from(tagSet).sort()
  }, [notes])

  const handleSyncNow = async () => {
    if (!settings || syncInFlightRef.current) return
    syncInFlightRef.current = true
    try {
      const result = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
      setConflicts(result.conflicts)
      setSyncError(null)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncProgress(null)
      await refreshPendingCount()
      await rebuildSearchIndex()
      syncInFlightRef.current = false
    }
  }

  const resolveConflict = async (conflict: ConflictItem, choice: 'local' | 'remote') => {
    if (choice === 'local') {
      await db.notes.put({ ...conflict.localNote, baseSha: conflict.remoteSha, dirty: true })
    } else {
      await db.notes.put({ ...conflict.remoteNote, baseSha: conflict.remoteSha, dirty: false })
    }
    if (settings) {
      const result = await fullSync(settings, githubClient)
      setConflicts(result.conflicts)
    } else {
      setConflicts(conflicts.filter((c) => c.id !== conflict.id))
    }
    await refreshPendingCount()
    await rebuildSearchIndex()
  }

  if (!unlocked) {
    return (
      <AppLock
        checkPassword={checkPassword}
        onUnlock={() => {
          setUnlocked()
          setUnlockedState(true)
        }}
      />
    )
  }

  if (!settingsLoaded) return null

  if (!settings) {
    return (
      <Settings
        initial={null}
        onSave={(s) => {
          saveGithubSettings(s)
          setSettings(s)
        }}
      />
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        {mobileScreen !== 'folders' && (
          <button type="button" className="btn btn-ghost mobile-only" onClick={goBack}>
            ← 戻る
          </button>
        )}
        <SearchBar
          key={searchResetKey}
          value={searchQuery}
          placeholder={searchPlaceholder}
          onQueryChange={runSearch}
        />

        <SyncStatusBadge online={online} pendingCount={pendingCount} onSyncNow={handleSyncNow} />
      </div>
      {syncProgress && (
        <p className="sync-progress">
          同期中... {syncProgress.done}/{syncProgress.total}件
        </p>
      )}
      {syncError && <p className="sync-error">同期エラー: {syncError}(ここまでの分は保存済みです)</p>}
      {conflicts.length > 0 && (
        <ConflictResolver
          localBody={conflicts[0].localBody}
          remoteBody={conflicts[0].remoteBody}
          onResolve={(choice) => resolveConflict(conflicts[0], choice)}
        />
      )}
      <div className={`columns mobile-${mobileScreen}`}>
        <div className="col-folders">
          {folderError && <p className="folder-error">{folderError}</p>}
          <FolderList
            folders={folders}
            selectedName={selectedFolder}
            onSelect={async (name) => {
              await leaveEditor()
              resetSearch()
              setSelectedFolder(name)
              setNotes(await db.notes.where('folder').equals(name).toArray())
              setWordFilter('')
              setTagFilter(null)
              setMobileScreen('notes')
            }}
            onCreate={handleCreateFolder}
            onDelete={handleDeleteFolder}
            onReorder={handleReorderFolders}
          />
        </div>

        <div className="col-notes">
          <button type="button" className="btn btn-primary new-note-btn" onClick={createNewNote}>
            + 新規作成
          </button>
          <NoteListControls
            sortBy={sortBy}
            onSortByChange={setSortBy}
            wordFilter={wordFilter}
            onWordFilterChange={setWordFilter}
            availableTags={availableTags}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
          />
          <NoteList
            notes={visibleNotes}
            selectedId={activeNote?.id ?? null}
            tagFilter={tagFilter}
            wordFilter={wordFilter}
            sortBy={sortBy}
            highlightQuery={searchQuery}
            onSelect={async (id) => {
              await leaveEditor()
              const n = await db.notes.get(id)
              if (n) {
                if (selectedFolder !== n.folder) {
                  setSelectedFolder(n.folder)
                  setNotes(await db.notes.where('folder').equals(n.folder).toArray())
                }
                setActiveNote(n)
              }
              setMobileScreen('editor')
            }}
          />
        </div>
        <div className="col-editor">
          {activeNote && (
            <>
              <Editor body={activeNote.body} onChange={updateBody} highlightQuery={searchQuery} />
              <div className="editor-actions">

                <button type="button" className="btn btn-primary" onClick={saveActiveNote}>
                  保存
                </button>
                <select
                  className="input"
                  aria-label="フォルダ移動"
                  value={activeNote.folder}
                  onChange={(e) => moveNoteToFolder(e.target.value)}
                >
                  {folders.map((f) => (
                    <option key={f.folderId} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" onClick={deleteActiveNote}>
                  ゴミ箱に移動
                </button>
              </div>
              <LlmLinkPanel
                body={activeNote.body}
                links={activeNote.llmLinks}
                onAddLink={(url, memo) => {
                  setActiveNote({
                    ...activeNote,
                    llmLinks: [...activeNote.llmLinks, { url, label: memo, addedAt: new Date().toISOString() }],
                    dirty: true,
                  })
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
