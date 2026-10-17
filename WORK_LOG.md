# 作業記録(〜2026-10-17)

このファイルは、somnote-appで行ってきた作業の時系列記録です。次のスレッド/別の実装者が
引き継ぐ際、ここまでの経緯を素早く把握するために使ってください。

**関連ドキュメント:**
- 実装計画(7フェーズの元計画、2026-10-15策定): `../docs/superpowers/plans/2026-10-15-somnote-app-ux-overhaul.md`
- 環境・既知の罠・作業手順: `./HANDOVER.md`(本ファイルと同じディレクトリ)

**現在の状態:** 新計画書（`../docs/superpowers/plans/2026-10-17-mobile-pwa-feedback-fixes.md`）のフェーズ1（フォルダ削除待ち時間1秒化）およびフェーズ2（ゴミ箱・メモ一覧で2件目以降タップ選択化）の実装・テストが完了。テスト全271件通過。ビルド正常。フェーズ2のコミット・プッシュ・本番デプロイ検証を実施予定。

---

## 1. 元計画(7フェーズ)の実装 — Antigravity担当

2026-10-15策定の計画書に基づき、以下7フェーズすべてが実装・デプロイ済み:

1. 緊急バグ修正(検索フリーズ、フォルダ移動時の表示崩れ)
2. オートセーブ・離脱時保存(30秒間隔 + visibilitychange/pagehide/beforeunload)
3. 検索UI刷新(スコープ別検索・可変サイズ・ハイライト)
4. ナビゲーション・アクションバー刷新(スワイプ遷移・プルトゥリフレッシュ・固定アクションバー)
5. ゴミ箱の仮想フォルダ表示・復元機能
6. 編集履歴・巻き戻し(GitHubコミット履歴ベース)
7. バックアップのエクスポート/インポート(JSON)

この時点でユニットテスト200件全通過、実機確認も一通り完了という報告を受け、
Claude Codeでレビューを実施(下記2.)。

## 2. レビューで見つかった4件の懸念とその後の対応

Antigravityからの引き継ぎレビュー依頼に対し、4つの懸念を検証:

| # | 懸念 | 判定 | 対応 |
|---|---|---|---|
| 1 | フォルダ移動時の旧パス削除が多端末間で競合 | **重大バグとして確認** | 修正済み(下記3.) |
| 2 | pagehide/beforeunloadでの非同期書き込みの取りこぼし | 妥当な懸念 | 修正済み(下記4.) |
| 3 | スワイプと横スクロール要素の干渉 | 妥当な懸念(潜在) | 修正済み(下記4.) |
| 4 | バックアップ復元後のbaseSha整合性 | 問題なし | 対応不要と判断(既存の衝突解決で安全) |

## 3. 多端末間のデータ消失バグ修正(最優先で対応)

**症状:** 端末Aがメモをフォルダ移動して旧パスを削除した直後、その移動をまだ知らない
端末Bが同期すると、端末Bは「新パス(=端末Aが今まさに作った正しいファイル)」を
「自分のfolder値と食い違う旧パス」と誤認し、削除してしまう経路が存在した。

**修正:** `StoredNote`に`pendingOldPath`(移動前に同期済みだった場所)を追加し、
「このデバイス自身が移動の当事者である」ことの証拠として使うようにした。
これが無い食い違いは削除ではなくpull(新しい内容の取り込み)として扱う。

## 4. ユーザー運用開始後に見つかった不具合の修正

実機での日常使用を通じて、以下を順に発見・修正:

- **検索窓を使うとフリーズ**(原因: 1キー入力ごとに全5,386件で検索索引を再構築) →
  差分更新方式に変更
- **フォルダ移動でメモが一部しか表示されない**(原因: 検索結果の絞り込みが残存) →
  画面遷移時に確実にリセット
- **PWAのアイコンパスが絶対パスで404**(GitHub Pagesのサブパス配下のため) → 相対パスに修正
- **新規メモpush後に422エラーが再発し続ける**(モバイル回線瞬断でレスポンスだけ消失) →
  現在のリモートshaを取得して1回だけ自己修復リトライ
