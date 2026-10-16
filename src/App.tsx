import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type StoredNote, type StoredFolder } from './lib/db'
import { createDraftNote, shouldDiscardDraft, deriveTitle } from './lib/draftNote'
import { getGithubSettings, saveGithubSettings, type GithubSettings } from './lib/githubSettings'
import { buildIndexAsync, search, indexNote, removeNoteFromIndex, type SearchIndex } from './lib/search'
import { fullSync } from './lib/fullSync'
import { pushFolders } from './lib/folderSync'
import { createFolder, deleteFolder, reorderFolders, topFolder, isTrashFolder } from './lib/folders'
import * as githubClient from './lib/github'
import type { ConflictItem } from './lib/sync'
import { FolderList } from './components/FolderList'
import { NoteList, type SortBy } from './components/NoteList'
import { NoteListControls } from './components/NoteListControls'
import { Editor } from './components/Editor'
import { SearchBar } from './components/SearchBar'
import { LlmLinkPanel } from './components/LlmLinkPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { EditorActionBar } from './components/EditorActionBar'

import { SwipeContainer } from './components/SwipeContainer'
import { PullToRefresh } from './components/PullToRefresh'
import { ConflictResolver } from './components/ConflictResolver'
import { Settings } from './components/Settings'
import { AppLock } from './components/AppLock'
import { checkPassword, isUnlocked, setUnlocked } from './lib/appLock'
import { writeEmergencySave, readEmergencySave, clearEmergencySave } from './lib/emergencySave'
import './App.css'

type MobileScreen = 'folders' | 'notes' | 'editor'

