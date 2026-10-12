import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type StoredNote, type StoredFolder } from './lib/db'
import { createDraftNote, shouldDiscardDraft } from './lib/draftNote'
import { getGithubSettings, saveGithubSettings, type GithubSettings } from './lib/githubSettings'
import { buildIndex, search } from './lib/search'
import { fullSync } from './lib/fullSync'
import * as githubClient from './lib/github'
import type { ConflictItem } from './lib/sync'
import { FolderList } from './components/FolderList'
import { NoteList } from './components/NoteList'
import { Editor } from './components/Editor'
import { SearchBar } from './components/SearchBar'
import { LlmLinkPanel } from './components/LlmLinkPanel'
import { SyncStatusBadge } from './components/SyncStatusBadge'
import { ConflictResolver } from './components/ConflictResolver'
import { Settings } from './components/Settings'
import './App.css'

type MobileScreen = 'folders' | 'notes' | 'editor'

export default function App() {
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
  const [, setSearchQuery] = useState('')
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const syncInFlightRef = useRef(false)

  useEffect(() => {
    const s = getGithubSettings()
    setSettings(s)
    setSettingsLoaded(true)
  }, [])

  const refreshPendingCount = async () => {
    const all = await db.notes.toArray()
    setPendingCount(all.filter((n) => n.dirty).length)
  }

  const loadFolderAndDraft = async (allFolders: StoredFolder[]) => {
    const lastFolderName = localStorage.getItem('lastFolder')
    const folder = allFolders.find((f) => f.name === lastFolderName) ?? allFolders[0]
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
          const result = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
          setConflicts(result.conflicts)
          setSyncProgress(null)
        }
        const allFolders = await db.folders.toArray()
        setFolders(allFolders)
        await loadFolderAndDraft(allFolders)
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

  const updateBody = (body: string) => {
    if (!activeNote) return
    setActiveNote({ ...activeNote, body, dirty: true, updatedAt: new Date().toISOString() })
  }

  const leaveEditor = async () => {
    if (!activeNote) return
    if (!shouldDiscardDraft(activeNote.body) || notes.some((n) => n.id === activeNote.id)) {
      await db.notes.put(activeNote)
      await refreshPendingCount()
    }
  }

  const deleteActiveNote = async () => {
    if (!activeNote) return
    const deletedNote = { ...activeNote, deleted: true, dirty: true, updatedAt: new Date().toISOString() }
    await db.notes.put(deletedNote)
    setNotes(notes.filter((n) => n.id !== deletedNote.id))
    setActiveNote(null)
    setMobileScreen('notes')
    await refreshPendingCount()
  }

  const runSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query) {
      setSearchResultIds(null)
      return
    }
    const allNotes = await db.notes.toArray()
    const idx = buildIndex(allNotes.filter((n) => !n.deleted).map((n) => ({ id: n.id, title: n.title, body: n.body })))
    setSearchResultIds(search(idx, query))
  }

  const visibleNotes = useMemo(() => {
    if (!searchResultIds) return notes
    const idSet = new Set(searchResultIds)
    return notes.filter((n) => idSet.has(n.id))
  }, [notes, searchResultIds])

  const handleSyncNow = async () => {
    if (!settings || syncInFlightRef.current) return
    syncInFlightRef.current = true
    try {
      const result = await fullSync(settings, githubClient, (done, total) => setSyncProgress({ done, total }))
      setConflicts(result.conflicts)
      setSyncProgress(null)
      await refreshPendingCount()
    } finally {
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
      <SearchBar onQueryChange={runSearch} />
      <SyncStatusBadge online={online} pendingCount={pendingCount} onSyncNow={handleSyncNow} />
      {syncProgress && (
        <p className="sync-progress">
          同期中... {syncProgress.done}/{syncProgress.total}件
        </p>
      )}
      {conflicts.length > 0 && (
        <ConflictResolver
          localBody={conflicts[0].localBody}
          remoteBody={conflicts[0].remoteBody}
          onResolve={(choice) => resolveConflict(conflicts[0], choice)}
        />
      )}
      <div className={`columns mobile-${mobileScreen}`}>
        <div className="col-folders">
          <FolderList
            folders={folders}
            selectedName={selectedFolder}
            onSelect={async (name) => {
              await leaveEditor()
              setSelectedFolder(name)
              setNotes(await db.notes.where('folder').equals(name).toArray())
              setMobileScreen('notes')
            }}
          />
        </div>
        <div className="col-notes">
          <NoteList
            notes={visibleNotes}
            selectedId={activeNote?.id ?? null}
            tagFilter={null}
            onSelect={async (id) => {
              await leaveEditor()
              const n = await db.notes.get(id)
              if (n) setActiveNote(n)
              setMobileScreen('editor')
            }}
          />
        </div>
        <div className="col-editor">
          {activeNote && (
            <>
              <Editor body={activeNote.body} onChange={updateBody} />
              <button type="button" onClick={deleteActiveNote}>
                ゴミ箱に移動
              </button>
              <LlmLinkPanel
                body={activeNote.body}
                links={activeNote.llmLinks}
                onAddLink={(url, label) => {
                  setActiveNote({
                    ...activeNote,
                    llmLinks: [...activeNote.llmLinks, { url, label, addedAt: new Date().toISOString() }],
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