- **スワイプで画面遷移できない(複数回・複数箇所)**:
  - 原因1: メモ編集画面の本文欄(textarea)がテキスト選択保護のためスワイプ対象外で、
    かつ画面のほぼ全体を占めていたため掴む場所が無かった → 画面端専用の透明な
    エッジスワイプ帯(`.editor-edge-swipe-handle`)を追加
  - 原因2: メモ一覧もスクロール領域のため同様の問題があった → 同じ仕組みをメモ一覧
    画面にも適用
  - 原因3: Android Chromeが画面端からの横スワイプを「ブラウザの戻る/進む」ジェスチャー
    と誤認し、アプリ自身のスワイプと競合 → `overscroll-behavior`を無効化
- **プルで同期の際、上部に不審な白い表示が見える**: 同じ理由(縦方向のネイティブな
  「引っ張って更新」とアプリ独自の実装が競合) → `overscroll-behavior`を縦方向も無効化
- **全体的に動作が重い(起動・スワイプ)**: 根本原因は、検索索引の全件構築が
  (1)同期のたびに毎回full rebuildしていた、(2)起動時はそれを`await`していたため
  編集画面の表示自体をブロックしていた、の2点。(1)は差分更新に、(2)は
  バックグラウンド実行(非ブロッキング)に変更。あわせてチャンクサイズを縮小し、
  バックグラウンド中の1回あたりの占有時間も短くした。

## 5. 機能追加

- **フォルダ並び替えのドラッグ操作化**、起動時は一番上のフォルダで新規メモ、
  メモ一覧への作成日・編集日表示、LLM連携パネルのトグル化
- **メモ一覧での長押し複数選択**: 長押し(500ms)で複数選択モードに入り、
  タップで選択/解除をトグル。選択中は一括「フォルダへ移動」「ゴミ箱へ移動」が可能。
  スクロール操作とは閾値判定で区別。
- **フォルダ選択UIの並び順統一**: フォルダ一覧画面・メモ編集画面のフォルダ移動
  セレクト・一括移動セレクトのすべてで、`sortedBySeq()`という共通関数を使い、
  同じ並び順になるよう統一(以前はpropsの配列順のままでずれていた)
- **フォルダごとのメモ件数の小さな表示**(0件は非表示)

## 6. 既知の残課題・対応不要と判断した事項

- バックアップ復元後に多数のメモが衝突した場合、`ConflictResolver`が1件ずつしか
  解決できない(データ消失ではなくUXの手間の問題)。優先度低、未対応。
- `handleSwipeRight`はエディタ離脱時の保存(`leaveEditor`)をfire-and-forgetで実行する
  (下記10節B-2参照)。スワイプ直後に別のノート/フォルダをすぐタップすると、そのタップ
  ハンドラ自身の`await leaveEditor()`と同じノートへの保存が重複する可能性があるが、
  同一スナップショットの冗長な書き込みに留まりデータ損失は起きないため許容する。
- 緊急退避(`emergencySave.ts`)は、一度もIndexedDBに保存されたことのない新規下書きが
  即終了した場合は復元できない(フォルダ等の情報が無いため)。残余リスクとして許容。
- OSによるプロセス強制終了・バッテリー切れ等、JSが一切実行されない瞬間の
  データ消失は原理的に防げない(30秒オートセーブ+各種離脱フックで被害を最小化するのみ)。
- 「起動・スワイプが重い」は2026-10-17時点の修正で主要因(検索索引の全件同期構築)に
  対処済みだが、ユーザー実機での最終確認はまだ。もし改善が不十分な場合は、
  追加の計測(索引構築以外のボトルネックの有無)から再開する。

## 7. 作業の進め方(次のスレッドへの申し送り)

このセッションでは一貫して、各修正ごとに以下のサイクルを徹底してきた:
`実装 → テスト追加/更新 → npx vitest run(全件グリーン確認、既知flakyテスト1件は
単体再実行で確認) → npm run build → git commit → git push → gh run watch で
デプロイ完了確認 → 可能な場合はライブ確認 → ユーザーに日本語で簡潔に報告`。

詳細な環境情報・既知の罠は`HANDOVER.md`を参照。新しいスレッドでも同じサイクルを
踏襲することを推奨する。

---

## 8. 起動・スワイプ最適化計画(2026-10-17〜)の実装記録

