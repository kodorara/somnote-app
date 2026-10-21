import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { db, type StoredNote, type StoredFolder } from './lib/db'
import {
  createDraftNote,
  shouldDiscardDraft,
  deriveTitle,
  findFolderTemplate,
  extractTemplateBody,
} from './lib/draftNote'
import { extractTags, toggleTagInBody } from './lib/tags'
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
import { EditorActionBar } from './components/EditorActionBar'

import { SwipeContainer } from './components/SwipeContainer'
import { PullToRefresh } from './components/PullToRefresh'
import { AppLock } from './components/AppLock'

// 設定画面(インポート/エクスポート処理含む)・編集履歴・LLMリンク・衝突解決パネルは
// ボタン操作等があった時しか使わないため、起動時のメインJSに含めず遅延読み込みにする
// (react-markdownと同じ方式。Editor.tsx参照)。
const LlmLinkPanel = lazy(() => import('./components/LlmLinkPanel').then((m) => ({ default: m.LlmLinkPanel })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
const ConflictResolver = lazy(() =>
  import('./components/ConflictResolver').then((m) => ({ default: m.ConflictResolver })),
)
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })))
import { checkPassword, isUnlocked, setUnlocked } from './lib/appLock'
import { writeEmergencySave, readEmergencySave, clearEmergencySave } from './lib/emergencySave'
import type { GestureAxis } from './lib/gestureLock'
import './App.css'

type MobileScreen = 'folders' | 'notes' | 'editor'

// 戻るボタン横取り用に一度にまとめて積むダミー履歴の件数。詳細はApp内の
// popstateハンドラのコメントを参照。
const BACK_GUARD_BUFFER = 20

