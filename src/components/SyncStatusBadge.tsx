interface Props {
  online: boolean
  pendingCount: number
  onSyncNow: () => void
}

export function SyncStatusBadge({ online, pendingCount, onSyncNow }: Props) {
  return (
    <div className="sync-status-badge">
      <span>{online ? 'オンライン' : 'オフライン'}</span>
      {pendingCount > 0 && <span>未同期 {pendingCount}件</span>}
      <button type="button" onClick={onSyncNow}>
        今すぐ同期
      </button>
    </div>
  )
}
