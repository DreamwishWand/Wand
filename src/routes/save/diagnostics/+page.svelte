<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import SaveDiagnosticsPanel from '$lib/save/SaveDiagnosticsPanel.svelte';
  import { sanitizeSaveDiagnosticView } from '$lib/save/diagnostic-view.mjs';
  import type { SaveDiagnosticView } from '$lib/save/diagnostic-view.mjs';

  // Development-only read-only route. Rust/WASM P1G Worker; NOT a Writer. No encrypted data is sent to page components.
  const MAX_JSON_BYTES = 128 * 1024 * 1024;
  let report: SaveDiagnosticView | null = null;
  let isReading = false;
  let errorMessage = '';
  let infoMessage = '';
  let fileInput: HTMLInputElement | null = null;
  let activeWorker: Worker | null = null;
  let requestSerial = 0;

  function stopWorker() {
    requestSerial++;
    activeWorker?.terminate();
    activeWorker = null;
  }
  onDestroy(stopWorker);
  onMount(()=>{
    const clear=()=>clearDecoded();
    window.addEventListener('wand:save-clear',clear);
    return()=>window.removeEventListener('wand:save-clear',clear);
  });

  function clearDecoded() {
    stopWorker();
    report = null;
    errorMessage = '';
    infoMessage = 'ブラウザ内の診断結果を破棄しました。';
    isReading = false;
    if (fileInput) fileInput.value = '';
  }

  async function onFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    stopWorker();
    report = null;
    errorMessage = '';
    infoMessage = '';
    isReading = false;
    if (!file) return;
    const lower = file.name.toLowerCase();
    const format = lower.endsWith('.json') ? 'json' :
      /\.(profile|dat|bin)$/.test(lower) ? 'auto' : null;
    if (!format || file.size < 1 ||
        file.size > MAX_JSON_BYTES) {
      errorMessage = 'JSON（最大128 MiB）またはJSON/P1G形式のセーブファイルを選択してください。';
      input.value = '';
      return;
    }

    const request = requestSerial;
    isReading = true;
    let bytes: Uint8Array | null = null;
    let worker: Worker | null = null;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== requestSerial) return;
      worker = new Worker(
        new URL('../../../lib/save/save-diagnostics.worker.ts', import.meta.url),
        { type: 'module' }
      );
      activeWorker = worker;
      const ownedWorker = worker;
      const finish = (message: unknown) => {
        if (request !== requestSerial || activeWorker !== ownedWorker) return;
        ownedWorker.terminate();
        activeWorker = null;
        isReading = false;
        try {
          const result = message as Record<string, unknown> | null;
          const body = result?.result as Record<string, unknown> | null;
          if (result?.kind !== 'result' ||
              body?.kind !== 'save-diagnostics-summary' ||
              body.contract !== 'wand.db05.local-save-worker@1' ||
              !((format === 'auto' && (body.format === 'json' || body.format === 'p1g')) ||
                body.format === format) ||
              body.writerAuthorized !== false || body.exportAuthorized !== false) {
            throw new TypeError('DB05_BAD_WORKER_RESULT');
          }
          report = sanitizeSaveDiagnosticView(body.summary);
          const wasm = body.wasmReferenceParity as Record<string, unknown> | null | undefined;
          const status = wasm?.contract === 'wand.db05.wasm-reference-parity@1' &&
            wasm.writerAuthorized === false && wasm.exportAuthorized === false
            ? wasm.status : 'unavailable';
          const wasmText = status === 'matched' && wasm?.wasmExecuted === true &&
            wasm.rulesCompared === 14 && wasm.wasmAndJsEqual === true
            ? ' Rust/WASMによる内部参照14規則の検査はJSと一致しました。'
            : status === 'diverged'
              ? ' Rust/WASMとJSの参照検査結果に差異があります（安全性の判定ではありません）。'
              : status === 'skipped_large_save'
                ? ' サイズ制限によりRust/WASM参照検査は省略されました。'
                : ' Rust/WASM参照検査は利用できず、JSの読み取り専用診断のみ実行しました。';
          const native = body.nativeP1gAudit as Record<string, unknown> | null | undefined;
          const nativeStatus = native?.contract === 'wand.db05.native-p1g-audit@1' &&
            native.writerAuthorized === false && native.exportAuthorized === false &&
            native.profileDigestExposed === false ? native.status : 'unavailable';
          const nativeText = body.format !== 'p1g' ? '' :
            nativeStatus === 'matched' && native?.wasmExecuted === true &&
              native.originalProfileBytesEqual === true
              ? ' Rust/WASMでP1Gを再復号し、Worker内のJSONバイト列との一致を確認しました。'
              : nativeStatus === 'diverged'
                ? ' Rust/WASMの再復号結果とWorker内のJSONが一致しません。書き出しは禁止です。'
                : nativeStatus === 'rejected_by_rust'
                  ? ' このP1GのZIP形式はRust/WASMによる厳密な読み込みに対応していません。'
                  : nativeStatus === 'skipped_large_save'
                    ? ' サイズ制限のためRust/WASMでのP1G二重検査は省略しました。'
                    : ' Rust/WASMのP1G二重検査は利用できません。';
          infoMessage = (body.format === 'p1g'
            ? 'P1Gセーブを専用Worker内で復号・検査しました。画面には匿名化した結果だけを返しています。'
            : 'JSONを専用Worker内で検査しました。画面には匿名化した結果だけを返しています。') + wasmText + nativeText;
        } catch {
          report = null;
          errorMessage = 'このセーブを診断できませんでした。元ファイルは変更していません。';
        }
      };
      worker.onmessage = event => finish(event.data);
      worker.onerror = event => { event.preventDefault(); finish({kind:'error'}); };
      worker.onmessageerror = () => finish({kind:'error'});
      // Transfer the sole file buffer to the Worker, which wipes it on exit.
      worker.postMessage({
        command: 'inspect-local-save-diagnostics', format, bytes
      }, [bytes.buffer]);
      bytes = null;
    } catch {
      if (request === requestSerial) {
        worker?.terminate();
        activeWorker = null;
        isReading = false;
        report = null;
        errorMessage = 'このセーブを診断できませんでした。元ファイルは変更していません。';
      }
    } finally {
      if (bytes && bytes.byteLength) bytes.fill(0);
      input.value = '';
    }
  }
