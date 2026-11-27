<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import ItemArtwork from './ItemArtwork.svelte';
  import {autoAppend} from '$lib/ui/auto-append';
  import {localSaveSession,selectLocalSaveFile,needsCollectionRead,updateCollectionRead,updateCollectionMemoryFlags,updateLocalAvatarAppearance,isCurrentLocalSaveSelection} from '$lib/ui/local-save-session';
  import { attachHistoricalStoreLabels } from './saved-store-preview.mjs';
  import { attachDb01PrivateNames } from './private-db01-names-view.ts';
  import { sanitizeSavedCollectionPresence } from './saved-collection-presence.mjs';
  import {sanitizeSavedAvatarAppearance} from '$lib/photo-mode/saved-avatar-appearance';
  import {sanitizeSavedMemoryFlags} from '$lib/media/saved-memory-flags';
  import { sanitizeSavedCollectionDiscovery } from './saved-collection-discovery.ts';
  import { sanitizePositiveListInventoryOwnership } from './saved-list-positive-ownership.mjs';
  import { sanitizeSavedGridFurnitureReferences } from './saved-grid-furniture-references.mjs';
  import { sanitizeSavedWorldDb04Join } from './saved-world-db04-join.mjs';

  export let resolveHistorical:(id:number)=>({itemId:number;label:string;family:string}|null) = ()=>null;
  export let locale = 'ja';
  export let gameImageMap: Record<string,string> = {};
  export let collectionCommitBusy = false;
  // Collection imports verified state without displaying developer diagnostics.
  export let headless = false;
  const dispatch=createEventDispatcher<{
    lookupItem:number;saveProfile:any;gridReferences:any|null;db04Join:any|null;
    saveReadStarted:undefined;saveReadFinished:undefined;saveReadError:string
  }>();
  const jsonKindLabels:Record<string,string>={
    null:'null',boolean:'真偽値',integer:'整数',number:'数値',
    string:'文字列',array:'配列',object:'オブジェクト'
  };
  const jsonKinds=Object.keys(jsonKindLabels);

  let preview: any = null;
  let collectionPreview:any=null;
  let discoveryProjection:any=null;
  let positiveOwnership:any=null;
  let gridFurniture:any=null;
  let gridQuery='';
  let gridLimit=48;
  let db04Join:any=null;
  let db04JoinBusy=false;
  let db04JoinError='';
  let lastSaveFile:File|null=null;
  let db04JoinInput:HTMLInputElement;
  let activeDb04JoinWorker:Worker|null=null;
  let db04JoinSequence=0;
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
  // The Worker receives local bytes; Rust/WASM validates profiles; UI receives only IDs.
  let activeWorker: Worker|null = null;
  let requestSequence = 0;
  let seenGlobalSaveRevision=0;
  let readStarted=false;
  function endActiveRead():void{
    if(!readStarted)return;
    readStarted=false;
    dispatch('saveReadFinished');
  }
  function selectedReadIsCurrent(revision:number,file:File):boolean{
    return revision===0||isCurrentLocalSaveSelection(revision,file);
  }

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
  function stopDb04JoinWorker(){
    db04JoinSequence++;
    activeDb04JoinWorker?.terminate();
    activeDb04JoinWorker=null;
    db04JoinBusy=false;
  }
  onDestroy(stopWorker);
  onDestroy(stopNameWorker);
  onDestroy(stopDb04JoinWorker);
  $: labeledPreview = preview && exactNameOverlay
    ? attachDb01PrivateNames(preview,exactNameOverlay,locale,{allowHistorical:allowPrivateHistorical}) : preview;
  $: collectionRows = collectionPreview ? collectionPreview.items
    .filter((item:any)=>!collectionQuery.trim() || String(item.itemId).includes(collectionQuery.trim())) : [];
  $: gridRows = gridFurniture ? gridFurniture.entries.filter((item:any)=>{
    const query=gridQuery.trim().toLocaleLowerCase();
    return !query||String(item.itemId).includes(query)||
      (resolveHistorical(item.itemId)?.label??'').toLocaleLowerCase().includes(query);
  }) : [];
  $: db04Rows = db04Join ? db04Join.entries.filter((item:any)=>{
    const query=gridQuery.trim().toLocaleLowerCase();
    return !query||String(item.itemId).includes(query)||
      (resolveHistorical(item.itemId)?.label??'').toLocaleLowerCase().includes(query);
  }) : [];
  $: shown = labeledPreview ? labeledPreview.items.filter((item:any)=>
    !query.trim() || String(item.itemId).includes(query.trim()) ||
    (item.currentExactName??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ||
    (item.privateHistoricalCandidate??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ||
    (item.historicalLabel??'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ) : [];

  function clear() {
    stopWorker();
    stopNameWorker();
    stopDb04JoinWorker();
    db04Join=null;
    db04JoinError='';
    lastSaveFile=null;
    dispatch('db04Join',null);
    exactNameOverlay = null;
    allowPrivateHistorical = false;
    exactNameError = '';
    busy = false;
    preview = null;
    collectionPreview = null;
    discoveryProjection = null;
    positiveOwnership = null;
    gridFurniture = null;
    gridQuery = '';
    gridLimit = 48;
    dispatch('gridReferences',null);
    db04Join=null;
    db04JoinError='';
    lastSaveFile=null;
    dispatch('db04Join',null);
    saveSchema = null;
    errorMessage = '';
    query = '';
    collectionQuery = '';
    collectionLimit = 48;
    showImages = false;
    limit = 48;
    if (fileInput) fileInput.value = '';
    if (exactNameInput) exactNameInput.value = '';
    endActiveRead();
  }

  function failedRead() {
    errorMessage = 'セーブファイルを読み込めませんでした。ファイル形式を確認してください。元のファイルは変更されていません。';
    dispatch('saveReadError',errorMessage);
    preview = null;
    collectionPreview = null;
    discoveryProjection = null;
    positiveOwnership = null;
    gridFurniture = null;
    gridQuery = '';
    gridLimit = 48;
    dispatch('gridReferences',null);
    db04Join=null;
    db04JoinError='';
    lastSaveFile=null;
    dispatch('db04Join',null);
    saveSchema = null;
  }

  function openLocalFile(event:Event):void {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    input.value='';
    if(!file||collectionCommitBusy)return;
    // The Collection-local chooser is a compatibility path into the same
    // shared session as the header picker and full-page drop target.
    if(headless){selectLocalSaveFile(file);return;}
    void readLocalSave(file,0);
  }

  async function readLocalSave(file:File,sessionRevision:number):Promise<void>{
    if(collectionCommitBusy||!selectedReadIsCurrent(sessionRevision,file))return;
    // Cancels any earlier Worker and invalidates its asynchronous replies.
    clear();
    busy = true;
    if(sessionRevision>0)updateCollectionRead(sessionRevision,'reading');
    readStarted=true;
    dispatch('saveReadStarted');
    const request = requestSequence;
    let saveBytes:Uint8Array|null = null;
    let worker:Worker|null = null;
    try {
      if (file.size < 1 || file.size > 128*1024*1024)
        throw new TypeError('PROFILE_SIZE_LIMIT');
      saveBytes = new Uint8Array(await file.arrayBuffer());
      if (request !== requestSequence||!selectedReadIsCurrent(sessionRevision,file)) return; // dismissed or replaced during file read
      worker = new Worker(new URL('./saved-store.worker.ts', import.meta.url),{type:'module'});
      activeWorker = worker;
      const w = worker;
      const finish = (result:any) => {
        if (activeWorker !== w || request !== requestSequence||!selectedReadIsCurrent(sessionRevision,file)) return;
        w.terminate();
        activeWorker = null;
        busy = false;
        let valid=false;
        try {
          if (result?.kind !== 'result' || result.result?.kind !== 'saved-store-summary' ||
              (result.result.saveSchema !== null &&
              (!Number.isSafeInteger(result.result.saveSchema) || result.result.saveSchema < 0)))
            throw new TypeError('LOCAL_P1G_INVALID_WORKER_REPLY');
          const historical=(result.result.summary?.items??[]).map((item:{itemId:number})=>resolveHistorical(item.itemId))
            .filter((item:unknown):item is {itemId:number;label:string;family:string}=>item!==null);
          const collection=sanitizeSavedCollectionPresence(result.result.collection);
          const discovery=sanitizeSavedCollectionDiscovery(result.result.discovery);
          const ownership=sanitizePositiveListInventoryOwnership(result.result.positiveOwnership);
          const grid=sanitizeSavedGridFurnitureReferences(result.result.gridFurniture);
          const memory=sanitizeSavedMemoryFlags(result.result.memoryFlags);
          preview = attachHistoricalStoreLabels(result.result.summary,historical);
          collectionPreview=collection;
          discoveryProjection=discovery;
          positiveOwnership=ownership;
          gridFurniture=grid;
          dispatch('gridReferences',grid);
          lastSaveFile=file;
          saveSchema = result.result.saveSchema;
          if(sessionRevision>0){updateCollectionMemoryFlags(sessionRevision,file,memory);
            // Appearance is independent of Collection admission; malformed optional data cannot block other services.
            try{updateLocalAvatarAppearance(sessionRevision,file,sanitizeSavedAvatarAppearance(result.result.avatarAppearance))}catch{}
          }
          if (discovery.entries.length||ownership.entries.length)
            dispatch('saveProfile',{discovered:discovery.entries,positiveOwned:ownership.entries});
          valid=true;
        } catch { failedRead(); }
        finally {
          if(sessionRevision>0)updateCollectionRead(sessionRevision,valid?'parsed':'invalid');
          endActiveRead();
        }
      };
      w.onmessage = event => finish(event.data);
      w.onerror = event => { event.preventDefault(); finish({kind:'error'}); };
      w.onmessageerror = () => finish({kind:'error'});
      // The source leaves the main thread by transfer. Rust/WASM in the
      // Worker determines whether it is Steam-style JSON or encrypted P1G.
      w.postMessage({command:'inspect-local-save',bytes:saveBytes},[saveBytes.buffer]);
      saveBytes = null;
    } catch {
      if (request === requestSequence) {
        worker?.terminate();
        activeWorker = null;
        busy = false;
        failedRead();
        if(sessionRevision>0)updateCollectionRead(sessionRevision,'invalid');
        endActiveRead();
      }
    } finally {
      if (saveBytes && saveBytes.byteLength) saveBytes.fill(0);
    }
  }

  // Svelte's reactive binding picks up a save selected in Home or any other
  // service, and parses it once when Collection becomes available.
  $: if(headless && $localSaveSession.revision!==seenGlobalSaveRevision &&
       (!$localSaveSession.file||!collectionCommitBusy)){
    const selection=$localSaveSession;
    seenGlobalSaveRevision=selection.revision;
    if(selection.file){
      if(needsCollectionRead(selection.revision))
        void readLocalSave(selection.file,selection.revision);
    }else{
      clear();
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
      worker=new Worker(new URL('./private-db01-names.worker.ts',import.meta.url),{type:'module'});
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

  async function importDb04Join(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||!lastSaveFile||!preview||busy||db04JoinBusy)return;
    stopDb04JoinWorker();
    db04Join=null;
    db04JoinError='';
    dispatch('db04Join',null);
    db04JoinBusy=true;
    const request=db04JoinSequence;
    let ciphertext:Uint8Array|null=null,archive:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      if(file.size<22||file.size>96*1024*1024||
         lastSaveFile.size<16||lastSaveFile.size>32*1024*1024)
        throw new TypeError('DB04_LOCAL_INPUT_SIZE');
      [ciphertext,archive]=await Promise.all([
        lastSaveFile.arrayBuffer().then(b=>new Uint8Array(b)),
        file.arrayBuffer().then(b=>new Uint8Array(b))
      ]);
      if(request!==db04JoinSequence)return;
      worker=new Worker(new URL('./saved-world-db04-join.worker.mjs',import.meta.url),{type:'module'});
      activeDb04JoinWorker=worker;
      const current=worker;
      const finish=(response:any)=>{
        if(activeDb04JoinWorker!==current||request!==db04JoinSequence)return;
        current.terminate();activeDb04JoinWorker=null;db04JoinBusy=false;
        try{
          if(response?.kind!=='result')throw new TypeError('DB04_JOIN_WORKER_ERROR');
          const valid=sanitizeSavedWorldDb04Join(response.result);
          db04Join=valid;
          dispatch('db04Join',valid);
        }catch{
          db04JoinError='DB-04資料とセーブの照合に失敗しました。ZIP構造・ゲーム版を確認してください。';
        }
      };
      current.onmessage=e=>finish(e.data);
      current.onerror=e=>{e.preventDefault();finish({kind:'error'});};
      current.onmessageerror=()=>finish({kind:'error'});
      current.postMessage({command:'join-local-db04',ciphertext,archive},
        [ciphertext.buffer,archive.buffer]);
      ciphertext=null;archive=null;
    }catch{
      if(request===db04JoinSequence){
        worker?.terminate();
        activeDb04JoinWorker=null;
        db04JoinBusy=false;
        db04JoinError='DB-04資料とセーブの照合に失敗しました。ZIP構造・ゲーム版を確認してください。';
      }
    }finally{
      if(ciphertext&&ciphertext.byteLength)ciphertext.fill(0);
      if(archive&&archive.byteLength)archive.fill(0);
      input.value='';
    }
  }
</script>

{#if headless}
  <!-- The shared header launches this input; Worker and save dispatch stay active. -->
  <input bind:this={fileInput} type="file" class="visually-hidden"
    accept=".json,.profile,.dat,application/octet-stream"
    on:change={openLocalFile} disabled={busy||collectionCommitBusy}
    aria-label="DDVのセーブファイルを選択"/>
{:else}
<section class="saved-store-preview" aria-label="セーブ内の店舗商品・コレクションIDの読み取り専用プレビュー">
  <div class="store-head">
    <div>
      <span class="store-eyebrow">LOCAL / READ-ONLY</span>
      <h2>セーブ内の参照データ</h2>
      <p>DDVのP1G形式セーブをブラウザー内で開き、Collectionの発見履歴と明確な所持記録をローカル記録に反映します。元のセーブファイルは変更も送信もしません。</p>
    </div>
    {#if preview || busy}
      <button type="button" class="store-clear" on:click={clear}>{busy?'読み込みを中止':'読み込み結果を消去'}</button>
    {/if}
  </div>
  <div class="store-import">
    <label class="store-file">
      セーブを選択
      <input bind:this={fileInput} type="file" accept=".json,.profile,.dat,application/octet-stream" on:change={openLocalFile} disabled={busy||collectionCommitBusy} aria-label="DDVのセーブファイルを選択"/>
    </label>
    <p>セーブを読み込むと、CollectionSetsの発見履歴とListInventoryで数量が正と確認できた所持状態が手動記録より優先されます。数量0・未記録・矛盾するデータは手動記録を維持します。元のセーブには書き込みません。</p>
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
        <div class="auto-sentinel" use:autoAppend={{hasMore:()=>shown.length>limit,load:()=>limit+=48}} role="status" aria-label="スクロールで店舗商品を追加表示"></div>
      {:else if !shown.length}
        <p>検索条件に一致する商品参照はありません。</p>
      {/if}
    {/if}
    {#if collectionPreview}
      <section class="saved-collection-section" aria-label="セーブ内のCollection ID参照">
        <h3>CollectionSets の保存ID参照</h3>
        <p class="store-warning">CollectionSetsの真偽値は発見履歴であり、所持状態ではありません。所持状態はListInventoryの正の数量を別途確認できた場合のみ反映します。DLC権利は推定しません。</p>
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
        {#if positiveOwnership}
          <div class="store-caveat" role="status">
            {#if positiveOwnership.status==='unsupported_schema'}
              ListInventoryの保存構造が未対応のため、所持状態の自動反映は行いません。
            {:else if positiveOwnership.status==='not_observed'||positiveOwnership.status==='incompatible_structure'}
              ListInventoryを安全に確認できません。手動の所持状態は維持します。
            {:else}
              明示的な正の数量の記録：<strong>{positiveOwnership.entries.length.toLocaleString(locale)}</strong>件。
              数量0の記録 {positiveOwnership.zeroReferences.toLocaleString(locale)}件は未所持とみなさず、手動状態を維持します。
              {#if positiveOwnership.unverifiedRoles||positiveOwnership.invalidReferences||positiveOwnership.ambiguousItemIds}
                未検証のロール・不正な参照・重複IDは自動反映から除外します。
              {/if}
              <small>Game原本によるListInventoryのAmount判定はSwitch v1.25.0で確認済みです。Steam v1.26.2での実行コードの一致は別途検証が必要です。</small>
            {/if}
          </div>
        {/if}
        {#if discoveryProjection}
          <div class="store-caveat" role="status">
            {#if discoveryProjection.status==='unsupported_schema'}
              保存構造の識別子が対象外のため、発見履歴の自動反映は行いません。
            {:else if discoveryProjection.status==='not_observed'||discoveryProjection.status==='incompatible_structure'}
              発見履歴を読み取れる構造が確認できません。既存の手動記録は維持します。
            {:else}
              発見履歴の候補 <strong>{discoveryProjection.entries.length.toLocaleString(locale)}</strong>件。
              {#if discoveryProjection.ambiguousItemIds>0}
                グループ間で値が食い違うID {discoveryProjection.ambiguousItemIds}件は上書きしません。
              {/if}
              {#if discoveryProjection.invalidReferences>0}
                型・IDが不正な参照 {discoveryProjection.invalidReferences}件は除外しています。
              {/if}
              <small>検証根拠：Switch v1.25.0のCollectionSetネイティブ解析。Steam v1.26.2との実行コード同一性は未検証です。反映対象は発見履歴のみです。</small>
            {/if}
          </div>
        {/if}
        <div class="save-shape-diagnostics">
          <h4>保存値の型（読み取り専用）</h4>
          <p>CollectionのItem IDに対応する保存値の型別件数です。値そのものやグループのState文字列は表示・保存しません。真偽値も所有・解放の意味としては扱いません。</p>
          <div class="store-metrics" aria-label="Collectionアイテム保存値の型別件数">
            {#each jsonKinds as kind}
              {#if collectionPreview.itemValueKinds[kind]>0}
                <span>{jsonKindLabels[kind]} <strong>{collectionPreview.itemValueKinds[kind].toLocaleString(locale)}</strong></span>
              {/if}
            {/each}
            {#if collectionPreview.referenceCount===0}<span>保存値は未観測</span>{/if}
          </div>
          <h4>グループStateの型</h4>
          <div class="store-metrics" aria-label="CollectionグループStateの型別件数">
            {#each jsonKinds as kind}
              {#if collectionPreview.groupStateKinds[kind]>0}
                <span>{jsonKindLabels[kind]} <strong>{collectionPreview.groupStateKinds[kind].toLocaleString(locale)}</strong></span>
              {/if}
            {/each}
            {#if collectionPreview.observedGroups===0}<span>グループは未観測</span>{/if}
          </div>
        </div>
        {#if collectionPreview.items.length}
          <div class="store-controls">
            <input type="search" aria-label="セーブ内のCollection IDを検索"
              placeholder="Item ID" bind:value={collectionQuery} on:input={()=>collectionLimit=48}/>
          </div>
          <div class="store-items">
            {#each collectionRows.slice(0,collectionLimit) as item (item.itemId)}
              {@const catalog=resolveHistorical(item.itemId)}
              <div class="store-item">
                <div class="store-detail">
                  <strong>{catalog?.label??`Item ID ${item.itemId}`}</strong>
                  <small>Item ID {item.itemId} · 参照 {item.referenceCount}件</small>
                  <small>{catalog?'公開カタログの同一ID（セーブ版一致は未検証）':'公開カタログに未収録のID'}</small>
                  {#if catalog}
                    <button type="button" class="store-clear" on:click={()=>dispatch('lookupItem',item.itemId)}>Collectionで探す</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
          {#if collectionRows.length>collectionLimit}
            <div class="auto-sentinel" use:autoAppend={{hasMore:()=>collectionRows.length>collectionLimit,load:()=>collectionLimit+=48}} role="status" aria-label="スクロールで保存ID参照を追加表示"></div>
          {:else if !collectionRows.length}
            <p>該当するID参照はありません。</p>
          {/if}
        {/if}
      </section>
    {/if}
    {#if gridFurniture}
      <section class="saved-collection-section" aria-label="セーブ内の家具配置参照">
        <h3>ワールドの家具参照</h3>
        <p class="store-warning">セーブ内のGridObjectを読み取った結果です。初期配置・クエスト・自動生成の家具も含む可能性があり、プレイヤーの所持や解放を証明しません。差分グリッドの初期配置データは含まれないため、完全な配置数ではありません。手動Collection記録とセーブファイルは変更しません。</p>
        <div class="private-db01-import">
          <label class="store-file">DB-04 Steam v1.26.2 原本ZIP（任意）
            <input bind:this={db04JoinInput} type="file" accept=".zip,application/zip"
              aria-label="DB-04 原本ZIPで初期配置との差分を照合"
              on:change={importDb04Join} disabled={db04JoinBusy||busy}/>
          </label>
          <p>原本ZIPと選択済みP1Gをブラウザー内で照合します。通常Gridは原本パスの一致を、差分Gridは原本レイアウト・種類・Grid ID・2つのハッシュの一致を確認します。現在のDB-04原本ZIPには差分Grid用のハッシュ検証資料がないため、該当グリッドの完全な初期配置は計算対象から除外します。所有・解放・手動数量は変更しません。</p>
        </div>
        {#if db04JoinBusy}
          <p class="store-caveat" role="status">DB-04原本とセーブをローカルで照合中…</p>
        {:else if db04JoinError}
          <p class="store-error" role="alert">{db04JoinError}</p>
        {:else if db04Join}
          <div class="store-caveat" role="status">
            {#if db04Join.status==='unsupported_source_or_schema'}
              DB-04のSteam v1.26.2資料または対応するセーブ構造ではありません。パスの推測は行いません。
            {:else if db04Join.status==='not_observed'}
              セーブ内のGridCollectionを確認できません。
            {:else if db04Join.status==='no_exact_source_match'}
              原本と十分に照合できたグリッドはありません。差分Gridの原本ハッシュ未検証 {db04Join.hashUnverifiedGrids}件、ハッシュ不一致 {db04Join.hashMismatchGrids}件。完全な差分計算は行いません。
            {:else}
              原本パスによる照合：<strong>{db04Join.matchedGrids}</strong> / {db04Join.observedGrids}保存グリッド。
              原本オブジェクト参照 {db04Join.sourceDefaultObjects}件、
              差分適用後の参照 {db04Join.effectiveObjects}件。
              {#if db04Join.status==='partial_exact_matches'}
                未照合のグリッドがあります（原本候補未一致 {db04Join.unresolvedGrids}件、原本不足 {db04Join.partialSourceGrids}件、ハッシュ未検証 {db04Join.hashUnverifiedGrids}件、ハッシュ不一致 {db04Join.hashMismatchGrids}件、構造不正 {db04Join.invalidGrids}件）。
              {/if}
            {/if}
            <small>照合対象グリッド内の候補集計です。原本ZIPの真正性、ワールド全体の網羅性、ユーザーによる配置・所有は未検証です。</small>
          </div>
          {#if db04Rows.length}
            <div class="store-items">
              {#each db04Rows.slice(0,gridLimit) as item (item.itemId)}
                {@const catalog=resolveHistorical(item.itemId)}
                <div class="store-item"><div class="store-detail">
                  <strong>{catalog?.label??`Item ID ${item.itemId}`}</strong>
                  <small>原本の初期参照 {item.sourceDefault}件 · 照合グリッド内の差分適用後 {item.effectiveSaved}件</small>
                  <small>原本にない保存ID {item.savedOnlyIdentity}件 · 削除された初期ID {item.removedDefaultIdentity}件</small>
                  <small>プレイヤーの所持数や総配置数ではありません。</small>
                </div></div>
              {/each}
            </div>
            {#if db04Rows.length>gridLimit}
              <div class="auto-sentinel" use:autoAppend={{hasMore:()=>db04Rows.length>gridLimit,load:()=>gridLimit+=48}} role="status" aria-label="スクロールでDB-04照合結果を追加表示"></div>
            {/if}
          {/if}
        {/if}
        {#if gridFurniture.status==='unsupported_schema'}
          <p class="store-caveat">このセーブ構造は配置参照の観測対象外です。</p>
        {:else if gridFurniture.status==='not_observed'||gridFurniture.status==='incompatible_structure'}
          <p class="store-caveat">World.GridCollectionの保存構造を確認できません。配置がないことを意味しません。</p>
        {:else}
          <div class="store-metrics">
            <span>保存済み全体グリッド <strong>{gridFurniture.observedFullGrids.toLocaleString(locale)}</strong></span>
            <span>保存済み差分グリッド <strong>{gridFurniture.observedDiffGrids.toLocaleString(locale)}</strong></span>
            <span>家具の保存参照 <strong>{(gridFurniture.fullReferences+gridFurniture.diffModifiedReferences).toLocaleString(locale)}</strong></span>
            <span>異なるItem ID <strong>{gridFurniture.entries.length.toLocaleString(locale)}</strong></span>
          </div>
          {#if gridFurniture.status==='partial_inconclusive'}
            <p class="store-caveat">無効な参照 {gridFurniture.invalidRecords}件、または解析上限超過のため、表示は部分的です。未表示の家具が存在しないとは限りません。</p>
          {/if}
          {#if gridFurniture.entries.length}
            <div class="store-controls">
              <input type="search" aria-label="保存された家具のItem ID・名前を検索"
                placeholder="家具名・Item ID" bind:value={gridQuery} on:input={()=>gridLimit=48}/>
            </div>
            <div class="store-items">
              {#each gridRows.slice(0,gridLimit) as item (item.itemId)}
                {@const catalog=resolveHistorical(item.itemId)}
                <div class="store-item"><div class="store-detail">
                  <strong>{catalog?.label??`Item ID ${item.itemId}`}</strong>
                  <small>Item ID {item.itemId} · 全体グリッド {item.fullGridReferences}件 · 差分参照 {item.diffModifiedReferences}件</small>
                  <small>記録上の参照数であり、総配置数・プレイヤー所持数ではありません。</small>
                  {#if catalog}
                    <button type="button" class="store-clear" on:click={()=>dispatch('lookupItem',item.itemId)}>Collectionで探す</button>
                  {/if}
                </div></div>
              {/each}
            </div>
            {#if gridRows.length>gridLimit}
              <div class="auto-sentinel" use:autoAppend={{hasMore:()=>gridRows.length>gridLimit,load:()=>gridLimit+=48}} role="status" aria-label="スクロールで家具参照を追加表示"></div>
            {:else if !gridRows.length}
              <p>一致する家具の保存参照はありません。</p>
            {/if}
          {/if}
        {/if}
      </section>
    {/if}
  {/if}
</section>
{/if}

<style>
  .saved-store-preview { margin:20px 0; padding:22px; border:1px solid rgba(150,126,190,.32); border-radius:18px; background:rgba(133,106,161,.065); }
  .store-head { display:flex; gap:20px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
  .store-head h2 { font-size:1.2rem; margin:.3rem 0 .35rem; }
  .store-head p,.store-import p,.store-warning { font-size:.83rem; line-height:1.65; opacity:.85; max-width:78ch; margin:.35rem 0 .65rem; }
  .store-eyebrow { font-size:.68rem; letter-spacing:.12em; opacity:.7; }
  .store-clear,.store-more { border:1px solid #947aa7; border-radius:9px; padding:.55rem .85rem; background:transparent; color:inherit; cursor:pointer; }
  .store-import { display:none; } /* Save chooser is in the global toolbar. */
  .auto-sentinel {min-height:22px;margin:14px 0;}
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
  .saved-collection-section .store-caveat small {display:block;margin-top:6px;opacity:.75;font-size:.72rem;}
  .save-shape-diagnostics {padding:10px 12px;border:1px solid rgba(150,126,190,.23);border-radius:10px;margin:12px 0;}
  .save-shape-diagnostics h4 {font-size:.83rem;margin:0 0 6px;}
  .save-shape-diagnostics p {font-size:.75rem;opacity:.8;margin:0 0 8px;line-height:1.6;}
  .save-shape-diagnostics .store-metrics {margin:0 0 10px;}
  .saved-collection-section .store-detail .store-clear {font-size:.7rem;align-self:flex-start;padding:5px 9px;margin-top:4px;}
  @media(max-width:600px){ .saved-store-preview{padding:14px;} .store-import{align-items:flex-start;} }
</style>