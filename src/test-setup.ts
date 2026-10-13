import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { configure } from '@testing-library/dom'

afterEach(() => {
  cleanup()
})

// デフォルトの1000msだと、全テストスイートを並列実行してCPU負荷が高い時に
// IndexedDB(fake-indexeddb)を介した非同期チェーン(leaveEditor→saveNote→
// refreshPendingCountなど複数回のawait)がまれに間に合わずflakyになることがあった。
// 実際のバグでなくタイミングの余裕不足だったため、待機上限を緩和する。
configure({ asyncUtilTimeout: 3000 })
