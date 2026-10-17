import type { ReactElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PreviewErrorBoundary } from './PreviewErrorBoundary'

function Bomb(): ReactElement {
  throw new Error('Test preview error')
}

describe('PreviewErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <PreviewErrorBoundary onFallbackToEdit={vi.fn()}>
        <div>Normal content</div>
      </PreviewErrorBoundary>,
    )
    expect(screen.getByText('Normal content')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws and calls onFallbackToEdit on button click', () => {
    const onFallbackToEdit = vi.fn()
    // React's ErrorBoundary will log to console.error during tests, which is normal for React.
    // Suppress console.error during this test to keep test output clean.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <PreviewErrorBoundary onFallbackToEdit={onFallbackToEdit}>
        <Bomb />
      </PreviewErrorBoundary>,
    )

    expect(screen.getByText(/プレビューを読み込めませんでした/)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: '編集画面に戻る' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onFallbackToEdit).toHaveBeenCalledTimes(1)

    consoleErrorSpy.mockRestore()
  })
})