</script>

<svelte:head>
  <title>Save Diagnostics (開発用) | Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand DB-05 browser-local read-only diagnostics for DDV P1G or pre-decoded JSON. No save editing." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="save-diagnostics-page">
  <header>
    <div class="eyebrow">DEVELOPMENT · DB-05 SAVE</div>
    <h1>セーブ構造診断</h1>
    <p>読み取り専用の開発者向け確認ページです。JSONセーブおよび暗号化P1Gの診断に対応します。形式はファイルの内容から判定します。実績7フィールドの型・件数も匿名で確認できます。改変セーブで削除されたミッションや未記録の実績は破損と断定しません。復号は専用Workerで行い、元ファイルの編集・保存は実装していません。</p>
  </header>
  <div class="local-picker">
    <div>
      <h2>ローカルのセーブを診断する</h2>
      <p>ローカルの専用Workerで構造を検査します。セーブ本体は画面に渡さず、元のファイルも変更されません。</p>
      <p>暗号化P1Gは専用Worker内のRust/WASMで復号・検証します。未対応のZIP形式は安全に拒否します。書き出し機能はありません。</p>
    </div>
    <label class="file-input-label">
      DDVセーブを選択
      <input bind:this={fileInput} type="file" accept=".profile,.dat,.bin,.json,application/json,application/octet-stream"
        on:change={onFileChange} disabled={isReading} aria-label="DDVセーブまたは復号済みJSONを選択" />
    </label>
    <button class="clear-button" type="button" on:click={clearDecoded}
      disabled={report === null && !isReading}>読み込み内容を破棄</button>
  </div>
  {#if isReading}<p class="notice" role="status">ブラウザ内で構造を確認しています…</p>{/if}
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
  {#if infoMessage}<p class="notice" role="status">{infoMessage}</p>{/if}
  {#if report !== null}
    <SaveDiagnosticsPanel {report} />
  {:else}
    <div class="empty-state">セーブファイルがまだ指定されていません。匿名化した診断結果はここに表示されます。</div>
  {/if}
  <p class="disclaimer">本機能は開発中の構造検証専用です。正式なSave Editorではありません。完全な互換性、所有権、書き換えの安全性は判定しません。</p>
</section>

<style>
  .save-diagnostics-page{width:100%;max-width:1270px;margin:0 auto;padding:clamp(25px,5vw,70px) clamp(18px,4vw,54px) 80px;color:var(--wand-text);}
  h1{font-size:clamp(32px,5vw,55px);letter-spacing:-.05em;margin:10px 0 16px;}
  h2{font-size:18px;margin:0 0 8px;}
  header p{line-height:1.85;color:var(--wand-muted);max-width:790px;font-size:14px;}
  .eyebrow{color:var(--wand-muted);letter-spacing:.18em;font-size:11px;font-weight:700;}
  .local-picker{background:var(--wand-surface);border:1px solid var(--wand-subtle-line);border-radius:17px;padding:22px;margin:30px 0 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;}
  .local-picker>div{flex:1 1 350px;}
  .local-picker p{font-size:12px;color:var(--wand-muted);line-height:1.7;margin:4px 0;}
  .file-input-label{position:relative;display:inline-flex;padding:12px 16px;align-items:center;background:var(--wand-primary);color:var(--wand-on-primary);border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;}
  .file-input-label:focus-within{outline:2px solid var(--wand-selected-line);outline-offset:3px;}
  .file-input-label input{position:absolute;opacity:0;inset:0;width:100%;height:100%;cursor:pointer;}
  .clear-button{background:var(--wand-control);border:1px solid var(--wand-subtle-line);border-radius:9px;color:var(--wand-text);font-size:12px;padding:12px 16px;}
  button:disabled{opacity:.45;cursor:not-allowed;}
  .error,.notice{padding:12px 16px;border-radius:8px;background:var(--wand-surface-raised);font-size:12px;}
  .error{color:var(--wand-danger);}
  .notice{color:var(--wand-text);}
  .empty-state{padding:40px 22px;border:1px dashed var(--wand-subtle-line);border-radius:12px;color:var(--wand-muted);text-align:center;font-size:13px;}
  .disclaimer{font-size:11px;line-height:1.7;color:var(--wand-muted);margin:22px 0;}
</style>