### フェーズ1: 起動時に同期完了を待たずにローカルデータを即表示する(完了)
- **課題:** 起動時の`doSync`で`fullSync`完了まで画面描画がブロックされ、低速回線や不安定な環境で起動待機時間が延びていた。また、同期完了後に`activeNote`が空下書きで上書きされてしまうと、先行表示された下書きにユーザーが入力した内容が消える危険があった。
- **対応:**
  - `src/App.tsx`:
    - `loadFolderAndDraft` を `openInitialDraft`（起動時/復元時のみ呼び出し、下書き生成・エディタ遷移を行う）と `refreshNotesForSelectedFolder`（選択中フォルダのメモ一覧のみ再取得、`activeNote`は不変）に責務分割。
    - `selectedFolderRef` を導入し、バックグラウンド同期完了時にも最新の選択中フォルダを安全に参照できるように対応。
    - 起動時の `useEffect` で `showLocalFirst`（ローカルIndexedDBから即座にフォルダ・下書き表示）を呼び、その直後に `syncInBackground` を非同期実行して完了後に差分更新（一覧・検索索引）を行う設計へ移行。
  - テスト拡充 (`src/App.test.tsx`):
    - `fullSync`（`getTree`）がpendingのままでもエディタ（下書き）が表示されることの検証テストを追加。
    - 起動直後にユーザーが下書きに入力した内容が、バックグラウンド同期完了後も上書きされず維持されることの回帰テストを追加。
    - pull-to-refresh テストで起動時バックグラウンド同期の完了待ちタイミングを調整。
  - テスト 239/239 全通過、ビルド成功、コミット（`434b7e9`）、GitHub Actions デプロイ完了（Run `38930094822`）、本番ライブ確認（初期化・クリーンアップ含む）完了。

### フェーズ2: スワイプを「指に追従」させる(完了)
- **課題:** `pointerdown` と `pointerup` の2点間の移動距離のみで判定しており、ドラッグ中は画面が動かず、指を離した瞬間に一気に0.2秒のアニメーションで動いていたため、操作にワンテンポ遅れる重い印象を与えていた。
- **対応:**
  - `src/components/SwipeContainer.tsx`:
    - `pointermove` ハンドラを追加し、ドラッグ中に親要素（`.columns`）のCSS変数 `--drag-offset` をリアルタイム更新。
    - ドラッグ開始時に `.is-dragging` クラスを付与し、ドラッグ終了時（`pointerup`/`pointercancel`）にオフセットを `0px` に戻してクラスを解除。
    - 縦スクロール判定（`Math.abs(deltaY) > Math.abs(rawDeltaX)`）時にドラッグをキャンセルして `0px` にリセット。
    - 画面遷移先が存在しない境界方向（フォルダ画面での右ドラッグ、エディタ画面での左ドラッグ等）へのドラッグ量を `0.2` 倍に減衰（ラバーバンド抵抗）させて余白露出を防止。
    - ポインタがコンテナ外へ外れても追従を維持できるよう Pointer Capture（`setPointerCapture`/`releasePointerCapture`）を導入。
  - `src/App.css`:
    - `.columns.is-dragging .col-folders, .col-notes, .col-editor` に `transition: none` を適用。
    - 各カラムの `translateX` に `var(--drag-offset, 0px)` を組み込み、中央カラムと隣接カラムが一体で指に追従するようスタイルを更新。
  - `src/App.tsx`:
    - 現在の画面状態（`mobileScreen`）および `activeNote` の有無に応じた `canSwipeLeft`/`canSwipeRight` を `SwipeContainer` に伝達。
  - テスト拡充 (`src/components/SwipeContainer.test.tsx`):
    - `pointermove` 中の `--drag-offset` 更新および `.is-dragging` クラス付与・解除テスト。
    - 縦スクロール優勢時の追従停止とオフセットリセットテスト。
    - `pointercancel` 時のオフセット初期化テスト。
    - 境界外ドラッグ時の減衰（0.2倍）テスト。
  - テスト 243/243 全通過、ビルド成功、コミット（`497721f`）、GitHub Actions デプロイ完了（Run `38931631088`）、本番ライブ確認完了。

