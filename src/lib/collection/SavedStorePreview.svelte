<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import { attachHistoricalStoreLabels } from './saved-store-preview.mjs';
  import { attachDb01PrivateNames } from './private-db01-names-view.mjs';
  import { sanitizeSavedCollectionPresence } from './saved-collection-presence.mjs';

  export let resolveHistorical:(id:number)=>({itemId:number;label:string;family:string}|null) = ()=>null;
  export let locale = 'ja';
  export let gameImageMap: Record<string,string> = {};
  const dispatch=createEventDispatcher<{ lookupItem:number }>();

  let preview: any = null;
  let collectionPreview:any=null;
  let collectionQuery='';
  let collectionLimit=48;
  let errorMessage = '';
  let busy = false;
  let query = '';
  let limit = 48;
  let showImages = false;
  let fileInput: HTMLInputElement;
  let saveSchema: number|null = null;
  let exactNameOverlay:any = null;
  let exactNameError = '';
  let exactNameBusy = false;
  let allowPrivateHistorical = false;
  let exactNameInput:HTMLInputElement;
  let activeNameWorker:Worker|null = null;
  let nameSequence = 0;

  // No DB-02 private source corpus is published to the static site.
  // The Worker receives only ciphertext; the UI receives only ID counts.
  let activeWorker: Worker|null = null;
  let requestSequence = 0;

  function stopWorker() {
    requestSequence++;
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
  }
  function stopNameWorker() {
    nameSequence++;
    if(activeNameWorker) activeNameWorker.terminate();
    activeNameWorker=null;
    exactNameBusy=false;
  }
  onDestroy(stopWorker);
  onDestroy(stopNameWorker);
  $: labeledPreview = preview && exactNameOverlay
    ? attachDb01PrivateNames(preview,exactNameOverlay,locale,{allowHistorical:allowPrivateHistorical}) : preview;
  $: collectionRows = collectionPreview ? collectionPreview.items
    .map((item:any)=>({ ...item, catalog:resolveHistorical(item.itemId) }))
    .filter((item:any)=>!collectionQuery.trim() || String(item.itemId).includes(collectionQuery.trim()) ||
      (item.catalog?.label??'').toLocaleLowerCase().includes(collectionQuery.trim().toLocaleLowerCase())) : [];
  $: shown = labeledPreview ? labeledPreview.items.filter((item:any)=>
    !query.trim() || String(item.itemId).includes(query.trim()) ||
    (item.currentExactName??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ||
    (item.privateHistoricalCandidate??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ||
    (item.historicalLabel??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ) : [];

  function clear() {
    stopWorker();
    stopNameWorker();
    exactNameOverlay = null;
    allowPrivateHistorical = false;
    exactNameError = '';
    busy = false;
    preview = null;
    collectionPreview = null;
    saveSchema = null;
    errorMessage = '';
    query = '';
    collectionQuery = '';
    collectionLimit = 48;
    showImages = false;
    limit = 48;
    if (fileInput) fileInput.value = '';
    if (exactNameInput) exactNameInput.value = '';
  }

  function failedRead() {
    errorMessage = 'このセーブは読み取れませんでした。対応するP1G形式・データ構造を確認してください。元のファイルは変更されていません。';
    preview = null;
    collectionPreview = null;
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
          const historical=(result.result.summary?.items??[]).map((item:{itemId:number})=>resolveHistorical(item.itemId))
            .filter((item:unknown):item is {itemId:number;label:string;family:string}=>item!==null);
          const collection=sanitizeSavedCollectionPresence(result.result.collection);
          preview = attachHistoricalStoreLabels(result.result.summary,historical);
          collectionPreview=collection;
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

  async function openDb01LocalZip(event:Event) {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||!preview||busy||exactNameBusy)return;
    stopNameWorker();
    exactNameOverlay=null;
    allowPrivateHistorical=false;
    exactNameError='';
    exactNameBusy=true;
    const request=nameSequence;
    let archive:Uint8Array|null=null;
    let worker:Worker|null=null;
    try {
      if(file.size<22||file.size>40*1024*1024)throw new Error('PRIVATE_DB01_ZIP_SIZE');
      archive=new Uint8Array(await file.arrayBuffer());
      if(request!==nameSequence)return;
      worker=new Worker(new URL('./private-db01-names.worker.mjs',import.meta.url),{type:'module'});
      activeNameWorker=worker;
      const w=worker;
      const finish=(result:any)=>{
        if(activeNameWorker!==w||request!==nameSequence)return;
        w.terminate();activeNameWorker=null;exactNameBusy=false;
        try {
          if(result?.kind!=='result'||!result.result)throw new TypeError('PRIVATE_DB01_RESULT');
          // No private names are written to Collection state or storage.
          attachDb01PrivateNames(preview,result.result,locale);
          exactNameOverlay=result.result;
        } catch {
          exactNameOverlay=null;
          exactNameError='DB-01の検証済みZIPを確認できませんでした。原本は変更されていません。';
        }
      };
      w.onmessage=event=>finish(event.data);
      w.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      w.onmessageerror=()=>finish({kind:'error'});
      w.postMessage({command:'inspect-private-db01',archive,
        itemIds:preview.items.map((item:any)=>item.itemId)},[archive.buffer]);
      archive=null;
    } catch {
      if(request===nameSequence){
        worker?.terminate();activeNameWorker=null;exactNameBusy=false;
        exactNameError='DB-01の検証済みZIPを確認できませんでした。';
      }
    } finally {
      if(archive&&archive.byteLength)archive.fill(0);
      input.value='';
    }
  }
</script>

<section class="saved-store-preview" aria-label="セーブ内の店舗商品・コレクションIDの読み取り専用プレビュー">
  <div class="store-head">
    <div>
      <span class="store-eyebrow">LOCAL / READ-ONLY</span>
      <h2>セーブ内の参照データ</h2>
      <p>DDVのP1G形式セーブを専用のブラウザー内Workerで開き、店舗商品とCollectionSetsのアイテムID参照を表示します。ファイルの送信・編集・保存は行いません。</p>
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
        店舗に保存された商品参照のみを表示します。現在の販売商品・在庫・価格、購入履歴、所有・収集状態は確認できません。
      {/if}
    </div>
    <div class="store-metrics">
      <span>セーブ構造 <strong>{saveSchema??'不明'}</strong></span>
      <span>店舗 <strong>{preview.savedStoreCount}</strong></span>
      <span>スロット <strong>{preview.savedSlotCount}</strong></span>
      <span>商品参照 <strong>{preview.savedItemReferenceCount}</strong></span>
      <span>商品種類 <strong>{preview.distinctItemCount}</strong></span>
    </div>
    <p class="store-warning">標準の名称・画像は旧バージョンの参考情報です。実セーブのゲーム版は未確定であり、現在の販売・購入状況を表しません。</p>
    <div class="private-db01-import">
      <label class="store-file">検証済み Steam v1.26.2 DB-01 資料（任意）
        <input bind:this={exactNameInput} type="file" accept=".zip,application/zip" aria-label="非公開 DB-01 ZIP をローカルで選択"
          on:change={openDb01LocalZip} disabled={exactNameBusy || busy}/>
      </label>
      {#if exactNameBusy}<span role="status">この端末内で DB-01 の出典と名称を検証中…</span>{/if}
      {#if exactNameOverlay}
        <span role="status">Steam v1.26.2 の正式確認済み名称：{labeledPreview.exactSourceNameCount}種類。セーブ版一致は未確認です。</span>
        <label><input type="checkbox" bind:checked={allowPrivateHistorical}/> v1.26.1 由来の参考名候補を表示（v1.26.2未検証）</label>
        {#if allowPrivateHistorical}<span>旧版参考名候補：{labeledPreview.historicalCandidateCount}種類</span>{/if}
      {/if}
      {#if exactNameError}<span role="alert" class="store-error">{exactNameError}</span>{/if}
      {#if exactNameBusy}<button type="button" class="store-clear" on:click={stopNameWorker}>検証を中止</button>{/if}
      {#if exactNameOverlay}<button type="button" class="store-clear" on:click={()=>{exactNameOverlay=null;}}>名称を解除</button>{/if}
      <p>ZIP は外部へ送信しません。独立した SHA-256 検証に成功したデータだけを使用します。旧版の名称候補は明示的に選んだ場合のみ、正式名称と区別して表示します。</p>
    </div>
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
              <strong>{item.currentExactName ?? item.privateHistoricalCandidate ?? item.historicalLabel ?? `Item ID ${item.itemId}`}</strong>
              <small>ID {item.itemId} {#if item.currentExactName}· Steam v1.26.2 原本確認名{#if item.currentExactNameLocale!==locale} ({item.currentExactNameLocale}){/if} · セーブ版同一性未確認{:else if item.privateHistoricalCandidate}· Steam v1.26.1 参考名候補（v1.26.2未検証）{:else if item.historicalLabel}· 旧版参考名{/if}</small>
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
    {#if collectionPreview}
      <section class="saved-collection-section" aria-label="セーブ内のCollection ID参照">
        <h3>CollectionSets の保存ID参照</h3>
        <p class="store-warning">セーブ内の <code>Player.CollectionSets[].GroupData[].GroupsCollectionItems</code> にあるIDキーの存在だけを表示します。保存された値は判定せず、所持・収集完了・解放・DLC権利を証明しません。Collectionの手動記録も変更しません。</p>
        {#if collectionPreview.status==='not_observed'}
          <p class="store-caveat">CollectionSets フィールドは確認できませんでした。セーブを改変している場合も含め、収集状態やデータ破損を意味しません。</p>
        {:else if collectionPreview.status==='partial_inconclusive'}
          <p class="store-caveat">一部の構造を解釈できない、または参照件数の上限に達しました。表示内容は部分的な観測です。セーブ破損とは断定しません。</p>
        {:else if collectionPreview.status==='observed_empty'}
          <p class="store-caveat">CollectionSets は確認できましたが、この読込で有効なアイテムIDキーは観測されませんでした。未所持である証拠ではありません。</p>
        {/if}
        <div class="store-metrics">
          <span>CollectionSets <strong>{collectionPreview.observedSets}</strong></span>
          <span>グループ <strong>{collectionPreview.observedGroups}</strong></span>
          <span>保存ID参照 <strong>{collectionPreview.referenceCount.toLocaleString(locale)}</strong></span>
          <span>異なるID <strong>{collectionPreview.distinctItemCount.toLocaleString(locale)}</strong></span>
        </div>
        {#if collectionPreview.items.length}
          <div class="store-controls">
            <input type="search" aria-label="セーブ内のCollection IDまたは参照名で検索"
              placeholder="Item ID / カタログ名" bind:value={collectionQuery} on:input={()=>collectionLimit=48}/>
          </div>
          <div class="store-items">
            {#each collectionRows.slice(0,collectionLimit) as item (item.itemId)}
              <div class="store-item">
                <div class="store-detail">
                  <strong>{item.catalog?.label??`Item ID ${item.itemId}`}</strong>
                  <small>Item ID {item.itemId} · 参照 {item.referenceCount}件</small>
                  <small>{item.catalog?'公開カタログの同一ID（セーブ版一致は未検証）':'公開カタログに未収録のID'}</small>
                  {#if item.catalog}
                    <button type="button" class="store-clear" on:click={()=>dispatch('lookupItem',item.itemId)}>Collectionで探す</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
          {#if collectionRows.length>collectionLimit}
            <button type="button" class="store-more" on:click={()=>collectionLimit+=48}>
              さらに表示（残り {collectionRows.length-collectionLimit}件）
            </button>
          {:else if !collectionRows.length}
            <p>該当するID参照はありません。</p>
          {/if}
        {/if}
      </section>
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
  .private-db01-import {display:flex; flex-wrap:wrap; align-items:center; gap:10px; border:1px dashed rgba(134,108,158,.45); padding:12px; border-radius:10px; margin:12px 0;}
  .private-db01-import p{width:100%;margin:0;font-size:.76rem;opacity:.8;}
  .store-items { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:8px; margin-top:12px; }
  .store-item { display:flex; gap:10px; align-items:center; padding:10px; border:1px solid rgba(141,112,170,.2); border-radius:10px; min-width:0; }
  .store-art { width:54px; height:54px; flex:none; }
  .store-detail { min-width:0; display:flex; flex-direction:column; gap:4px; }
  .store-detail strong { overflow-wrap:anywhere; font-size:.84rem; }
  .store-detail small { opacity:.72; font-size:.72rem; }
  .store-more { margin-top:14px; }
  .saved-collection-section { margin-top:20px; padding-top:18px; border-top:1px solid rgba(150,126,190,.3); }
  .saved-collection-section h3 {font-size:1rem; margin:0 0 8px;}
  .saved-collection-section .store-detail .store-clear {font-size:.7rem;align-self:flex-start;padding:5px 9px;margin-top:4px;}
  @media(max-width:600px){ .saved-store-preview{padding:14px;} .store-import{align-items:flex-start;} }
</style>