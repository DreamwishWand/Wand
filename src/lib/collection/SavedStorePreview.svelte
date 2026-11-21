<script lang="ts">
  import { onDestroy } from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import { attachHistoricalStoreLabels } from './saved-store-preview.mjs';

  export let records: Array<{itemId:number;label:string;family:string}> = [];
  export let locale = 'ja';
  export let gameImageMap: Record<string,string> = {};

  let preview: any = null;
  let errorMessage = '';
  let busy = false;
  let query = '';
  let limit = 48;
  let showImages = false;
  let fileInput: HTMLInputElement;
  let saveSchema: number|null = null;

  // No DB-02 private source corpus is published to the static site.
  // The Worker receives only ciphertext; the UI receives only ID counts.
  let activeWorker: Worker|null = null;
  let requestSequence = 0;

  function stopWorker() {
    requestSequence++;
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
  }
  onDestroy(stopWorker);
  $: shown = preview ? preview.items.filter((item:any)=>
    !query.trim() || String(item.itemId).includes(query.trim()) ||
    (item.historicalLabel??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ) : [];

  function clear() {
    stopWorker();
    busy = false;
    preview = null;
    saveSchema = null;
    errorMessage = '';
    query = '';
    showImages = false;
    limit = 48;
    if (fileInput) fileInput.value = '';
  }

  function failedRead() {
    errorMessage = 'このセーブは読み取れませんでした。対応するP1G形式・データ構造を確認してください。元のファイルは変更されていません。';
    preview = null;
    saveSchema = null;
  }

  async function openLocalFile(event:Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy) return;
    clear();
    busy = true;
    const request = requestSequence;
    let encrypted:Uint8Array|null = null;
    let worker:Worker|null = null;
    try {
      if (file.size < 16 || file.size > 32*1024*1024)
        throw new TypeError('PROFILE_SIZE_LIMIT');
      encrypted = new Uint8Array(await file.arrayBuffer());
      if (request !== requestSequence) return; // dismissed during file read
      worker = new Worker(new URL('./saved-store.worker.mjs', import.meta.url),{type:'module'});
      activeWorker = worker;
      const w = worker;
      const finish = (result:any) => {
        if (activeWorker !== w || request !== requestSequence) return;
        w.terminate();
        activeWorker = null;
        busy = false;
        try {
          if (result?.kind !== 'result' || result.result?.kind !== 'saved-store-summary' ||
              (result.result.saveSchema !== null &&
              (!Number.isSafeInteger(result.result.saveSchema) || result.result.saveSchema < 0)))
            throw new TypeError('LOCAL_P1G_INVALID_WORKER_REPLY');
          preview = attachHistoricalStoreLabels(result.result.summary,records);
          saveSchema = result.result.saveSchema;
        } catch { failedRead(); }
      };
      w.onmessage = event => finish(event.data);
      w.onerror = event => { event.preventDefault(); finish({kind:'error'}); };
      w.onmessageerror = () => finish({kind:'error'});
      // Transfer rather than clone: source ciphertext leaves the main thread.
      // The dedicated Worker wipes it and terminates after this one task.
      w.postMessage({command:'inspect-local-p1g',ciphertext:encrypted},[encrypted.buffer]);
      encrypted = null;
    } catch {
      if (request === requestSequence) {
        worker?.terminate();
        activeWorker = null;
        busy = false;
        failedRead();
      }
    } finally {
      if (encrypted && encrypted.byteLength) encrypted.fill(0);
      input.value = '';
    }
  }
</script>