export default function App() {
  const [unlocked, setUnlockedState] = useState(isUnlocked())
  const [settings, setSettings] = useState<GithubSettings | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const selectedFolderRef = useRef<string | null>(null)
  const updateSelectedFolder = (name: string | null) => {
    selectedFolderRef.current = name
    setSelectedFolder(name)
  }
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [trashCount, setTrashCount] = useState(0)
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const [allTags, setAllTags] = useState<string[]>([])
  const [activeNote, setActiveNote] = useState<StoredNote | null>(null)
  const lastOpenedNoteByFolderRef = useRef<Map<string, string>>(new Map())
  const lastOpenedNoteIdRef = useRef<string | null>(null)
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
  const gestureLockRef = useRef<GestureAxis>('none')

  // 同期の進捗(done/total)はバッチ(12件)ごとに届くため、件数が多いと短時間に
  // 何十回もsetSyncProgressが発火し、その都度App全体が再レンダリングされて
  // スワイプ操作や起動直後の操作感が重くなる。表示上は数値が多少飛んでも
  // 問題ないため、最後の1件(done===total)を除き200ms以上空けてからのみ
  // 実際にstateを更新する。
  const lastSyncProgressAtRef = useRef(0)
  const updateSyncProgress = (done: number, total: number) => {
    const now = Date.now()
    if (done >= total || now - lastSyncProgressAtRef.current >= 200) {
      lastSyncProgressAtRef.current = now
      setSyncProgress({ done, total })
    }
  }

  // ゴミ箱件数・フォルダごとの件数・アプリ全体の既存タグ一覧を1回のtoArray()スキャンでまとめて計算する
  const loadCounts = async () => {
    const all = await db.notes.toArray()
    let trash = 0
    const counts: Record<string, number> = {}
    const globalTagSet = new Set<string>()
    for (const n of all) {
      if (n.deleted) {
        trash++
        continue
      }
      counts[n.folder] = (counts[n.folder] ?? 0) + 1
      for (const t of n.tags ?? extractTags(n.body)) {
        globalTagSet.add(t)
      }
    }
    setTrashCount(trash)
    setFolderCounts(counts)
    setAllTags(Array.from(globalTagSet).sort())
  }

  const handleBackupRestored = async (importedFolderName?: string) => {
    const allFolders = await db.folders.toArray()
    setFolders(allFolders)
    if (importedFolderName) {
      updateSelectedFolder(importedFolderName)
      const folderNotes = await db.notes.where('folder').equals(importedFolderName).toArray()
      setNotes(folderNotes)
      initialDraftBodyRef.current = ''
      setActiveNote(null)
      setWordFilter('')
      setTagFilter(null)
      setMobileScreen('notes')
      if (settings && navigator.onLine) {
        try {
          await pushFolders(settings, githubClient)
        } catch {
          // フォルダ同期失敗時は次回fullSyncで再送される
        }
      }
    } else {
      await openInitialDraft(allFolders)
    }
    await rebuildSearchIndex()
    void loadCounts()
    resetSearch()
    // 設定モーダルはここでは閉じない。復元完了メッセージをユーザーが読めるよう、
    // 「設定を閉じる」で手動で閉じてもらう(自動で閉じると読む間もなく消えてしまう)。
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
  const searchIndexBuildingRef = useRef(false)
  const rebuildSearchIndex = async () => {
    if (searchIndexBuildingRef.current) return
    searchIndexBuildingRef.current = true
    try {
      const all = await db.notes.toArray()
      searchIndexRef.current = await buildIndexAsync(
        all.filter((n) => !n.deleted).map((n) => ({ id: n.id, title: n.title, body: n.body })),
      )
    } finally {
      searchIndexBuildingRef.current = false
    }
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
  // (初回起動)は全件構築が必要だが、これをawaitで待つと編集画面が表示される
  // タイミングまで毎回ブロックしてしまう(起動直後のスワイプ等の操作感が重くなる
  // 主因だった)。バックグラウンドで実行させ、起動そのものはブロックしない。
  const applySearchIndexUpdate = async (
    updatedNotes: StoredNote[] | null,
    permanentlyDeletedIds?: string[],
  ) => {
    if (!searchIndexRef.current) {
      void rebuildSearchIndex()
      return
    }
    if (updatedNotes) {
      for (const n of updatedNotes) updateSearchIndexForNote(n)
    }
    if (permanentlyDeletedIds) {
      for (const id of permanentlyDeletedIds) removeNoteFromIndex(searchIndexRef.current, id)
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



  // 起動時およびバックアップ復元時に、一番上のフォルダを開いて新規下書きをセットする。
  // バックグラウンド同期完了ハンドラからは絶対に呼ばない(ユーザー入力中の下書きを上書きしないため)。
  const initialDraftBodyRef = useRef<string>('')
  const openInitialDraft = async (allFolders: StoredFolder[]) => {
    // 起動時は常に一番上(表示順が最小)のフォルダで新規メモを書き始める。
    // フォルダの並び替え(上下ボタン)で、どのフォルダを起動時の既定にするか選べる。
    const folder = topFolder(allFolders)
    if (!folder) return
    updateSelectedFolder(folder.name)

    const folderNotes = await db.notes.where('folder').equals(folder.name).toArray()
    setNotes(folderNotes)
    await refreshPendingCount()
    void loadCounts()

    const maxSeq = folderNotes.reduce((m, n) => Math.max(m, n.seq), -1)
    const tmpl = findFolderTemplate(folderNotes)
    const tmplBody = tmpl ? extractTemplateBody(tmpl) : ''
    initialDraftBodyRef.current = tmplBody
    const draft = createDraftNote(folder.name, maxSeq, tmplBody)
    setActiveNote(draft)
    setMobileScreen('editor')
  }

  // 同期完了時などに、現在選択中フォルダのメモ一覧だけを再取得する。
  // activeNoteには一切触らないため、編集中メモや下書きの上書き事故が起きない。
  const refreshNotesForSelectedFolder = async () => {
    const current = selectedFolderRef.current
    if (!current) return
    if (isTrashFolder(current)) {
      setNotes(await db.notes.filter((n) => !!n.deleted).toArray())
    } else {
      setNotes(await db.notes.where('folder').equals(current).toArray())
    }
    await refreshPendingCount()
    void loadCounts()
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

    // 1. ローカルデータで即座に画面を表示する(ネットワーク待ちなし)
    const showLocalFirst = async () => {
      const allFolders = await db.folders.toArray()
      setFolders(allFolders)
      await openInitialDraft(allFolders)
    }

    // 2. バックグラウンドで同期し、完了後に一覧と索引だけ差分更新する
    const syncInBackground = async () => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true
      try {
        await recoverEmergencySave()
        let syncResult: Awaited<ReturnType<typeof fullSync>> | null = null
        if (navigator.onLine) {
          try {
            syncResult = await fullSync(settings, githubClient, updateSyncProgress)
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
        await refreshNotesForSelectedFolder()
        await applySearchIndexUpdate(syncResult?.updatedNotes ?? null, syncResult?.permanentlyDeletedIds)
      } finally {
        syncInFlightRef.current = false
      }
    }

    void showLocalFirst().then(() => syncInBackground())

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
    setActiveNote({
      ...activeNote,
      body,
      tags: extractTags(body),
      dirty: true,
      updatedAt: new Date().toISOString(),
    })
  }

  const handleToggleTag = (tag: string) => {
    if (!activeNote) return
    const nextBody = toggleTagInBody(activeNote.body, tag)
    updateBody(nextBody)
  }

  // noteを明示的な引数で受け取る(activeNoteのstate更新は非同期なため、呼び出し直後の
  // 最新値を確実に使うには呼び出し元から渡してもらう方が安全)
  const saveNote = async (note: StoredNote) => {
    // 設計書2.2節: タイトルは保存のたびに本文1行目から自動算出する
    const withTitle = {
      ...note,
      title: deriveTitle(note.body),
      tags: extractTags(note.body),
    }
    await db.notes.put(withTitle)
    lastSavedBodyRef.current = withTitle.body
    if (!withTitle.deleted) {
      lastOpenedNoteByFolderRef.current.set(withTitle.folder, withTitle.id)
      lastOpenedNoteIdRef.current = withTitle.id
    }
    updateSearchIndexForNote(withTitle)
    const existedBefore = notes.some((n) => n.id === withTitle.id)
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === withTitle.id)
      return exists ? prev.map((n) => (n.id === withTitle.id ? withTitle : n)) : [...prev, withTitle]
    })
    if (activeNote?.id === withTitle.id) setActiveNote(withTitle)
    await refreshPendingCount()
    // 既存メモの上書き保存(編集・自動保存)では、フォルダ件数・ゴミ箱件数は変わらない
    // ため、全件(本文含む)を読み出すloadCounts()は不要。新しいタグが増えた場合だけ
    // メモリ上で追記する(タグが0件になった場合の掃除は、次に新規作成・移動・削除等で
    // loadCounts()が走るまで持ち越される=タグ候補が一瞬余分に残るだけの軽微な副作用)。
    // 新規メモの初回保存時はフォルダ件数が変わるため、通常通り全件スキャンする。
    if (existedBefore) {
      const newTags = withTitle.tags.filter((t) => !allTags.includes(t))
      if (newTags.length > 0) {
        setAllTags((prev) => Array.from(new Set([...prev, ...newTags])).sort())
      }
    } else {
      void loadCounts()
    }
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
    if (
      shouldDiscardDraft(note.body, initialDraftBodyRef.current) &&
      !notesRef.current.some((n) => n.id === note.id)
    ) {
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
    const isExisting = notes.some((n) => n.id === activeNote.id)
    if (!shouldDiscardDraft(activeNote.body, initialDraftBodyRef.current) || isExisting) {
      await saveNote(activeNote)
    } else if (selectedFolder) {
      // 未編集の新規下書きを破棄して離脱する際、そのフォルダで直前に開いていた実メモがあれば復元する
      const prevId = lastOpenedNoteByFolderRef.current.get(selectedFolder)
      const prevNote = prevId ? notes.find((n) => n.id === prevId && !n.deleted) : undefined
      if (prevNote) {
        initialDraftBodyRef.current = ''
        setActiveNote(prevNote)
      }
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
    void loadCounts()
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
    void loadCounts()

    // 復元したメモの元のフォルダを表示対象にする (元フォルダが消えていれば既存フォルダにフォールバック)
    let targetFolder = restored.folder
    if (!folders.some((f) => f.name === targetFolder) && folders.length > 0) {
      targetFolder = folders[0].name
      restored.folder = targetFolder
      await db.notes.put(restored)
    }
    updateSelectedFolder(targetFolder)
    const folderNotes = await db.notes.where('folder').equals(targetFolder).toArray()
    setNotes(folderNotes)
    setActiveNote(restored)
    resetSearch()
    await refreshPendingCount()
  }

  const canSwipeLeftNow = mobileScreen === 'folders' || (mobileScreen === 'notes' && !!activeNote)
  const canSwipeRightNow = mobileScreen === 'editor' || mobileScreen === 'notes'

  const handleSwipeLeft = () => {
    if (!canSwipeLeftNow) return
    if (mobileScreen === 'folders') {
      setMobileScreen('notes')
    } else if (mobileScreen === 'notes') {
      setMobileScreen('editor')
    }
  }

  const handleSwipeRight = () => {
    if (!canSwipeRightNow) return
    resetSearch()
    if (mobileScreen === 'editor') {
      void leaveEditor()
      setMobileScreen('notes')
    } else if (mobileScreen === 'notes') {
      setMobileScreen('folders')
    }
  }

  // handleSwipeRightは毎レンダリングで再生成されるため、popstateのuseEffect(マウント時に
  // 1回だけ登録)がそのまま参照すると古いmobileScreen/activeNoteを捉えたクロージャに
  // なってしまう。refを常に最新のhandleSwipeRightへ同期させ、イベントハンドラはref経由で呼ぶ。
  const handleSwipeRightRef = useRef(handleSwipeRight)
  handleSwipeRightRef.current = handleSwipeRight

  // Androidの戻るボタン(ジェスチャー含む)は、履歴が無いと即座にアプリを閉じてしまう
  // (押しミスのたびにアプリが落ちてストレスになる)。履歴にダミーのエントリを積んでおき、
  // 戻るボタンで消費されたらpopstateとして横取りし、スワイプ右(戻る方向:
  // editor→notes→folders)と同じ画面遷移に差し替える。folders画面まで戻った後は
  // handleSwipeRight自身がcanSwipeRightNow=falseで何もしない(画面はfoldersのまま)。
  //
  // 積み直しを1件ずつにすると、実機(特にAndroidのジェスチャー/連打)ではpushStateが
  // ネイティブ側の戻るスタックへ反映されるより先に次の戻る操作が処理され、ダミー
  // エントリが枯渇してアプリが終了してしまう事例が確認された。十分な数(BACK_GUARD_BUFFER)
  // をまとめて積み直すことで、多少の反映遅延や連打があっても枯渇しない余裕を持たせる。
  useEffect(() => {
    const refillBackGuard = () => {
      for (let i = 0; i < BACK_GUARD_BUFFER; i++) {
        window.history.pushState({ somnoteBackGuard: true }, '')
      }
    }
    refillBackGuard()
    const handlePopState = () => {
      refillBackGuard()
      handleSwipeRightRef.current()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const createNewNote = async () => {
    if (!selectedFolder || isTrashFolder(selectedFolder)) return
    await leaveEditor()
    resetSearch()
    const maxSeq = notes.reduce((m, n) => Math.max(m, n.seq), -1)
    const tmpl = findFolderTemplate(notes)
    const tmplBody = tmpl ? extractTemplateBody(tmpl) : ''
    initialDraftBodyRef.current = tmplBody
    const draft = createDraftNote(selectedFolder, maxSeq, tmplBody)
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
    void loadCounts()
  }

  // 単体の完全削除(エディタでゴミ箱内メモを開いている時)
  const permanentlyDeleteActiveNote = async () => {
    if (!activeNote) return
    if (!window.confirm('このメモを完全に削除しますか？この操作は取り消せません。')) return

    if (activeNote.baseSha === null) {
      // リモートに一度も同期していない→即座にローカルから消すだけでよい
      await db.notes.delete(activeNote.id)
    } else {
      await db.notes.put({
        ...activeNote,
        pendingPermanentDelete: true,
        dirty: true,
        updatedAt: new Date().toISOString(),
      })
    }
    if (searchIndexRef.current) removeNoteFromIndex(searchIndexRef.current, activeNote.id)
    setNotes(notes.filter((n) => n.id !== activeNote.id))
    setActiveNote(null)
    setMobileScreen('notes')
    void loadCounts()
    await refreshPendingCount()
    if (navigator.onLine) void handleSyncNow()
  }

  // 複数選択からの一括完全削除(ゴミ箱のメモ一覧で長押し複数選択時)
  const bulkPermanentlyDeleteNotes = async (ids: string[]) => {
    if (!window.confirm(`選択した${ids.length}件のメモを完全に削除しますか？この操作は取り消せません。`)) return
    const targets = (await db.notes.bulkGet(ids)).filter((n): n is StoredNote => !!n)
    const now = new Date().toISOString()
    const toDeleteLocally = targets.filter((n) => n.baseSha === null).map((n) => n.id)
    const toQueue = targets.filter((n) => n.baseSha !== null)
    if (toDeleteLocally.length > 0) await db.notes.bulkDelete(toDeleteLocally)
    if (toQueue.length > 0) {
      await db.notes.bulkPut(toQueue.map((n) => ({ ...n, pendingPermanentDelete: true, dirty: true, updatedAt: now })))
    }
    if (searchIndexRef.current) {
      for (const id of ids) removeNoteFromIndex(searchIndexRef.current, id)
    }
    const idSet = new Set(ids)
    setNotes((prev) => prev.filter((n) => !idSet.has(n.id)))
    void loadCounts()
    await refreshPendingCount()
    if (navigator.onLine) void handleSyncNow()
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

  const handleBulkDeleteFolders = async (targetFolders: StoredFolder[]) => {
    if (targetFolders.length === 0) return
    setFolderError(null)
    const folderNameSet = new Set(targetFolders.map((f) => f.name))
    const folderIdSet = new Set(targetFolders.map((f) => f.folderId))

    const allNotes = await db.notes.toArray()
    const activeNoteIds = allNotes
      .filter((n) => !n.deleted && folderNameSet.has(n.folder ?? ''))
      .map((n) => n.id)

    if (activeNoteIds.length > 0) {
      const warningMsg =
        targetFolders.length === 1
          ? `「${targetFolders[0].name}」を削除しますか？含まれる${activeNoteIds.length}件のメモはゴミ箱に移動されます。`
          : `選択した${targetFolders.length}件のフォルダを削除しますか？含まれる${activeNoteIds.length}件のメモはゴミ箱に移動されます。`
      const confirmed = window.confirm(warningMsg)
      if (!confirmed) return
    }

    resetSearch()
    if (activeNoteIds.length > 0) {
      await bulkDeleteNotes(activeNoteIds)
    }
    try {
      for (const folder of targetFolders) {
        await deleteFolder(folder)
      }
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : String(err))
      return
    }
    const remaining = folders.filter((f) => !folderIdSet.has(f.folderId))
    setFolders(remaining)
    if (selectedFolder && folderNameSet.has(selectedFolder)) {
      const next = remaining[0]
      if (next) {
        updateSelectedFolder(next.name)
        setNotes(await db.notes.where('folder').equals(next.name).toArray())
      } else {
        updateSelectedFolder(null)
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

  const handleDeleteFolder = async (folder: StoredFolder) => {
    await handleBulkDeleteFolders([folder])
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
      result = await fullSync(settings, githubClient, updateSyncProgress)
      setConflicts(result.conflicts)
      setSyncError(null)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncProgress(null)
      await refreshPendingCount()
      await applySearchIndexUpdate(result?.updatedNotes ?? null, result?.permanentlyDeletedIds)
      await refreshNotesForSelectedFolder()
      void loadCounts()
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
      <Suspense fallback={null}>
        <Settings
          initial={null}
          onSave={(s) => {
            saveGithubSettings(s)
            setSettings(s)
          }}
          onBackupRestored={handleBackupRestored}
        />
      </Suspense>
    )
  }


  return (
    <div className="app">
      <PullToRefresh
        onRefresh={handlePullToRefresh}
        isRefreshing={isSyncing}
        disabled={!online}
        gestureLockRef={gestureLockRef}
      >
        {syncProgress && (
          <p className="sync-progress">
            同期中... {syncProgress.done}/{syncProgress.total}件
          </p>
        )}
        {syncError && <p className="sync-error">同期エラー: {syncError}(ここまでの分は保存済みです)</p>}
        {conflicts.length > 0 && (
          <Suspense fallback={null}>
            <ConflictResolver
              localBody={conflicts[0].localBody}
              remoteBody={conflicts[0].remoteBody}
              onResolve={(choice) => resolveConflict(conflicts[0], choice)}
            />
          </Suspense>
        )}
        <SwipeContainer
          className={`columns mobile-${mobileScreen}`}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          canSwipeLeft={canSwipeLeftNow}
          canSwipeRight={canSwipeRightNow}
          gestureLockRef={gestureLockRef}
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
              noteCounts={folderCounts}
              onSelect={async (name) => {
                await leaveEditor()
                resetSearch()
                updateSelectedFolder(name)
                if (isTrashFolder(name)) {
                  setNotes(await db.notes.filter((n) => !!n.deleted).toArray())
                  initialDraftBodyRef.current = ''
                  setActiveNote(null)
                } else {
                  const nextNotes = await db.notes.where('folder').equals(name).toArray()
                  setNotes(nextNotes)
                  const prevId = lastOpenedNoteByFolderRef.current.get(name)
                  const prevNote = prevId ? nextNotes.find((n) => n.id === prevId && !n.deleted) : undefined
                  initialDraftBodyRef.current = ''
                  setActiveNote(prevNote ?? null)
                }
                setWordFilter('')
                setTagFilter(null)
                setMobileScreen('notes')
              }}
              onCreate={handleCreateFolder}
              onDelete={handleDeleteFolder}
              onBulkDelete={handleBulkDeleteFolders}
              onReorder={handleReorderFolders}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onSync={handlePullToRefresh}
              isSyncing={isSyncing}
              online={online}
              gestureLockRef={gestureLockRef}
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
              onBulkPermanentDelete={bulkPermanentlyDeleteNotes}
              gestureLockRef={gestureLockRef}
              onSelect={async (id) => {
                await leaveEditor()
                const n = await db.notes.get(id)
                if (n) {
                  if (!n.deleted && selectedFolder !== n.folder) {
                    updateSelectedFolder(n.folder)
                    setNotes(await db.notes.where('folder').equals(n.folder).toArray())
                  }
                  if (!n.deleted) {
                    lastOpenedNoteByFolderRef.current.set(n.folder, n.id)
                    lastOpenedNoteIdRef.current = n.id
                  }
                  initialDraftBodyRef.current = ''
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
                  onPermanentDelete={permanentlyDeleteActiveNote}
                  isHistoryOpen={isHistoryOpen}
                  onToggleHistory={() => setIsHistoryOpen((o) => !o)}
                  availableTags={allTags}
                  activeTags={activeNote.tags}
                  onToggleTag={handleToggleTag}
                />

                <Editor
                  body={activeNote.body}
                  onChange={updateBody}
                  highlightQuery={editorSearchQuery || searchQuery}
                  mode={editorPreviewMode}
                  onModeChange={setEditorPreviewMode}
                  hideToolbar
                />
                <Suspense fallback={null}>
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
                </Suspense>
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
        <Suspense fallback={null}>
          <Settings
            initial={settings}
            folders={folders}
            onSave={(s) => {
              saveGithubSettings(s)
              setSettings(s)
              setIsSettingsOpen(false)
            }}
            onClose={() => setIsSettingsOpen(false)}
            onBackupRestored={handleBackupRestored}
          />
        </Suspense>
      )}
    </div>
  )
}
