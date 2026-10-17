import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onFallbackToEdit: () => void
}

interface State {
  hasError: boolean
}

export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="preview-error">
          <p>プレビューを読み込めませんでした(オフライン、または更新直後の可能性があります)。</p>
          <button type="button" className="btn btn-ghost" onClick={this.props.onFallbackToEdit}>
            編集画面に戻る
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