<section class="saved-store-preview" aria-label="セーブ内の店舗商品・読み取り専用プレビュー">
  <div class="store-head">
    <div>
      <span class="store-eyebrow">LOCAL / READ-ONLY</span>
      <h2>セーブ内の店舗商品</h2>
      <p>DDVのP1G形式セーブを専用のブラウザー内Workerで開き、保存されている店舗の商品参照だけを一覧にします。ファイルの送信・編集・保存は行いません。</p>
    </div>
    {#if preview || busy}
      <button type="button" class="store-clear" on:click={clear}>{busy?'読み込みを中止':'読み込み結果を消去'}</button>
    {/if}
  </div>
  <div class="store-import">
    <label class="store-file">
      セーブを選択
      <input bind:this={fileInput} type="file" accept=".json,.profile,.dat,application/octet-stream" on:change={openLocalFile} disabled={busy} aria-label="DDVのセーブファイルを選択"/>
    </label>
    <p>暗号化されたセーブをローカルで解析します。ブラウザーの記録・Collectionの所持状況は変更しません。</p>
  </div>
  {#if busy}
    <p class="store-status" role="status">この端末内で読み取り中…</p>
  {:else if errorMessage}
    <p class="store-error" role="alert">{errorMessage}</p>
  {:else if preview}
    <div class="store-caveat" role="status">
      {#if preview.status==='not_observed'}
        このセーブに World.Stores フィールドは確認できませんでした。店舗が存在しないという意味ではありません。
      {:else}
        保存された店舗データのみを表示します。現在の販売商品・在庫・価格、購入履歴、所有・収集状態は確認できません。
      {/if}
    </div>
    <div class="store-metrics">
      <span>セーブ構造 <strong>{saveSchema??'不明'}</strong></span>
      <span>店舗 <strong>{preview.savedStoreCount}</strong></span>
      <span>スロット <strong>{preview.savedSlotCount}</strong></span>
      <span>商品参照 <strong>{preview.savedItemReferenceCount}</strong></span>
      <span>商品種類 <strong>{preview.distinctItemCount}</strong></span>
    </div>
    <p class="store-warning">名称・画像は公開済みの別バージョンの Collection 資料との <strong>Item ID 一致による参考表示</strong>です。同一バージョンの名称・画像であることは未確認です。</p>
    {#if preview.items.length}
      <div class="store-controls">
        <input type="search" aria-label="保存された商品IDまたは参考名で検索" placeholder="Item ID / 参考名" bind:value={query} on:input={()=>limit=48}/>
        <label><input type="checkbox" bind:checked={showImages}/> 参考画像を読み込む</label>
      </div>
      <p class="store-warning">画像表示は初期状態で無効です。有効にすると公開済みの画像ファイルをサイトから取得します。セーブデータ自体は送信されません。</p>
      <div class="store-items">
        {#each shown.slice(0,limit) as item (item.itemId)}
          <div class="store-item">
            {#if showImages && item.historicalMatch}
              <span class="store-art"><ItemArtwork itemId={item.itemId} sourcePath={gameImageMap[String(item.itemId)]??null} alt="参考画像"/></span>
            {/if}
            <div class="store-detail">
              <strong>{item.historicalLabel ?? `Item ID ${item.itemId}`}</strong>
              <small>ID {item.itemId} {#if item.historicalLabel}· 旧版参考名{/if}</small>
              <small>保存参照 {item.referenceCount}件 / 店舗 {item.storeReferenceCount}件</small>
            </div>
          </div>
        {/each}
      </div>
      {#if shown.length > limit}
        <button type="button" class="store-more" on:click={()=>limit+=48}>さらに表示（残り {shown.length-limit}件）</button>
      {:else if !shown.length}
        <p>検索条件に一致する商品参照はありません。</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .saved-store-preview { margin:20px 0; padding:22px; border:1px solid rgba(150,126,190,.32); border-radius:18px; background:rgba(133,106,161,.065); }
  .store-head { display:flex; gap:20px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
  .store-head h2 { font-size:1.2rem; margin:.3rem 0 .35rem; }
  .store-head p,.store-import p,.store-warning { font-size:.83rem; line-height:1.65; opacity:.85; max-width:78ch; margin:.35rem 0 .65rem; }
  .store-eyebrow { font-size:.68rem; letter-spacing:.12em; opacity:.7; }
  .store-clear,.store-more { border:1px solid #947aa7; border-radius:9px; padding:.55rem .85rem; background:transparent; color:inherit; cursor:pointer; }
  .store-import { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; }
  .store-file { display:inline-flex; flex-direction:column; gap:6px; font-size:.8rem; font-weight:600; }
  .store-file input { font-size:.8rem; max-width:240px; }
  .store-error { color:#b9515a; }
  .store-caveat { padding:10px 12px; border-left:3px solid #9874af; background:rgba(126,88,156,.09); font-size:.85rem; }
  .store-metrics { display:flex; flex-wrap:wrap; gap:10px 18px; margin:14px 0 10px; font-size:.83rem; }
  .store-metrics strong { font-variant-numeric:tabular-nums; }
  .store-warning { font-size:.76rem; }
  .store-controls { display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin:14px 0 8px; font-size:.8rem; }
  .store-controls input[type='search'] { padding:9px 10px; border:1px solid rgba(134,108,158,.5); border-radius:9px; color:inherit; background:transparent; max-width:280px; }
  .store-items { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:8px; margin-top:12px; }
  .store-item { display:flex; gap:10px; align-items:center; padding:10px; border:1px solid rgba(141,112,170,.2); border-radius:10px; min-width:0; }
  .store-art { width:54px; height:54px; flex:none; }
  .store-detail { min-width:0; display:flex; flex-direction:column; gap:4px; }
  .store-detail strong { overflow-wrap:anywhere; font-size:.84rem; }
  .store-detail small { opacity:.72; font-size:.72rem; }
  .store-more { margin-top:14px; }
  @media(max-width:600px){ .saved-store-preview{padding:14px;} .store-import{align-items:flex-start;} }
</style>