### フェーズ3: react-markdownの遅延ロード(完了)
- **課題:** `Editor.tsx` で `react-markdown` を静的importしていたため、プレビュー機能を使わない場合でも初期JSバンドル（約595kB）に含まれ、解析・評価コストが初期ロードを遅延させていた（Viteの500kBチャンクサイズ警告も発生）。
- **対応:**
  - `src/components/Editor.tsx`:
    - `react-markdown` を `React.lazy(() => import('react-markdown'))` による動的インポートに変更。
    - プレビュー表示部分を `<Suspense fallback={null}>` でラップ。
  - テスト更新 (`src/components/Editor.test.tsx`, `src/App.test.tsx`):
    - `lazy` による動的インポートが非同期に解決されるため、Markdownプレビュー表示の検証アサーションを `findBy*` および `waitFor` に更新。
  - 結果:
    - メインJSチャンクが 595kB → 478.36kB に縮小（500kB警告解消）。
    - `react-markdown`（約117kB）がプレビュー切り替え時のみ読み込まれる別チャンクに分離。
    - テスト 243/243 全通過、ビルド成功、コミット（`5da1e5d`）、GitHub Actions デプロイ完了（Run `38932472066`）。

### フェーズ4: 細部の軽量化(完了)
- **対応:**
  - `src/App.css`:
    - モバイル表示時の各カラム要素（`.col-folders, .col-notes, .col-editor`）に `will-change: transform` を追加。一部のAndroid Chrome等におけるスワイプ開始時の初回コンポジット処理を軽量化。
  - push並列化の見送り判断:
    - `src/lib/sync.ts` の `runSync` 内でのpush逐次実行は、更新順序の維持および422エラー自己修復リトライの安全性を優先し、計画書の推奨通り「対応不要（見送り）」と判断。

## 9. 起動・スワイプ改善 レビュー指摘修正（2026-10-17）

### フェーズA: 必須修正3件(完了)
- **A-1: スワイプ中の縦スクロール判定時 Pointer Capture 解放**
  - `src/components/SwipeContainer.tsx`: 縦スクロールと判定した時点で `releasePointerCapture` を呼び出し、ポインタがコンテナに拘束され続ける問題を修正。
  - テスト拡充 (`src/components/SwipeContainer.test.tsx`): 縦スクロール判定時に `releasePointerCapture` が呼ばれるテストを追加。
- **A-2: PreviewErrorBoundary の新設と Editor.tsx への組み込み**
  - `src/components/PreviewErrorBoundary.tsx`: `React.lazy` 動的インポート失敗時にアプリ全体が白画面クラッシュするのを防ぐ小さなクラスベースErrorBoundaryを新設（フォールバックUIと編集画面復帰ボタンを提供）。
  - `src/components/Editor.tsx`: `<Suspense>` を `<PreviewErrorBoundary>` でラップ。
  - `src/App.css`: `.preview-error` スタイルを追加。
  - テスト追加 (`src/components/PreviewErrorBoundary.test.tsx`): エラー捕捉と編集画面戻るボタン押下時のコールバック実行を検証。
- **A-3: フォルダ切替直後の selectedFolderRef 競合窓の解消**
  - `src/App.tsx`: `updateSelectedFolder` ヘルパーを新設し、state（`setSelectedFolder`）と `selectedFolderRef.current` を同期的・アトミックに同時更新。全6箇所の直接代入・state更新を統一。
  - テスト追加 (`src/App.test.tsx`): フォルダ選択直後にバックグラウンド同期が完了しても新フォルダのメモ一覧が正しく取得・表示される回帰テストを追加。
- **結果:** テスト 247/247 全通過、ビルド成功。

### フェーズB: 推奨修正4件(完了)
- **B-1: マルチタッチ時にジェスチャー状態が混ざる問題の防止**
  - `src/components/SwipeContainer.tsx`: `activePointerId` によるシングルタッチ制御を導入。最初の指のジェスチャーが完了するまで2本目以降の `pointerdown` を無視し、状態の混濁やオフセットの暴走を防止。
  - テスト追加 (`src/components/SwipeContainer.test.tsx`): 複数指が同時に触れた際に後続の指が無視されるテストを追加。
- **B-2: スワイプ画面遷移時の一瞬の二段アニメーション解消**
  - `src/App.tsx`: `handleSwipeRight` で `await leaveEditor()` によるDB書き込み待ちを行わず、即座に画面遷移（`setMobileScreen('notes')`）を発火させるよう同期化。退避保存は非同期待ちなしでバックグラウンド実行。
  - テスト追加 (`src/App.test.tsx`): `leaveEditor` が未完了でも即座に `mobile-notes` に切り替わるテストを追加。
