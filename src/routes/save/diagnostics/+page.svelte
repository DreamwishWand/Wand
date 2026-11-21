<script lang="ts">
  import SaveDiagnosticsPanel from '$lib/save/SaveDiagnosticsPanel.svelte';
  import { makeSaveDiagnosticView } from '$lib/save/diagnostic-view.mjs';

  // This developer-only route is intentionally not linked in site navigation.
  // It cannot decode encrypted .profile files and must never be called an editor.
  const MAX_JSON_BYTES = 128 * 1024 * 1024;
  let decoded: unknown = null;
  let isReading = false;
  let errorMessage = '';
  let infoMessage = '';
  let fileInput: HTMLInputElement | null = null;
  let serial = 0;

  async function onFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const current = ++serial;
    decoded = null;
    errorMessage = '';
    infoMessage = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json') || file.size === 0 || file.size > MAX_JSON_BYTES) {
      errorMessage = '復号済みJSON形式（最大128 MiB）のみ読み込めます。暗号化された.profileは非対応です。';
      input.value = '';
      return;
    }
    isReading = true;
    try {
      const contents = await file.text();
      if (current !== serial) return;
      const candidate: unknown = JSON.parse(contents);
      makeSaveDiagnosticView(candidate); // strict root preflight; never prints input.
      if (current !== serial) return;
      decoded = candidate;
      infoMessage = '復号済みJSONをブラウザ内で読み込みました。データのアップロード、保存、書き換えは行っていません。';
    } catch {
      if (current === serial) {
        decoded = null;
        errorMessage = 'JSONの構造を読み取れませんでした。復号済みDDVセーブのGameInfo・Player・Worldが必要です。';
      }
    } finally {
      if (current === serial) isReading = false;
      input.value = '';
    }
  }

  function clearDecoded() {
    ++serial;
    decoded = null;
    errorMessage = '';
    infoMessage = 'ブラウザ内の診断対象を破棄しました。';
    isReading = false;
    if (fileInput) fileInput.value = '';
  }
</script>

<svelte:head>
  <title>Save Diagnostics (開発用) | Dreamwish Wand</title>
  <meta name="description" content="Dreamwish Wand DB-05 private/local developer diagnostics for pre-decoded DDV save JSON. No save editing." />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="save-diagnostics-page">
  <header>
    <div class="eyebrow">DEVELOPMENT · DB-05 SAVE</div>
    <h1>セーブ構造診断</h1>
    <p>読み取り専用の開発者向け確認ページです。現時点では復号済みのJSONのみ対応します。暗号化されたセーブファイルの読み込み、編集、保存は実装していません。</p>
  </header>
  <div class="local-picker">
    <div>
      <h2>ローカルの復号済みJSONを読み込む</h2>
      <p>ファイルを選択した端末のブラウザ内だけで処理します。元のファイルは変更されません。</p>
      <p>通常のゲームセーブ（.profile）の直接読み込みには対応していません。</p>
    </div>
    <label class="file-input-label">
      復号済みJSONを選択
      <input bind:this={fileInput} type="file" accept=".json,application/json"
        on:change={onFileChange} disabled={isReading} aria-label="復号済みJSONを選択" />
    </label>
    <button class="clear-button" type="button" on:click={clearDecoded}
      disabled={decoded === null && !isReading}>読み込み内容を破棄</button>
  </div>
  {#if isReading}<p class="notice" role="status">ブラウザ内で構造を確認しています…</p>{/if}
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
  {#if infoMessage}<p class="notice" role="status">{infoMessage}</p>{/if}
  {#if decoded !== null}
    <SaveDiagnosticsPanel {decoded} />
  {:else}
    <div class="empty-state">復号済みのセーブデータがまだ指定されていません。診断結果はここに表示されます。</div>
  {/if}
  <p class="disclaimer">本機能は開発中の構造検証専用です。正式なSave Editorではありません。完全な互換性、所有権、書き換えの安全性は判定しません。</p>
</section>

<style>
  .save-diagnostics-page{width:100%;max-width:1270px;margin:0 auto;padding:clamp(25px,5vw,70px) clamp(18px,4vw,54px) 80px;color:#f7edfc;}
  h1{font-size:clamp(32px,5vw,55px);letter-spacing:-.05em;margin:10px 0 16px;}
  h2{font-size:18px;margin:0 0 8px;}
  header p{line-height:1.85;color:#bdb0cb;max-width:790px;font-size:14px;}
  .eyebrow{color:#caa7eb;letter-spacing:.18em;font-size:11px;font-weight:700;}
  .local-picker{background:#231a30;border:1px solid #ffffff26;border-radius:17px;padding:22px;margin:30px 0 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;}
  .local-picker>div{flex:1 1 350px;}
  .local-picker p{font-size:12px;color:#b5a7c7;line-height:1.7;margin:4px 0;}
  .file-input-label{position:relative;display:inline-flex;padding:12px 16px;align-items:center;background:#dbbafb;color:#25152e;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;}
  .file-input-label:focus-within{outline:2px solid #e5cdff;outline-offset:3px;}
  .file-input-label input{position:absolute;opacity:0;inset:0;width:100%;height:100%;cursor:pointer;}
  .clear-button{background:#3b2e49;border:1px solid #ffffff2d;border-radius:9px;color:#f1ddff;font-size:12px;padding:12px 16px;}
  button:disabled{opacity:.45;cursor:not-allowed;}
  .error,.notice{padding:12px 16px;border-radius:8px;background:#ffffff0b;font-size:12px;}
  .error{color:#ffb1bb;}
  .notice{color:#c9bad7;}
  .empty-state{padding:40px 22px;border:1px dashed #ffffff2e;border-radius:12px;color:#aea0bf;text-align:center;font-size:13px;}
  .disclaimer{font-size:11px;line-height:1.7;color:#9b8aaf;margin:22px 0;}
</style>
