interface Props {
  localBody: string
  remoteBody: string
  onResolve: (choice: 'local' | 'remote') => void
}

export function ConflictResolver({ localBody, remoteBody, onResolve }: Props) {
  return (
    <div className="conflict-resolver" role="dialog">
      <p>同じメモが別デバイスでも編集されています。どちらを残しますか？</p>
      <div className="split">
        <div>
          <h4>ローカル版</h4>
          <p>{localBody}</p>
          <button type="button" onClick={() => onResolve('local')}>
            ローカル版を残す
          </button>
        </div>
        <div>
          <h4>リモート版</h4>
          <p>{remoteBody}</p>
          <button type="button" onClick={() => onResolve('remote')}>
            リモート版を残す
          </button>
        </div>
      </div>
    </div>
  )
}