- **B-3: スワイプ可否判定ロジックの重複解消(DRY化)**
  - `src/App.tsx`: `canSwipeLeftNow` / `canSwipeRightNow` を定義し、`handleSwipeLeft`/`handleSwipeRight` のガードと `SwipeContainer` への props 伝達で同一判定を共有。
  - `src/components/SwipeContainer.tsx`: `resolveCanSwipe()` ヘルパーを新設し、`pointermove` と `pointerup` での `canLeft`/`canRight` 判定を一元化。
- **B-4: will-change: transform のドラッグ中限定化**
  - `src/App.css`: カラム要素の常時適用ルールから `will-change: transform` を削除し、`.columns.is-dragging` スコープ内にのみ適用することで不要な常時GPUメモリ確保を防止。
- **結果:** テスト 249/249 全通過、ビルド成功。

## 10. フェーズA・B修正の副作用に対する後片付け(2026-10-17、Claude Code担当)

フェーズA・Bの修正自体は健全だったが、Claude Codeによる再レビューで4件の軽微な副作用(いずれもブロッカーではない)が見つかり、同セッション内でそのまま後片付けを行った。

- **B-4の巻き戻し:** `will-change: transform`を`.columns.is-dragging`限定にスコープしたところ、タップ操作(`FolderList`/`NoteList`の`onSelect`経由、`.is-dragging`クラスが付かない画面遷移)でコンポジットヒントが一切効かなくなる副作用があった。常時適用に戻す(`.col-folders`等の基本ルールに`will-change: transform`を復帰、`.is-dragging`側からは削除)ことで解消。常時適用によるGPUメモリコストは元々軽微と判断していたため、副作用の解消を優先した。
- **B-1導入によるデッドコードの削除:** `activePointerId`によるシングルタッチガードの導入により、`isExcluded`refとその判定(`handlePointerMove`/`handlePointerUp`内)が実行上到達不可能になっていた(除外対象のポインタは`activePointerId`に設定されないため、ガードで先にreturnする)。`isExcluded`ref自体を削除し、除外時は単純に`return`するだけに整理。
- **A-3導入後の旧実装の残骸削除:** `updateSelectedFolder`ヘルパー導入後も、旧実装の`selectedFolderRef`同期用`useEffect`(`selectedFolderRef.current = selectedFolder`)が削除されずに残っていた。全呼び出し箇所が`updateSelectedFolder`に統一済みであることを確認した上で削除。この`useEffect`を残すと、将来誰かが`setSelectedFolder`を直接呼ぶコードを追加した際に「一見動いているように見える」罠になり、A-3で解消したはずの競合窓が静かに復活しうるため。
- **B-2の残存エッジケースの文書化のみ対応:** スワイプ直後に別ノート/フォルダへすぐ遷移すると`leaveEditor`の保存が重複しうる点は、データ損失を伴わない軽微な冗長書き込みのため、コードの複雑化を避けて上記6節に既知の残課題として記録するのみとした。

テスト249/249全通過・ビルド成功を確認済み。
(その後コミット・デプロイ完了: `25cc56d`)

## 11. ジェスチャー・ゴミ箱・フォルダ改善（2026-10-17）

新計画書（`../docs/superpowers/plans/2026-10-17-gesture-trash-folder-improvements.md`）に基づく実装。

### フェーズ1: スワイプ×プルトゥリフレッシュの排他制御(gestureLockRef設計)(完了)
- **課題:** `SwipeContainer` で `setPointerCapture` を呼んでも DOM バブリングは停止しないため、親要素の `PullToRefresh` にも `pointermove` が到達。斜めスワイプ時に `PullToRefresh` が反応してインジケータが出現し画面が上下に揺れる問題があった。
- **対応:**
  - `src/lib/gestureLock.ts`: `GestureAxis` (`'none' | 'horizontal' | 'vertical'`) および `GestureLockRef` を定義。
  - `src/App.tsx`: 単一の `gestureLockRef = useRef<GestureAxis>('none')` を作成し、`<PullToRefresh>` と `<SwipeContainer>` の両方に渡して共有。
  - `src/components/PullToRefresh.tsx`:
    - `startX` 追跡を追加し、`Math.abs(deltaX) > Math.abs(deltaY)`（横優勢）の時は `setPullDistance(0)` でプル動作を即時抑制。
    - `gestureLockRef.current === 'horizontal'` の場合は処理をスキップ。
    - 縦プル優勢判定時に `gestureLockRef.current = 'vertical'` を獲得し、指離脱時（`pointerup`/`pointercancel`）に `'none'` にリセット。
  - `src/components/SwipeContainer.tsx`:
    - `gestureLockRef.current === 'vertical'` の場合は処理をスキップ。
    - 横ドラッグ確定時に `gestureLockRef.current = 'horizontal'` を獲得し、指離脱時に `'none'` にリセット。
  - テスト拡充:
    - `PullToRefresh.test.tsx`: 横優勢斜めドラッグのプル抑制、`gestureLockRef` による横ロック時のスキップ、縦プル時のロック状態遷移を検証。
    - `SwipeContainer.test.tsx`: 縦ロック時のドラッグ抑制、横ドラッグ時のロック状態遷移を検証。
    - `Editor.test.tsx`: テスト全体並列実行時の高負荷タイムアウトを防ぐため `findByRole` に `timeout: 3000` を付与。