export default function App() {
  const [unlocked, setUnlockedState] = useState(isUnlocked())
  const [settings, setSettings] = useState<GithubSettings | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [trashCount, setTrashCount] = useState(0)
  const [activeNote, setActiveNote] = useState<StoredNote | null>(null)
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>('editor')
  const [online, setOnline] = useState(navigator.onLine)
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null)
  const [editorSearchQuery, setEditorSearchQuery] = useState('')
  const [editorPreviewMode, setEditorPreviewMode] = useState<'edit' | 'preview'>('edit')
  const [isLlmOpen, setIsLlmOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('createdDesc')
  const [wordFilter, setWordFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const syncInFlightRef = useRef(false)
  const searchIndexRef = useRef<SearchIndex | null>(null)

  const loadTrashCount = async () => {
    const count = await db.notes.filter((n) => !!n.deleted).count()
    setTrashCount(count)
  }

  const handleBackupRestored = async () => {
    const allFolders = await db.folders.toArray()
    setFolders(allFolders)
    await loadFolderAndDraft(allFolders)
    await rebuildSearchIndex()
    await loadTrashCount()
    resetSearch()
    setIsSettingsOpen(false)
  }



  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const s = getGithubSettings()
    setSettings(s)
    setSettingsLoaded(true)
  }, [])

  const refreshPendingCount = async () => {
    // 互換性維持
  }

  // 全件からの索引再構築は件数が多いと重い処理のため、本当に必要な場合
  // (索引がまだ無い＝初回起動、またはバックアップ復元で全データが丸ごと
  // 置き換わった場合)だけ呼ぶ。チャンク分割版(buildIndexAsync)を使い、
  // メインスレッドを長時間ブロックしないようにする。
  const rebuildSearchIndex = async () => {
    const all = await db.notes.toArray()
    searchIndexRef.current = await buildIndexAsync(
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

  // 同期で実際に変化したノートだけを索引に反映する。索引がまだ無い場合
  // (初回起動)は全件構築にフォールバックする。「同期のたびに全件再構築」を
  // やめることで、通常利用時の同期(差分がごく少数)でのメインスレッドブロックを
  // ほぼ無くす。
  const applySearchIndexUpdate = async (updatedNotes: StoredNote[] | null) => {
    if (!searchIndexRef.current) {
      await rebuildSearchIndex()
      return
    }
    if (updatedNotes) {
      for (const n of updatedNotes) updateSearchIndexForNote(n)
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
    await loadTrashCount()

    const maxSeq = folderNotes.reduce((m, n) => Math.max(m, n.seq), -1)
    const draft = createDraftNote(folder.name, maxSeq)
    setActiveNote(draft)
    setMobileScreen('editor')
  }

  // pagehide/beforeunload時に緊急退避された本文があれば、IndexedDB側より新しい場合に
  // 限って復元する。新規未保存の下書き(IndexedDBにまだ存在しないノート)は復元できない
  // (フォルダ等の情報が無いため)。これは「一度も保存されないまま即終了した」場合のみの
  // 残余リスクであり、既存ノートの編集は30秒間隔の自動保存・pagehide双方でカバーされる。
  const recoverEmergencySave = async () => {
    const save = readEmergencySave()
    if (!save) return
    const existing = await db.notes.get(save.noteId)
    if (existing && save.updatedAt > existing.updatedAt) {
      await db.notes.put({
        ...existing,
        body: save.body,
        title: deriveTitle(save.body),
        updatedAt: save.updatedAt,
        dirty: true,
      })
    }
    clearEmergencySave()
  }

  useEffect(() => {
    if (!settings) return

    const doSync = async () => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true
      try {
        await recoverEmergencySave()
        let syncResult: Awaited<ReturnType<typeof fullSync>> | null = null
        if (navigator.onLine) {
          try {
            syncResult = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
            setConflicts(syncResult.conflicts)
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
        await applySearchIndexUpdate(syncResult?.updatedNotes ?? null)
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

  // 保存すべき未保存の変更があるかどうかを判定し、あればそのノートを返す。
  // 自動保存系のすべてのトリガー(インターバル・visibilitychange・pagehide等)から
  // 共通で使う判定ロジック。
  const getPendingSaveNote = (): StoredNote | null => {
    const note = activeNoteRef.current
    if (!note) return null
    if (note.body === lastSavedBodyRef.current) return null
    if (shouldDiscardDraft(note.body) && !notesRef.current.some((n) => n.id === note.id)) {
      return null
    }
    return note
  }

  const autoSaveActiveNote = async () => {
    const note = getPendingSaveNote()
    if (!note) return
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

    // タブクローズ・ページ離脱(モバイル/PC)。非同期のIndexedDB書き込みが完了する前に
    // プロセスごと終了する可能性があるため、保険として同期的なlocalStorage書き込みも
    // あわせて行う(次回起動時にrecoverEmergencySaveで回収する)。
    const handlePageHide = () => {
      const note = getPendingSaveNote()
      if (note) writeEmergencySave({ noteId: note.id, body: note.body, updatedAt: note.updatedAt })
      void autoSaveActiveNote()
    }

    // デスクトップでのタブ閉じ/リロード。理由はhandlePageHideと同じ。
    const handleBeforeUnload = () => {
      const note = getPendingSaveNote()
      if (note) writeEmergencySave({ noteId: note.id, body: note.body, updatedAt: note.updatedAt })
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
    setEditorSearchQuery('')
    setIsLlmOpen(false)
    setIsHistoryOpen(false)
    setEditorPreviewMode('edit')

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
    await loadTrashCount()
  }

  const restoreActiveNote = async () => {
    if (!activeNote) return
    const restored = {
      ...activeNote,
      deleted: false,
      dirty: true,
      updatedAt: new Date().toISOString(),
    }
    await db.notes.put(restored)
    updateSearchIndexForNote(restored)
    await loadTrashCount()

    // 復元したメモの元のフォルダを表示対象にする (元フォルダが消えていれば既存フォルダにフォールバック)
    let targetFolder = restored.folder
    if (!folders.some((f) => f.name === targetFolder) && folders.length > 0) {
      targetFolder = folders[0].name
      restored.folder = targetFolder
      await db.notes.put(restored)
    }
    setSelectedFolder(targetFolder)
    const folderNotes = await db.notes.where('folder').equals(targetFolder).toArray()
    setNotes(folderNotes)
    setActiveNote(restored)
    resetSearch()
    await refreshPendingCount()
  }

  const handleSwipeLeft = () => {
    if (mobileScreen === 'folders') {
      setMobileScreen('notes')
    } else if (mobileScreen === 'notes' && activeNote) {
      setMobileScreen('editor')
    }
  }

  const handleSwipeRight = async () => {
    resetSearch()
    if (mobileScreen === 'editor') {
      await leaveEditor()
      setMobileScreen('notes')
    } else if (mobileScreen === 'notes') {
      setMobileScreen('folders')
    }
  }

  const createNewNote = async () => {
    if (!selectedFolder || isTrashFolder(selectedFolder)) return
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
      // 移動前に同期済みだった場所を記録しておく(=このデバイスが移動の当事者である証拠)。
      // 同期待ちのまま連続で移動された場合は、最初に記録した旧パスを保持し続ける。
      pendingOldPath:
        activeNote.baseSha !== null
          ? { folder: activeNote.folder, sha: activeNote.baseSha }
          : (activeNote.pendingOldPath ?? null),
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

  // メモ一覧の複数選択から呼ばれる一括フォルダ移動。単体移動(moveNoteToFolder)と
  // 同じくbaseSha: null + pendingOldPathの記録で、新パスへの新規作成pushと
  // 旧パスのDELETEを同期時に正しく行わせる。
  const bulkMoveNotes = async (ids: string[], newFolderName: string) => {
    const targets = (await db.notes.bulkGet(ids)).filter(
      (n): n is StoredNote => !!n && n.folder !== newFolderName,
    )
    if (targets.length === 0) return
    const now = new Date().toISOString()
    const moved = targets.map((n) => ({
      ...n,
      folder: newFolderName,
      baseSha: null,
      dirty: true,
      pendingOldPath: n.baseSha !== null ? { folder: n.folder, sha: n.baseSha } : (n.pendingOldPath ?? null),
      updatedAt: now,
    }))
    await db.notes.bulkPut(moved)
    for (const n of moved) updateSearchIndexForNote(n)
    const movedIds = new Set(moved.map((n) => n.id))
    setNotes((prev) => prev.filter((n) => !movedIds.has(n.id)))
    if (activeNote && movedIds.has(activeNote.id)) setActiveNote(null)
    await refreshPendingCount()
  }

  // メモ一覧の複数選択から呼ばれる一括ゴミ箱移動(deletedフラグを立てるだけの
  // 仮想フォルダ方式。deleteActiveNoteと同じ扱い)。
  const bulkDeleteNotes = async (ids: string[]) => {
    const targets = (await db.notes.bulkGet(ids)).filter((n): n is StoredNote => !!n && !n.deleted)
    if (targets.length === 0) return
    const now = new Date().toISOString()
    const deleted = targets.map((n) => ({ ...n, deleted: true, dirty: true, updatedAt: now }))
    await db.notes.bulkPut(deleted)
    for (const n of deleted) updateSearchIndexForNote(n)
    const deletedIds = new Set(deleted.map((n) => n.id))
    setNotes((prev) => prev.filter((n) => !deletedIds.has(n.id)))
    if (activeNote && deletedIds.has(activeNote.id)) setActiveNote(null)
    await refreshPendingCount()
    await loadTrashCount()
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

  const runGlobalSearch = async (query: string) => {
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
    const all = await db.notes.toArray()
    const results = all.filter((n) => !n.deleted && idSet.has(n.id))
    setGlobalSearchResults(results)
    setSearchResultIds(matchedIds)
    setMobileScreen('notes')
  }

  const runFolderSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query) {
      setSearchResultIds(null)
      setGlobalSearchResults(null)
      return
    }
    if (isTrashFolder(selectedFolder ?? '')) {
      const q = query.toLowerCase()
      const matched = notes
        .filter((n) => n.deleted && (n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)))
        .map((n) => n.id)
      setGlobalSearchResults(null)
      setSearchResultIds(matched)
      return
    }
    if (!searchIndexRef.current) {
      setSearchResultIds([])
      setGlobalSearchResults(null)
      return
    }
    const matchedIds = search(searchIndexRef.current, query)
    setGlobalSearchResults(null)
    setSearchResultIds(matchedIds)
  }

  const handlePullToRefresh = async () => {
    setIsSyncing(true)
    try {
      await handleSyncNow()
    } finally {
      setIsSyncing(false)
    }
  }

  const visibleNotes = useMemo(() => {
    if (globalSearchResults !== null) return globalSearchResults
    if (!searchResultIds) return notes
    const idSet = new Set(searchResultIds)
    return notes.filter((n) => idSet.has(n.id))
  }, [notes, searchResultIds, globalSearchResults])


  const availableTags = useMemo(() => {
    const isTrash = isTrashFolder(selectedFolder ?? '')
    const tagSet = new Set<string>()
    for (const n of notes) {
      if (isTrash ? !n.deleted : n.deleted) continue
      for (const t of n.tags) tagSet.add(t)
    }
    return Array.from(tagSet).sort()
  }, [notes, selectedFolder])

  const handleSyncNow = async () => {
    if (!settings || syncInFlightRef.current) return
    syncInFlightRef.current = true
    let result: Awaited<ReturnType<typeof fullSync>> | null = null
    try {
      result = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
      setConflicts(result.conflicts)
      setSyncError(null)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncProgress(null)
      await refreshPendingCount()
      await applySearchIndexUpdate(result?.updatedNotes ?? null)
      await loadTrashCount()
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
      await applySearchIndexUpdate(result.updatedNotes)
    } else {
      setConflicts(conflicts.filter((c) => c.id !== conflict.id))
      updateSearchIndexForNote(choice === 'local' ? { ...conflict.localNote, baseSha: conflict.remoteSha, dirty: true } : { ...conflict.remoteNote, baseSha: conflict.remoteSha, dirty: false })
    }
    await refreshPendingCount()
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
        onBackupRestored={handleBackupRestored}
      />
    )
  }


  return (
    <div className="app">
      <PullToRefresh onRefresh={handlePullToRefresh} isRefreshing={isSyncing} disabled={!online}>
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
        <SwipeContainer
          className={`columns mobile-${mobileScreen}`}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
        >
          <div className="col-folders">
            <div className="column-search-wrap">
              <SearchBar
                key={`folders-${searchResetKey}`}
                value={searchQuery}
                placeholder="全メモを検索"
                onQueryChange={runGlobalSearch}
              />
            </div>
            {folderError && <p className="folder-error">{folderError}</p>}
            <FolderList
              folders={folders}
              selectedName={selectedFolder}
              trashCount={trashCount}
              onSelect={async (name) => {
                await leaveEditor()
                resetSearch()
                setSelectedFolder(name)
                if (isTrashFolder(name)) {
                  setNotes(await db.notes.filter((n) => !!n.deleted).toArray())
                } else {
                  setNotes(await db.notes.where('folder').equals(name).toArray())
                }
                setWordFilter('')
                setTagFilter(null)
                setMobileScreen('notes')
              }}
              onCreate={handleCreateFolder}
              onDelete={handleDeleteFolder}
              onReorder={handleReorderFolders}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />

          </div>

          <div className="col-notes">
            <div className="column-search-wrap">
              <SearchBar
                key={`notes-${searchResetKey}`}
                value={searchQuery}
                placeholder={
                  selectedFolder
                    ? isTrashFolder(selectedFolder)
                      ? 'ゴミ箱内を検索'
                      : `"${selectedFolder}"内を検索`
                    : 'フォルダ内を検索'
                }
                onQueryChange={runFolderSearch}
              />
            </div>
            {!isTrashFolder(selectedFolder ?? '') && (
              <button type="button" className="btn btn-primary new-note-btn" onClick={createNewNote}>
                + 新規作成
              </button>
            )}
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
              isTrash={isTrashFolder(selectedFolder ?? '')}
              folders={folders}
              onBulkMove={bulkMoveNotes}
              onBulkDelete={bulkDeleteNotes}
              onSelect={async (id) => {
                await leaveEditor()
                const n = await db.notes.get(id)
                if (n) {
                  if (!n.deleted && selectedFolder !== n.folder) {
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
                <EditorActionBar
                  onSave={saveActiveNote}
                  currentFolder={activeNote.folder}
                  folders={folders}
                  onMoveFolder={moveNoteToFolder}
                  searchQuery={editorSearchQuery}
                  onSearchChange={setEditorSearchQuery}
                  previewMode={editorPreviewMode}
                  onTogglePreview={() => setEditorPreviewMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
                  llmLinksCount={activeNote.llmLinks.length}
                  isLlmOpen={isLlmOpen}
                  onToggleLlm={() => setIsLlmOpen((o) => !o)}
                  onDelete={deleteActiveNote}
                  isTrashNote={!!activeNote.deleted}
                  onRestore={restoreActiveNote}
                  isHistoryOpen={isHistoryOpen}
                  onToggleHistory={() => setIsHistoryOpen((o) => !o)}
                />

                <Editor
                  body={activeNote.body}
                  onChange={updateBody}
                  highlightQuery={editorSearchQuery || searchQuery}
                  mode={editorPreviewMode}
                  onModeChange={setEditorPreviewMode}
                  hideToolbar
                />
                <LlmLinkPanel
                  body={activeNote.body}
                  links={activeNote.llmLinks}
                  isOpen={isLlmOpen}
                  onClose={() => setIsLlmOpen(false)}
                  onAddLink={(url, memo) => {
                    setActiveNote({
                      ...activeNote,
                      llmLinks: [...activeNote.llmLinks, { url, label: memo, addedAt: new Date().toISOString() }],
                      dirty: true,
                    })
                  }}
                />
                <HistoryPanel
                  isOpen={isHistoryOpen}
                  onClose={() => setIsHistoryOpen(false)}
                  folder={activeNote.folder}
                  noteId={activeNote.id}
                  settings={settings}
                  online={online}
                  onRestoreContent={(restoredBody) => {
                    updateBody(restoredBody)
                  }}
                />
              </>

            )}
          </div>
          {(mobileScreen === 'editor' || mobileScreen === 'notes') && (
            // 本文欄(textarea)やスクロール可能なメモ一覧(overflow-y:auto)は、
            // ブラウザがテキスト選択/縦スクロールのネイティブなジェスチャーだと
            // 先に判定してpointercancelになり、JS側のスワイプ判定が完了しない
            // ことがある。そこで画面の真の端(screen edge)に、それらのコンテンツ
            // より手前(上)に重なる専用の透明な帯を置き、ここから始まるタッチ
            // だけは必ずスワイプとして認識されるようにする(z-indexはアクション
            // バーより低いため、アクションバーのボタン操作は従来通り優先される。
            // フォルダ一覧画面はドラッグハンドル/削除ボタンが画面端にあるため対象外)。
            <>
              <div className="editor-edge-swipe-handle editor-edge-swipe-handle--left" aria-hidden="true" />
              <div className="editor-edge-swipe-handle editor-edge-swipe-handle--right" aria-hidden="true" />
            </>
          )}
        </SwipeContainer>
      </PullToRefresh>
      {isSettingsOpen && (
        <Settings
          initial={settings}
          onSave={(s) => {
            saveGithubSettings(s)
            setSettings(s)
            setIsSettingsOpen(false)
          }}
          onClose={() => setIsSettingsOpen(false)}
          onBackupRestored={handleBackupRestored}
        />
      )}
    </div>
  )
}
