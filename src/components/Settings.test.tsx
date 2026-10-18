import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Settings } from './Settings'
import * as backupLib from '../lib/backup'
import * as fsAccess from '../lib/fileSystemAccess'

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker
  vi.restoreAllMocks()
})

describe('Settings', () => {
  it('calls onSave with the entered token/owner/repo', () => {
    const onSave = vi.fn()
    render(<Settings initial={null} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Personal Access Token'), { target: { value: 'ghp_xxx' } })
    fireEvent.change(screen.getByLabelText('GitHubユーザー名'), { target: { value: 'uranari' } })
    fireEvent.change(screen.getByLabelText('データリポジトリ名'), { target: { value: 'somnote-data' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledWith({ token: 'ghp_xxx', owner: 'uranari', repo: 'somnote-data' })
  })

  it('handles backup export on button click', async () => {
    const createBackupSpy = vi.spyOn(backupLib, 'createBackupData').mockResolvedValue({
      version: 1,
      exportedAt: '2026-10-15T12:00:00Z',
      folders: [],
      notes: [],
    })
    const downloadSpy = vi.spyOn(backupLib, 'downloadBackupJson').mockImplementation(() => {})

    render(<Settings initial={null} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'バックアップを書き出す (JSON)' }))

    await waitFor(() => {
      expect(createBackupSpy).toHaveBeenCalledTimes(1)
      expect(downloadSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/バックアップを書き出しました/)).toBeInTheDocument()
    })
  })

  it('handles backup import from file selection', async () => {
    const validData: backupLib.BackupData = {
      version: 1,
      exportedAt: '2026-10-15T12:00:00Z',
      folders: [{ folderId: 'f1', name: '仕事', color: '#f00', seq: 0 }],
      notes: [{ id: 'n1', title: 'T', folder: '仕事', seq: 0, tags: [], createdAt: '', updatedAt: '', deleted: false, llmLinks: [], body: 'B', baseSha: null, dirty: false }],
    }

    vi.spyOn(backupLib, 'validateBackupData').mockReturnValue(validData)
    const importSpy = vi.spyOn(backupLib, 'importBackupData').mockResolvedValue({ folderCount: 1, noteCount: 1 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onBackupRestored = vi.fn()

    render(<Settings initial={null} onSave={vi.fn()} onBackupRestored={onBackupRestored} />)

    const file = new File([JSON.stringify(validData)], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText('バックアップファイルを選択')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(validData)
      expect(onBackupRestored).toHaveBeenCalledTimes(1)
      expect(onBackupRestored).toHaveBeenCalledWith()
      expect(screen.getByText(/復元完了: フォルダ1件、メモ1件を読み込みました/)).toBeInTheDocument()
    })
  })

  it('renders modal overlay and calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Settings initial={null} onSave={vi.fn()} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '設定' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '設定を閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('exports selected folder in text format and shows unsupported destination message when File System Access API is absent', async () => {
    const folders = [
      { folderId: 'f1', name: '仕事', color: '#f00', seq: 0 },
      { folderId: 'f2', name: '趣味', color: '#0f0', seq: 1 },
    ]
    const createBackupSpy = vi.spyOn(backupLib, 'createBackupData').mockResolvedValue({
      version: 1,
      exportedAt: '2026-10-18T12:00:00Z',
      folders: [folders[0]],
      notes: [],
    })
    const downloadTextSpy = vi.spyOn(backupLib, 'downloadTextFile').mockImplementation(() => {})

    render(<Settings initial={null} onSave={vi.fn()} folders={folders} />)

    expect(screen.queryByLabelText('デフォルトの出力先フォルダ')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存先フォルダを選択' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/お使いのブラウザでは保存先フォルダを指定できないため、ブラウザの既定のダウンロード先に保存されます/),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('対象範囲'), { target: { value: '仕事' } })
    fireEvent.click(screen.getByRole('button', { name: 'テキスト形式で書き出す (.txt)' }))

    await waitFor(() => {
      expect(createBackupSpy).toHaveBeenCalledWith('仕事')
      expect(downloadTextSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/フォルダ「仕事」をテキスト形式で書き出しました/)).toBeInTheDocument()
    })
  })

  it('picks an export directory, writes exported files directly to it, and clears it on clicking 解除 when File System Access API is supported', async () => {
    ;(window as unknown as Record<string, unknown>).showDirectoryPicker = vi.fn()
    const mockDirHandle = { kind: 'directory', name: 'SomnoteExports' } as unknown as fsAccess.DirectoryHandleWithPermission
    vi.spyOn(fsAccess, 'getSavedExportDirectory').mockResolvedValue(null)
    const pickSpy = vi.spyOn(fsAccess, 'pickExportDirectory').mockResolvedValue(mockDirHandle)
    const clearSpy = vi.spyOn(fsAccess, 'clearSavedExportDirectory').mockResolvedValue(undefined)
    const writeSpy = vi.spyOn(fsAccess, 'writeFileToDirectory').mockResolvedValue(undefined)
    vi.spyOn(backupLib, 'createBackupData').mockResolvedValue({
      version: 1,
      exportedAt: '2026-10-18T12:00:00Z',
      folders: [],
      notes: [],
    })

    render(<Settings initial={null} onSave={vi.fn()} />)

    const pickBtn = screen.getByRole('button', { name: '保存先フォルダを選択' })
    expect(pickBtn).toBeInTheDocument()
    fireEvent.click(pickBtn)

    await waitFor(() => {
      expect(pickSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByText('選択中: SomnoteExports')).toBeInTheDocument()
    })

    // 保存先が選択された状態でJSON書き出しを押すと writeFileToDirectory が呼ばれる
    vi.spyOn(fsAccess, 'getSavedExportDirectory').mockResolvedValue(mockDirHandle)
    fireEvent.click(screen.getByRole('button', { name: 'バックアップを書き出す (JSON)' }))

    await waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith(mockDirHandle, expect.stringMatching(/^somnote-backup-.*\.json$/), expect.any(String))
    })

    // 解除ボタンを押すと未選択に戻る
    fireEvent.click(screen.getByRole('button', { name: '解除' }))
    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/未選択\(ブラウザの既定のダウンロード先に保存されます\)/)).toBeInTheDocument()
    })
  })

  it('imports pasted text notes (always as text, without JSON paste branch) into the selected folder', async () => {
    const folders = [{ folderId: 'f1', name: '仕事', color: '#f00', seq: 0 }]
    const importTextSpy = vi.spyOn(backupLib, 'importTextNotes').mockResolvedValue({ noteCount: 1 })
    const onBackupRestored = vi.fn()

    render(<Settings initial={null} onSave={vi.fn()} folders={folders} onBackupRestored={onBackupRestored} />)

    fireEvent.change(screen.getByLabelText('対象範囲'), { target: { value: '仕事' } })
    fireEvent.change(screen.getByLabelText('インポートするテキスト'), {
      target: { value: '{"looksLikeJson": true}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '貼り付けた内容を取り込む' }))

    await waitFor(() => {
      expect(importTextSpy).toHaveBeenCalledWith('{"looksLikeJson": true}', '仕事')
      expect(onBackupRestored).toHaveBeenCalledTimes(1)
      expect(onBackupRestored).toHaveBeenCalledWith('仕事')
      expect(screen.getByText(/フォルダ「仕事」にメモ1件を追加しました/)).toBeInTheDocument()
    })
  })
})