- **結果:** テスト 254/254 全通過、ビルド成功。
(その後コミット・デプロイ完了: `26bd413`)

### フェーズ2: フォルダ削除をゴミ箱移動に変更し、削除UIを長押しに統一(完了)
- **課題:**
  - 以前はメモが残っているフォルダは削除できずエラーになっていた。メモごとゴミ箱へ移動できるようにしたい。
  - フォルダ一覧の「×」削除ボタンを廃止し、メモ一覧と同じ長押し削除に統一したい。
- **対応:**
  - `src/lib/folders.ts`: `deleteFolder` から `count > 0` の例外チェックを削除し、直接 `db.folders.delete` を実行するように簡素化。
  - `src/App.tsx`: `handleDeleteFolder` で対象フォルダ内のアクティブなメモ数を判定。メモがある場合は「含まれるN件のメモはゴミ箱に移動されます」の確認ダイアログを表示し、既存の `bulkDeleteNotes` でゴミ箱へ移動（`deleted: true`）させてからフォルダを削除。空フォルダの場合はメモ警告ダイアログなしで削除。
  - `src/components/FolderList.tsx`:
    - `.folder-delete-btn`（「×」ボタン）を削除。
    - `LONG_PRESS_MS = 500`、`MOVE_CANCEL_PX = 10` による長押し検出を追加。500ms長押し成立時に `window.confirm(「{フォルダ名}」を削除しますか？)` で確認後 `onDelete` を発火。
    - 10pxを超えるポインタ移動時はタイマーをキャンセル。
    - 通常の短いタップでは `onSelect` が動作。
  - `src/App.css`: 不要になった `.folder-delete-btn` のスタイルを削除。
  - テスト拡充:
    - `src/lib/folders.test.ts`: メモがあるフォルダでも削除できるテストへ更新。
    - `src/components/FolderList.test.tsx`: 「×」ボタン不在確認、500ms長押し削除確認、キャンセル時スキップ、10px移動時キャンセル、短タップ時選択のテストを追加。
    - `src/App.test.tsx`: メモを含むフォルダ削除時にゴミ箱へメモが移動し元フォルダ名付きでゴミ箱に表示される結合テスト、空フォルダ削除時にメモ警告が出ない結合テストを追加。既存の旧仕様テスト（非空フォルダ削除拒絶）を削除。
- **結果:** テスト 259/259 全通過、ビルド成功。
(その後コミット・デプロイ完了: `11f275a`)

### フェーズ3: ゴミ箱の中身を完全削除する機能(完了)
- **課題:**
  - 通常のゴミ箱移動はMarkdown frontmatterの `deleted: true` によるソフトデリートであり、GitHubリポジトリにファイルが残り続ける。ローカルのIndexedDBレコードだけでなく、リモートのGitHub上のファイルも物理削除（DELETE）する完全削除機能が必要。
