# Dreamwish Wand — 最終アーキテクチャ遵守監査 (2026-11-22)

## 正式な技術構成

**Svelte + TypeScript（UI・Worker通信）／Rust/WASM（ゲーム固有の処理・セーブ解析／編集）／Web Worker（大型ファイルと高負荷処理）**。ローカル限定で処理し、私的セーブデータや原本ゲームデータはWebサービスへ送信しない。TypeScript UI／Worker orchestrationは契約適合。新しいゲーム固有アルゴリズムをJavaScriptで追加することは不可。

## GitHub原本コードの検証結果

| モジュール | 実際の構成・主要ファイル | 判定 |
| --- | --- | --- |
| UI | Svelte 5 + SvelteKit + TypeScript, `src/routes` | **適合** |
| Collection検索・状態 | Rust `crates/wand-collection-core` → WASM | **コアは適合** |
| Collectionエンジン実行場所 | `src/lib/collection/runtime.ts` がWeb WorkerではなくUI側で`CollectionEngine`を直接呼び出す | **未適合** |
| Collection暗号化P1G | 並行ストリームが`saved-store.worker.ts`＋`src/lib/save/p1g-read.ts`へRust-first移行済み。ただしRustが「未対応ZIP封筒」と識別した場合の旧JS読み込み経路が残存 | **部分移行／契約に未完全適合** |
| DB-05 Save Diagnostics | 従来`save-diagnostics.worker.mjs`と`private-p1g-codec.js`で本番JS暗号復号。今回のPRで`save-diagnostics.worker.ts`＋`decodeP1gRustOnly`へ移行、旧JS自動フォールバックは禁止 | **このPRでP1G暗号復号は移行** |
| セーブの参照解析・Collection/Inventory/World投影 | `save-diagnostics-worker-core.mjs`, `saved-list-positive-ownership.mjs`, `saved-collection-discovery.mjs`, `world-store-save.mjs` 等のJSルール | **未適合** |
| Save編集 | Rust `ddv-save-patch`, `ddv-p1g-codec`を専用Workerで使用する部分的な実験版 | **Rust実装あり／編集機能全体は未完成** |
| World Editor・Decorate | `src/lib/world/catalog.mjs` (~75KB) と`preview-views.mjs`等のJSゲーム固有計算 | **未適合** |
| DB-02 Acquisition | `src/lib/acquisition/planner.mjs` (~18KB) と売却価格・材料・レシピルールのJS実装多数 | **未適合** |
| Guide | 一部Svelte/TS、ビジネスロジックが複数JSモジュールに存在 | **要単位別移行** |

**結論：契約遵守は未達。** Rust crateが存在しても、本番のUI呼び出し経路がJSやメインスレッドのままなら適合とは判定しない。

## 2026-11-22 初回是正

並行ストリームの実装と競合した旧draft PR #279は、ほかの変更を上書きしないため統合せず閉鎖。現行mainに既存のRust P1G readerがあり、`Collection`用に使われていることを確認。

後続PR #287で**Save Diagnostics本番経路**を修正：

1. 既存の`p1g-read.ts`から、Rust/WASMが明示的に未対応と判断したZIPも含め、JSフォールバックを禁止する`decodeP1gRustOnly`を公開。Collectionの既存互換動作には手を加えない。
2. `save-diagnostics.worker.ts`を追加し、Rust-only decoderをDI。旧`save-diagnostics.worker.mjs`を削除。SvelteページはTS Workerへ移行。
3. JSコアは既存のNode合成テスト互換用に縮小して保持。ゲーム固有の既存投影をRustへ移すまで契約上の技術負債として明記。
4. 既存`tools/architecture/check-production-stack.mjs`に本番診断WorkerのRust-only呼び出し・旧JS非使用・UI通信を検証するCIガードを追加。
5. Rust P1G検証のユーザー表示文言とブラウザ合成テストを更新。元ファイルは一切改変せず、書き出し権限もない。

**このPRをもってWand全体の移行が完了したと表記しないこと。**

## 続行優先順位・完了条件

1. Collectionの`CollectionEngine`を常駐Web Worker内部へ移動。検索・フィルタ・進捗を非同期メッセージAPIへ変更し、IndexedDBと手入力状態を維持。
2. JSのセーブゲーム固有投影をRustへ移し、旧P1G JS codecを本番実行グラフから完全除去。Collectionの例外的フォールバックもRust互換性拡充後に禁止。
3. Worldのグリッド／地形／配置処理とDB-02のレシピ材料計算・価格プロバイダー判断をRust/WASM Workerへ移す。TSはUIとプロセス連携だけを担当。
4. Save Editorのすべての編集操作をRustが担当し、未知フィールドを保持した検証済みのエクスポート経路を完成。
5. `tools/architecture/check-production-stack.mjs`とGitHub ActionsでRust-only本番呼び出しとメインスレッド負荷を追跡し、合成テスト＋代表的なユーザーローカル原本で検証する。

最終適合条件：**実行中のセーブ暗号復号・ゲーム固有判定／編集がRust/WASM、重い計算がWorker、Svelte/TSはUI／通信に限定されていること**。速度・文字情報・セーブ互換性の検証も伴う。Private原本はGitHubへコミットしない。