- **対応:**
  - `src/lib/db.ts`: `StoredNote` に `pendingPermanentDelete?: boolean` を追加。
  - `src/lib/sync.ts`:
    - `DeleteTarget` に `permanent?: boolean` を追加。
    - `planSync`: `pendingPermanentDelete: true` のノートで `baseSha !== null` かつリモートに存在する場合に `toDelete` (`permanent: true`) へ追加。
    - `runSync`: `del.permanent` の場合に `github.deleteContent` を呼び出し、ローカルのメモリマップから除外して `permanentlyDeletedIds` に記録。戻り値に `permanentlyDeletedIds` を追加。
  - `src/lib/fullSync.ts`: `runSync` の戻り値 `permanentlyDeletedIds` を受け取り、`db.notes.bulkDelete(permanentlyDeletedIds)` を実行。戻り値にも `permanentlyDeletedIds` を含めて返す。
  - `src/components/EditorActionBar.tsx`: `onPermanentDelete?: () => void` propを追加。ゴミ箱内メモ閲覧時の `trash-banner` に「完全に削除」ボタン（`.btn-danger.permanent-delete-btn`）を追加。
  - `src/index.css`: 赤系の危険動作用スタイル `.btn-danger` を新設。
  - `src/components/NoteList.tsx`:
    - `isTrash` でも長押し複数選択を有効化（`if (isTrash) return` を解除）。
    - ゴミ箱内での複数選択時、バルクバーに「完全に削除」ボタン（`.btn-danger.note-bulk-delete-btn`）のみを表示し、フォルダ移動やゴミ箱移動ボタンは非表示。
    - `onBulkPermanentDelete?: (ids: string[]) => void` propを追加。
  - `src/App.tsx`:
    - `permanentlyDeleteActiveNote`: 単体完全削除ハンドラ。確認ダイアログ（`window.confirm`）後、未同期ノートは即時ローカル削除、同期済みノートは `pendingPermanentDelete: true` をセット。検索インデックスから除去し、オンラインなら即座に同期（`handleSyncNow`）を発火。
    - `bulkPermanentlyDeleteNotes`: 複数選択の一括完全削除ハンドラ。確認ダイアログ後、同様にローカル削除または予約・同期・インデックス除去。
    - `applySearchIndexUpdate`: `permanentlyDeletedIds` を受け取れるよう拡張し、同期完了ハンドラ（`syncInBackground` / `handleSyncNow`）から渡して別デバイス発の完全削除も検索索引から確実に除去。
    - `handleSyncNow` 完了時に `refreshNotesForSelectedFolder()` を追加。
    - `EditorActionBar` と `NoteList` にハンドラを接続。
  - テスト拡充:
    - `src/lib/sync.test.ts`: `planSync` での完全削除振り分け、未同期ノートの除外、`runSync` でのリモートDELETE実行・`permanentlyDeletedIds` 返却のテストを追加。
    - `src/lib/fullSync.test.ts`: `fullSync` で `pendingPermanentDelete` ノートがリモートDELETEされIndexedDBから完全削除される結合テストを追加。
    - `src/components/EditorActionBar.test.tsx`: ゴミ箱バナー内の「完全に削除」ボタン表示とクリック時コールバック発火テストを追加。
    - `src/components/NoteList.test.tsx`: ゴミ箱内での長押し複数選択、バルクバーの「完全に削除」のみ表示、クリック時 `onBulkPermanentDelete` 発火テストを追加。
    - `src/App.test.tsx`: 未同期メモの即時完全削除、同期済みメモの予約・リモートDELETE・DB完全削除、ゴミ箱での一括完全削除の結合テスト3件を追加。
- **結果:** テスト 267/267 全通過、ビルド成功。
(その後コミット・デプロイ完了: `e038f27`、Actions Run `39017115086`、本番ライブ動作確認済み)

### フェーズ4: フォルダ画面の右余白の調査・修正(完了)
- **原因の特定（ユーザーヒアリング・PWA実機挙動）:**
  - ユーザー環境: Android端末（Zenfone 10）、画面は縦向き、ホーム画面に追加したPWA（standalone全画面）で起動。
  - 現象: 操作してもずっと左1/4に縮んだままで自然には戻らない。
  - 根本原因:
    1. デスクトップ用CSSで `.col-folders` に `flex: 0 0 220px;`（幅220px固定）が指定されていたが、モバイルメディアクエリ（`@media (max-width: 768px)`）内では親の `.columns` が `display: flex;` のままだった。
    2. Android PWA (standalone) モードや特定の Chromium レンダリングにおいて、flexコンテナ内の `position: absolute; inset: 0;` 要素に対して明示的な `width: 100%` や `flex: none` がないと、包含ブロックやデスクトップ時の `flex-basis: 220px` が干渉し、コンテンツ幅が約220px（画面幅の約1/4）に縮んでしまう。
    3. また、PWA standalone 全画面表示時のノッチ/パンチホール（Zenfone 10は左上）に対する `env(safe-area-inset-left)` の余白指定がなく、左端の角丸が切れていた。
- **対応:**
  - `src/App.css`:
    - モバイルメディアクエリ（`@media (max-width: 768px)`）内の `.columns` に `display: block; width: 100%; height: 100%;` を指定し、親の flexbox の干渉を完全に遮断。
    - `.col-folders, .col-notes, .col-editor` に明示的に `width: 100%; height: 100%; max-width: 100%; flex: none; border-right: none; box-sizing: border-box;` を指定し、デスクトップ用の 220px 固定幅や境界線を完全に無効化。
    - `.folder-list-wrap` に `padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);` を追加し、パンチホールや全画面端での見切れを防止。
  - `src/components/SwipeContainer.tsx`:
    - 画面遷移（`className` 変更）時にドラッグオフセットや状態を安全にリセットする `useEffect` を追加。
    - Android のシステムジェスチャー（戻る等）でポインタキャプチャを奪われた際にも確実にドラッグオフセットを0pxにリセットするよう `onLostPointerCapture={handlePointerCancel}` を追加。
    - `handlePointerCancel` で `pointerId` が undefined のキャプチャ喪失イベントでも安全にリセットするよう条件を緩和。
  - テスト拡充:
    - `src/components/SwipeContainer.test.tsx`: `lostpointercapture` によるオフセットリセット確認テスト、`className` 遷移時のオフセットリセット確認テストの2件を追加。
- **結果:** テスト 269/269 全通過、ビルド成功。
(その後コミット・デプロイ完了: `8c74bc0`、Actions Run `39019819979`、本番ライブ動作確認済み)

## 6. 実機フィードバック対応(2026-10-17新計画)

### フェーズ1: フォルダ削除の長押し待ち時間を1秒に延長(完了)
- **課題:**
  - フォルダ一覧でフォルダ削除判定の待ち時間（`LONG_PRESS_MS = 500`）が短すぎて、画面スクロール時や軽いタッチでも削除確認ダイアログが出てしまう。
- **対応:**
  - `src/components/FolderList.tsx`: `LONG_PRESS_MS` を `500` から `1000`（1000ms = 1秒）に変更。
  - テスト更新:
    - `src/components/FolderList.test.tsx`: 500msから1000msへのタイマー期待値更新（999msで発火せず、1000msで発火）。
    - `src/App.test.tsx`: `folder deletion and moving notes to trash` describeブロック内の `longPress` ヘルパー待機時間を 550ms から 1050ms へ更新。
- **結果:** テスト 269/269 全通過、ビルド成功。
(その後コミット・デプロイ完了: `3582649`、Actions Run `39022962329`、本番ライブ動作確認済み)

### フェーズ2: ゴミ箱・メモ一覧で2件目以降の選択がタップで動作するように修正(完了)
- **課題:**
  - 複数選択モード中、2件目以降のメモを選択する際に、長押ししないと選択できない（通常のタップで反応しない）。
  - 原因: 祖先の `SwipeContainer` が 1〜2px のわずかな指のブレでも `isDragging = true` と判定してドラッグ扱いにするため、実機ブラウザがネイティブ `click` イベントを抑制（キャンセル）してしまう。従来のコードは選択トグルを `onClick` に依存していたため発火しなかった。
- **対応:**
  - `src/components/NoteList.tsx`:
    - `tapHandledRef` を導入。
    - `handlePointerUp` で移動量が `MOVE_CANCEL_PX`（10px）以内の場合はタップ成立と判定し、その場で即座に `toggleSelected(id)` / `onSelect(id)` を実行して `tapHandledRef.current = true` をセット。
    - `handleRowClick` では `tapHandledRef.current` が true の場合に早期リターンし二重実行を防止。
    - `handlePointerCancel` を分離し、ポインタ追跡を安全にリセット。
  - テスト拡充:
    - `src/components/NoteList.test.tsx`:
      - 複数選択モード中に `click` イベントが抑制されても（`pointerDown` → 微小な `pointerMove` 2px → `pointerUp` のみ発火）、2件目のメモがトグル選択され「2件選択中」となることを検証する回帰テストを追加。
      - 移動量が閾値（10px）を超える場合（15px）は、スワイプ/スクロールとみなされて選択がトグルされないことを検証するテストを追加。
- **結果:** テスト 271/271 全通過、ビルド成功。
(その後コミット・デプロイ完了: `af1ef87`、Actions Run `39023378156`、本番ライブ動作確認済み)
