<script lang="ts">
  import {onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {Db00ItemContext} from '../../../lib/save/common-db-context';
  import type {SavedGridItemReference} from '../../../lib/save/save-world-db04-context';

  // Development-only local editor: preview is metadata-only, and explicit
  // edited-copy export never overwrites the source. No production Writer.
  let fileInput:HTMLInputElement|null=null;
  let kind:'inventory'|'chest'='inventory';
  let inventoryId='100';
  let itemId='550';
  let containerId='202';
  let slotIndex='1';
  let chestItemId='440';
  let expected='7';
  let replacement='12';
  let result:'changed'|'unchanged'|'error'|null=null;
  let active:Worker|null=null;
  let processing=false;
  let revision=0;
  type EditTarget =
    | {kind:'inventory';inventoryId:string;itemId:string}
    | {kind:'chest';containerId:string;slotIndex:number;itemId:number};
  type BatchEdit={target:EditTarget;expected:number;replacement:number};
  type PreviewSnapshot =
    | {mode:'single';file:File;format:'json'|'auto';target:EditTarget;
       expected:number;replacement:number;signature:string}
    | {mode:'batch';file:File;format:'json'|'auto';edits:BatchEdit[];
       signature:string};
  let queuedEdits:BatchEdit[]=[];
  // A pending batch belongs to one selected Save. Edits may be staged before
  // the first file is chosen, but must never carry over to another file.
  let fileSelected=false;
  type EditableSlot =
    | {kind:'inventory';inventoryId:string;itemId:string;amount:number}
    | {kind:'chest';containerId:string;slotIndex:number;itemId:number;amount:number};
  let savedSlots:EditableSlot[]=[];
  let savedSlotsFile:File|null=null;
  let worldRefs:SavedGridItemReference[]=[];
  let worldStatus:'not_observed'|'incompatible_structure'|'partial_inconclusive'|
    'observed_no_item_refs'|'saved_item_refs'='not_observed';
  let worldQuery='';
  let db04Input:HTMLInputElement|null=null;
  type Db04GridMatch={
    contract:'wand.db05.db04-grid-path-match@1';
    status:string;observedFullGrids:number;matchedFullGrids:number;
    notInPartialSourceFullGrids:number;ambiguousSourceFullGrids:number;
    malformedFullGrids:number;observedDiffGrids:number;
    hashUnverifiedDiffGrids:number;malformedDiffGrids:number;
    sourceCoverageComplete:false;sourceOriginalArchiveRechecked:false;
    saveGridNumericIdUsedAsNativeKey:false;diffIdentityVerified:false;
    worldCoordinatesVerified:false;playerPlacementVerified:false;
    nativeDefaultObjectEquivalenceVerified:false;saveWritingAuthorized:false;
  };
  let db04Match:Db04GridMatch|null=null;
  let db04State:'idle'|'reading'|'verified'|'error'='idle';

  let slotState:'idle'|'loading'|'ready'|'error'='idle';
  let slotQuery='';
  let slotFilter:'all'|'inventory'|'chest'='all';
  let dbMap=new Map<string,Db00ItemContext>();
  let dbStatus:'idle'|'loading'|'ready'|'unavailable'='idle';
  let dbWorker:Worker|null=null;
  let catalogRevision=0;
  $: visibleSlots=savedSlots.filter(slot=>{
    if(slotFilter!=='all' && slot.kind!==slotFilter)return false;
    const id=String(slot.itemId);
    const meta=dbMap.get(id);
    const query=slotQuery.trim().toLocaleLowerCase();
    return !query || id.includes(query) ||
      (meta?.name??'').toLocaleLowerCase().includes(query) ||
      (meta?.category??'').toLocaleLowerCase().includes(query);
  }).slice(0,120);
  $: visibleWorldRefs=worldRefs.filter(row=>{
    const meta=dbMap.get(row.itemId);
    const q=worldQuery.trim().toLocaleLowerCase();
    return !q||row.itemId.includes(q)||
      (meta?.name??'').toLocaleLowerCase().includes(q)||
      (meta?.category??'').toLocaleLowerCase().includes(q);
  }).slice(0,100);
  let snapshot:PreviewSnapshot|null=null;
  let downloadUrl:string|null=null;
  let downloadName='';
  let exportReady=false;
  const MAX_BYTES=128*1024*1024;
  function discardDownload(){
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);
    downloadUrl=null;
    downloadName='';
    exportReady=false;
  }
  function parameters(){
    const old=uint32(expected),next=uint32(replacement);
    const target:EditTarget=kind==='inventory'
      ? {kind,inventoryId,itemId}
      : {kind,containerId,slotIndex:Number(slotIndex),itemId:Number(chestItemId)};
    const format:'json'|'auto'=fileInput?.files?.[0]?.name.toLowerCase().endsWith('.json')?'json':'auto';
    return {expected:old,replacement:next,target,format,
      signature:JSON.stringify({expected:old,replacement:next,target,format})};
  }
  function copiedName(name:string):string{
    const safe=name.replace(/[\\/\u0000-\u001f]/g,'_');
    const dot=safe.lastIndexOf('.');
    return dot>0
      ? safe.slice(0,dot)+'.wand-edited'+safe.slice(dot)
      : safe+'.wand-edited.profile';
  }

  function cancel(){
    revision++;
    active?.terminate();
    active=null;
    processing=false;
    snapshot=null;
    discardDownload();
  }
  onDestroy(()=>{
    cancel();
    dbWorker?.terminate();
    catalogRevision++;
  });
  function onFileChange(){
    if(fileSelected)queuedEdits=[];
    fileSelected=Boolean(fileInput?.files?.[0]);
    cancel();
    result=null;
    dbWorker?.terminate();dbWorker=null;catalogRevision++;
    savedSlots=[];savedSlotsFile=null;slotState='idle';
    worldRefs=[];worldStatus='not_observed';worldQuery='';
    db04Match=null;db04State='idle';
    dbMap=new Map();dbStatus='idle';
  }
  function selectSavedSlot(slot:EditableSlot){
    cancel();
    result=null;
    kind=slot.kind;
    if(slot.kind==='inventory'){
      inventoryId=slot.inventoryId;itemId=slot.itemId;
    }else{
      containerId=slot.containerId;
      slotIndex=String(slot.slotIndex);
      chestItemId=String(slot.itemId);
    }
    expected=String(slot.amount);
    replacement=String(Math.min(0xffffffff,slot.amount+1));
  }
  function beginCatalogLookup(rows:readonly EditableSlot[],file:File,
    gridRows:readonly SavedGridItemReference[]){
    dbWorker?.terminate();
    const request=++catalogRevision;
    dbStatus='loading';
    const ids=[...new Set([
      ...rows.map(row=>String(row.itemId)),
      ...gridRows.map(row=>row.itemId)
    ])];
    const worker=new Worker(
      new URL('../../../lib/save/save-catalog.worker.ts',import.meta.url),
      {type:'module'}
    );
    dbWorker=worker;
    const done=(reply:unknown)=>{
      if(request!==catalogRevision||dbWorker!==worker||
         savedSlotsFile!==file)return;
      worker.terminate();dbWorker=null;
      const r=reply as {
        kind?:string;contract?:string;editPermissionFromDb?:boolean;
        lookup?:{rows?:Db00ItemContext[]};
      };
      if(r?.kind!=='resolved'||
         r.contract!=='wand.db05.db00-visible-item-mapping@1'||
         r.editPermissionFromDb!==false||!Array.isArray(r.lookup?.rows)){
        dbStatus='unavailable';return;
      }
      dbMap=new Map(r.lookup.rows.map(row=>[row.itemId,row]));
      dbStatus='ready';
    };
    worker.onmessage=event=>done(event.data);
    worker.onerror=event=>{event.preventDefault();done({kind:'error'});};
    worker.onmessageerror=()=>done({kind:'error'});
    worker.postMessage({command:'resolve-db00-item-ids',base,ids});
  }
  async function matchLocalDb04(){
    cancel();result=null;
    db04State='idle';db04Match=null;
    const save=savedSlotsFile;
    const source=db04Input?.files?.[0];
    if(!save||fileInput?.files?.[0]!==save ||
       !source||source.size<1||source.size>64*1024*1024||
       save.size<1||save.size>MAX_BYTES){
      db04State='error';return;
    }
    const format:'auto'|'json'=save.name.toLowerCase().endsWith('.json')
      ?'json':'auto';
    db04State='reading';processing=true;
    let bytes:Uint8Array|null=null;
    let graph:Uint8Array|null=null;
    let worker:Worker|null=null;
    const request=revision;
    try{
      [bytes,graph]=await Promise.all([
        save.arrayBuffer().then(buf=>new Uint8Array(buf)),
        source.arrayBuffer().then(buf=>new Uint8Array(buf))
      ]);
      if(request!==revision)return;
      worker=new Worker(
        new URL('../../../lib/save/save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const own=worker;
      const finish=(response:unknown)=>{
        if(request!==revision||active!==own)return;
        own.terminate();active=null;processing=false;
        const r=response as {kind?:string;receipt?:Db04GridMatch};
        if(r?.kind!=='db04'||r.receipt?.contract!==
           'wand.db05.db04-grid-path-match@1'||
           r.receipt.sourceCoverageComplete!==false||
           r.receipt.sourceOriginalArchiveRechecked!==false||
           r.receipt.saveGridNumericIdUsedAsNativeKey!==false||
           r.receipt.diffIdentityVerified!==false||
           r.receipt.saveWritingAuthorized!==false){
          db04State='error';return;
        }
        db04Match=r.receipt;db04State='verified';
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'inspect-db04-grid-paths',format,bytes,graph
      },[bytes.buffer,graph.buffer]);
      bytes=null;graph=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        db04State='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
      if(graph?.byteLength)graph.fill(0);
    }
  }

  async function loadSavedSlots(){
    cancel();result=null;
    const file=fileInput?.files?.[0];
    if(!file||file.size<1||file.size>MAX_BYTES){
      slotState='error';return;
    }
    const name=file.name.toLocaleLowerCase();
    const format=name.endsWith('.json')?'json':
      /\.(profile|dat|bin)$/.test(name)?'auto':null;
    if(!format){slotState='error';return;}
    slotState='loading';
    savedSlots=[];savedSlotsFile=null;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    const request=revision;
    processing=true;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('../../../lib/save/save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const ownedWorker=worker;
      const finish=(reply:unknown)=>{
        if(request!==revision||active!==ownedWorker)return;
        ownedWorker.terminate();active=null;processing=false;
        const r=reply as {
          kind?:string;contract?:string;complete?:boolean;
          writerAuthorized?:boolean;rows?:EditableSlot[];
          grid?:{contract?:string;status?:typeof worldStatus;
            entries?:SavedGridItemReference[];
            playerPlacementVerified?:boolean;
            effectivePlacedCountVerified?:boolean;
            worldSourceMatched?:boolean;
            saveWritingAuthorized?:boolean};
        };
        if(r?.kind!=='slots'||r.contract!=='wand.db05.editable-slots@1'||
           r.complete!==true||r.writerAuthorized!==false||
           !Array.isArray(r.rows)||
           r.grid?.contract!=='wand.db05.saved-grid-item-refs@1'||
           r.grid.playerPlacementVerified!==false||
           r.grid.effectivePlacedCountVerified!==false||
           r.grid.worldSourceMatched!==false||
           r.grid.saveWritingAuthorized!==false||
           !['not_observed','incompatible_structure','partial_inconclusive',
             'observed_no_item_refs','saved_item_refs'].includes(
               String(r.grid.status))||
           !Array.isArray(r.grid.entries)){
          slotState='error';return;
        }
        savedSlots=r.rows;savedSlotsFile=file;slotState='ready';
        worldRefs=r.grid.entries;worldStatus=r.grid.status!;
        beginCatalogLookup(r.rows,file,worldRefs);
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(
        {command:'inspect-existing-slots',format,bytes},[bytes.buffer]
      );
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();active=null;processing=false;
        slotState='error';
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }
  function uint32(x:string):number|null{
    if(!/^(?:0|[1-9][0-9]*)$/.test(x))return null;
    const n=Number(x);
    return Number.isSafeInteger(n)&&n>0&&n<=0xffffffff?n:null;
  }
  function identity(x:string):boolean{
    return /^[0-9]{1,20}$/.test(x)&&BigInt(x)>0n&&BigInt(x)<=BigInt('18446744073709551615');
  }
  function queueCurrentEdit(){
    cancel();result=null;
    const old=uint32(expected),next=uint32(replacement);
    const candidate=parameters().target;
    const valid=candidate.kind==='inventory'
      ? identity(candidate.inventoryId)&&identity(candidate.itemId)
      : identity(candidate.containerId)&&uint32(String(candidate.itemId))!==null&&
        Number.isInteger(candidate.slotIndex)&&candidate.slotIndex>=0&&
        candidate.slotIndex<=1000000;
    if(old===null||next===null||old===next||!valid||
       queuedEdits.length>=16||
       queuedEdits.some(e=>JSON.stringify(e.target)===JSON.stringify(candidate))){
      result='error';return;
    }
    queuedEdits=[...queuedEdits,{target:candidate,expected:old,replacement:next}];
  }
  function removeQueued(index:number){
    cancel();result=null;
    queuedEdits=queuedEdits.filter((_,i)=>i!==index);
  }
  function batchSignature():string{return JSON.stringify(queuedEdits);}

  async function preview(batchMode:boolean=false){
    cancel();
    result=null;
    const file=fileInput?.files?.[0];
    const old=uint32(expected),next=uint32(replacement);
    if(!file||!file.size||file.size>MAX_BYTES||
      (batchMode
        ? queuedEdits.length===0||queuedEdits.length>16
        : old===null||next===null||
          (kind==='inventory'
            ? !identity(inventoryId)||!identity(itemId)
            : !identity(containerId)||!uint32(chestItemId)||
              !/^(?:0|[1-9][0-9]*)$/.test(slotIndex)||
              Number(slotIndex)>1000000))){
      result='error';
      return;
    }
    const lower=file.name.toLowerCase();
    const format=lower.endsWith('.json')?'json':
      /\.(profile|dat|bin)$/.test(lower)?'auto':null;
    if(!format){result='error';return;}
    const params=parameters();
    const request=revision;
    processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('../../../lib/save/save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const activeWorker=worker;
      const finish=(response:unknown)=>{
        if(request!==revision||active!==activeWorker)return;
        activeWorker.terminate();
        active=null;
        processing=false;
        const r=response as {kind?:string;receipt?:Record<string,unknown>};
        const good=r?.kind==='result'&&
          r.receipt?.writerAuthorized===false&&
          r.receipt?.exportAuthorized===false&&
          r.receipt?.lexicalBytesPreserved===true&&
          (batchMode
            ? r.receipt?.contract==='wand.db05.batch-preview@1'&&
              r.receipt.reopenVerified===true&&
              r.receipt.changedCount===queuedEdits.length
            : r.receipt?.contract==='wand.db05.amount-preview@1'&&
              typeof r.receipt.changed==='boolean');
        if(!good){result='error';return;}
        result=batchMode||r.receipt?.changed?'changed':'unchanged';
        if(result==='changed'){
          snapshot=batchMode
            ? {mode:'batch',file,format:params.format,
               edits:queuedEdits.map(x=>({...x,target:{...x.target}})),
               signature:batchSignature()}
            : {mode:'single',file,format:params.format,target:params.target,
               expected:old!,replacement:next!,signature:params.signature};
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(batchMode
        ? {command:'preview-batch-amounts',format,bytes,
           edits:queuedEdits.map(x=>({...x,target:{...x.target}}))}
        : {command:'preview-existing-amount',format,bytes,
           target:params.target,expected:old,replacement:next},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();
        active=null;
        result='error';
        processing=false;
      }
    }finally{
      if(bytes&&bytes.byteLength)bytes.fill(0);
    }
  }

  /** One-time explicit user request. Re-read the immutable original File and
   * revalidate old quantity and item identity; never reuse an unverified
   * preview result or expose a raw save before the user requests a copy.
   */
  async function makeExperimentalCopy(){
    if(processing||!snapshot||result!=='changed'){
      result='error';return;
    }
    const current=parameters();
    if(fileInput?.files?.[0]!==snapshot.file||
       (snapshot.mode==='single'
         ? current.signature!==snapshot.signature
         : batchSignature()!==snapshot.signature)){
      snapshot=null;discardDownload();result='error';return;
    }
    if(!window.confirm(
      '編集済みコピーを生成します。ゲームでの読み込みは未検証です。元のセーブをバックアップし、テスト用としてのみ使用してください。'
    ))return;
    // Keep the trusted snapshot, but invalidate any existing download.
    const selected=snapshot;
    discardDownload();
    revision++;
    const request=revision;
    processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await selected.file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('../../../lib/save/save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      active=worker;
      const ownedWorker=worker;
      const finish=(message:unknown)=>{
        if(request!==revision||active!==ownedWorker)return;
        ownedWorker.terminate();
        active=null;
        processing=false;
        const r=message as {
          kind?:string;
          bytes?:Uint8Array;
          receipt?:Record<string,unknown>;
        };
        const good=r?.kind==='copy'&&r.bytes instanceof Uint8Array&&
          r.bytes.byteLength>0&&r.bytes.byteLength<=32*1024*1024&&
          r.receipt?.contract==='wand.db05.experimental-copy@1'&&
          r.receipt.copyBytes===r.bytes.byteLength&&
          r.receipt.originalUnchanged===true&&
          r.receipt.productionWriterAuthorized===false&&
          r.receipt.independentReopenVerified===true&&
          r.receipt.experimentalCopyOnly===true;
        if(!good){
          if(r?.bytes instanceof Uint8Array&&r.bytes.byteLength)r.bytes.fill(0);
          result='error';snapshot=null;return;
        }
        const payload=r.bytes as Uint8Array;
        try{
          downloadUrl=URL.createObjectURL(
            new Blob([payload.buffer as ArrayBuffer],{type:'application/octet-stream'})
          );
          payload.fill(0);
          downloadName=copiedName(selected.file.name);
          exportReady=true;
        }catch{
          payload.fill(0);
          discardDownload();result='error';snapshot=null;
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage(selected.mode==='batch'
        ? {command:'export-batch-amount-copy',allowExperimentalCopy:true,
           format:selected.format,bytes,edits:selected.edits}
        : {command:'export-existing-amount-copy',allowExperimentalCopy:true,
           format:selected.format,bytes,target:selected.target,
           expected:selected.expected,replacement:selected.replacement},
        [bytes.buffer]);
      bytes=null;
    }catch{
      if(request===revision){
        worker?.terminate();
        active=null;processing=false;
        result='error';snapshot=null;
        discardDownload();
      }
    }finally{
      if(bytes?.byteLength)bytes.fill(0);
    }
  }
</script>

<svelte:head>
  <title>DB-05 セーブ数量編集（テスト用） | Dreamwish Wand</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="dev-preview">
  <p class="eyebrow">DEVELOPMENT · DB-05 SAVE</p>
  <h1>セーブ数量編集（テスト用）</h1>
  <p>JSONまたは暗号化P1Gの既存Inventory・Chest数量をRust/WASMで検証できます。ゲーム内の通常所持上限（1個限定・99個制限など）は適用しません。明示的に選んだ場合だけ、原本を上書きしない編集済みコピーを生成します。</p>
  <section aria-label="数量変更の検証">
    <label>セーブファイル
      <input bind:this={fileInput} type="file" accept=".profile,.dat,.bin,.json"
        aria-label="検証用セーブファイル" disabled={processing}
        on:change={onFileChange} />
    </label>
    <label>対象
      <select bind:value={kind} aria-label="対象の種類" disabled={processing}>
        <option value="inventory">Inventory</option>
        <option value="chest">Chest</option>
      </select>
    </label>
    {#if kind==='inventory'}
      <label>Inventory ID <input bind:value={inventoryId} aria-label="Inventory ID" disabled={processing}/></label>
      <label>Item ID <input bind:value={itemId} aria-label="Item ID" disabled={processing}/></label>
    {:else}
      <label>Container ID <input bind:value={containerId} aria-label="Container ID" disabled={processing}/></label>
      <label>Slot index <input bind:value={slotIndex} aria-label="Slot index" disabled={processing}/></label>
      <label>Item ID <input bind:value={chestItemId} aria-label="Chest Item ID" disabled={processing}/></label>
    {/if}
    <label>現在の数量 <input bind:value={expected} aria-label="現在の数量" disabled={processing}/></label>
    <label>変更後の数量 <input bind:value={replacement} aria-label="変更後の数量" disabled={processing}/></label>
    <button type="button" on:click={()=>preview(false)} disabled={processing}>
      {processing?'Rust/WASMで確認中…':'変更を検証'}
    </button>
    <button type="button" class="secondary" on:click={queueCurrentEdit}
      disabled={processing||queuedEdits.length>=16}>複数編集に追加</button>
    <button type="button" class="secondary" on:click={()=>{
      onFileChange();queuedEdits=[];if(fileInput)fileInput.value='';
      fileSelected=false;
    }}>
      破棄
    </button>
  </section>
  <section class="saved-slots" aria-label="セーブ内アイテム">
    <div class="slot-actions">
      <button type="button" on:click={loadSavedSlots} disabled={processing}>
        {slotState==='loading'?'読み込み中…':'所持アイテムを表示'}
      </button>
      {#if slotState==='ready'}
        <span role="status">{savedSlots.length}件</span>
      {:else if slotState==='error'}
        <span role="alert">所持アイテムを読み込めませんでした。</span>
      {/if}
    </div>
    {#if slotState==='ready'}
      <div class="slot-search">
        <input bind:value={slotQuery} aria-label="所持アイテム検索"
          placeholder="アイテム名・Item IDを検索" />
        <select bind:value={slotFilter} aria-label="所持アイテム分類">
          <option value="all">すべて</option>
          <option value="inventory">Inventory</option>
          <option value="chest">Chest</option>
        </select>
      </div>
      <ul class="slot-list">
        {#each visibleSlots as slot,i}
          <li>
            <button type="button" class="slot-select" disabled={processing}
              aria-label={`所持アイテム ${String(slot.itemId)} を選択`}
              on:click={()=>selectSavedSlot(slot)}>
              <span>
                <strong>{dbMap.get(String(slot.itemId))?.name??String(slot.itemId)}</strong>
                <small>{dbMap.get(String(slot.itemId))?.category??
                  dbMap.get(String(slot.itemId))?.nativeCategory??
                  (slot.kind==='inventory'?'Inventory':'Chest')}
                </small>
              </span>
              <span class="slot-amount">×{slot.amount}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if dbStatus==='loading'}
        <p class="slot-note">共通DBを読み込み中…</p>
      {:else if dbStatus==='unavailable'}
        <p class="slot-note">共通DBを参照できません。Item IDで編集できます。</p>
      {/if}
      {#if savedSlots.length>120 && visibleSlots.length===120}
        <p class="slot-note">検索すると絞り込めます。</p>
      {/if}
    {/if}
  </section>
  {#if slotState==='ready'}
    <section class="saved-slots" aria-label="ワールド参照">
      <div class="slot-actions">
        <strong>ワールドのアイテム参照</strong>
        {#if worldStatus==='saved_item_refs'||worldStatus==='partial_inconclusive'}
          <span role="status">{worldRefs.length}種類</span>
        {/if}
      </div>
      {#if worldStatus==='saved_item_refs'||worldStatus==='partial_inconclusive'}
        <input bind:value={worldQuery} aria-label="ワールド参照検索"
          placeholder="アイテム名・Item IDを検索" />
        <ul class="slot-list">
          {#each visibleWorldRefs as row}
            <li class="world-reference-row">
              <span>
                <strong>{dbMap.get(row.itemId)?.name??row.itemId}</strong>
                <small>{dbMap.get(row.itemId)?.category??
                  dbMap.get(row.itemId)?.nativeCategory??'分類未確認'}</small>
              </span>
              <span class="slot-amount">{
                row.fullGridReferences+row.diffModifiedReferences
              }件</span>
            </li>
          {/each}
        </ul>
      {:else if worldStatus==='not_observed'}
        <p class="slot-note">Grid情報はこのセーブにありません。</p>
      {:else if worldStatus==='observed_no_item_refs'}
        <p class="slot-note">保存済みのItem ID参照はありません。</p>
      {:else if worldStatus==='incompatible_structure'}
        <p class="slot-note">Grid構造を読み取れません。</p>
      {/if}
      {#if worldStatus==='partial_inconclusive'}
        <p class="slot-note">未確認の参照があるため一部のみ表示しています。</p>
      {/if}
      <p class="slot-note">保存されたGrid内の参照です。所有数・全配置数・配置可否を示すものではありません。</p>
      <div class="db04-path-check">
        <label>DB-04参照データ（ローカル・任意）
          <input bind:this={db04Input} type="file" accept=".json"
            aria-label="DB-04参照データを選択" disabled={processing}
            on:change={()=>{cancel();db04State='idle';db04Match=null;}} />
        </label>
        <button type="button" on:click={matchLocalDb04}
          disabled={processing||!savedSlotsFile}>
          {db04State==='reading'?'照合中…':'DB-04 Gridパスを照合'}
        </button>
      </div>
      {#if db04State==='verified'&&db04Match}
        <div role="status" class="db04-result">
          <p>通常Gridの参照パス一致：{db04Match.matchedFullGrids} /
            {db04Match.observedFullGrids}</p>
          {#if db04Match.notInPartialSourceFullGrids>0}
            <p>DB-04部分データに未収録：{
              db04Match.notInPartialSourceFullGrids}</p>
          {/if}
          {#if db04Match.ambiguousSourceFullGrids>0||
            db04Match.malformedFullGrids>0}
            <p>一意に照合できないGrid：{
              db04Match.ambiguousSourceFullGrids+
              db04Match.malformedFullGrids}</p>
          {/if}
          {#if db04Match.observedDiffGrids>0}
            <p>差分Grid：{db04Match.hashUnverifiedDiffGrids}件は
              原本ハッシュの証拠がなく照合未完了</p>
          {/if}
          <p class="slot-note">DB-04索引との参照パス比較です。
            原本再検証・全配置数・所有権・編集可否の証明ではありません。</p>
        </div>
      {:else if db04State==='error'}
        <p role="alert">DB-04照合に失敗しました。
          検証済みのDB-04参照JSONを選択してください。</p>
      {/if}

    </section>
  {/if}
  {#if queuedEdits.length}
    <section class="batch-edits" aria-label="一括数量変更">
      <p>一括変更 · {queuedEdits.length}件（最大16件）</p>
      <ol>
        {#each queuedEdits as edit,i}
          <li>
            {edit.target.kind==='inventory'
              ? `Inventory ${edit.target.inventoryId} / ${edit.target.itemId}`
              : `Chest ${edit.target.containerId} / ${edit.target.slotIndex} / ${edit.target.itemId}`}
            ：{edit.expected} → {edit.replacement}
            <button type="button" class="secondary" disabled={processing}
              aria-label={`変更${i+1}を削除`} on:click={()=>removeQueued(i)}>削除</button>
          </li>
        {/each}
      </ol>
      <button type="button" on:click={()=>preview(true)} disabled={processing}>
        {processing?'Rust/WASMで確認中…':'一括変更を検証'}
      </button>
    </section>
  {/if}
  {#if result==='changed'}
    <p role="status">Rust/WASMで{snapshot?.mode==='batch'?snapshot.edits.length+'件の一括変更':'数量変更'}の検証に成功しました。変更後の構造を内部で再検証しました。</p>
    <div class="export-controls">
      <button type="button" disabled={processing || exportReady || snapshot===null}
        on:click={makeExperimentalCopy}>
        {processing?'編集中…':exportReady?'編集済みコピーを準備しました':'編集済みコピーを生成'}
      </button>
      {#if exportReady && downloadUrl}
        <a href={downloadUrl} download={downloadName} class="download-link">コピーをダウンロード</a>
      {/if}
    </div>
  {:else if result==='unchanged'}
    <p role="status">変更前後の数量が同じです。元データは変更されていません。</p>
  {:else if result==='error'}
    <p role="alert">検証できませんでした。対象・数量・形式を確認してください。元ファイルは変更していません。</p>
  {/if}
  <p class="warning">テスト用機能です。実ゲームでの再読み込み成功は未確認です。元ファイルを保管したまま、生成したコピーのみを検証してください。ゲームに正常に読み込めることを保証しません。</p>
</main>

<style>
  .dev-preview{max-width:1100px;margin:0 auto;padding:clamp(24px,5vw,60px);color:#f5ebfb;}
  .eyebrow{font-size:11px;letter-spacing:.17em;color:#d4b0ee;}
  h1{font-size:clamp(26px,4vw,42px);margin:12px 0;}
  p{line-height:1.7;color:#c6b5d4;font-size:14px;}
  section{display:flex;flex-wrap:wrap;gap:16px;margin:26px 0;padding:20px;border-radius:14px;background:#261d32;}
  label{display:flex;flex:1 1 200px;flex-direction:column;gap:7px;font-size:13px;}
  label:first-child{flex-basis:100%;}
  input,select{box-sizing:border-box;width:100%;padding:12px;border-radius:7px;color:#291d34;background:#f5ecfa;border:0;}
  input[type=file]{font-size:12px;}
  button{padding:12px 17px;background:#d8b9f0;color:#24182f;border:0;border-radius:8px;cursor:pointer;}
  button.secondary{background:#493858;color:#faf0ff;}
  button:disabled{opacity:.5;cursor:not-allowed;}
  .batch-edits{display:block}
  .batch-edits ol{margin:8px 0 16px;padding-left:24px}
  .batch-edits li{margin:7px 0;font-size:13px}
  .batch-edits li button{margin-left:12px;padding:5px 10px}
  .saved-slots{display:block;}
  .slot-actions{display:flex;align-items:center;gap:15px;}
  .slot-search{display:flex;gap:10px;margin:14px 0;}
  .slot-search input{flex:1;min-width:0;}
  .slot-search select{max-width:180px;}
  .slot-list{list-style:none;margin:8px 0;padding:0;max-height:380px;overflow:auto;}
  .slot-list li{margin:0;border-bottom:1px solid #ffffff22;}
  .world-reference-row{display:flex;align-items:center;justify-content:space-between;
    gap:12px;padding:10px 12px;min-height:48px;}
  .world-reference-row strong{font-size:15px;display:block;}
  .world-reference-row small{font-size:12px;color:#d4c2df;display:block;}
  .slot-select{width:100%;background:transparent;color:#f5ebfb;text-align:left;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    min-height:54px;padding:10px 12px;}
  .slot-select:hover{background:#443452;}
  .slot-select strong{font-size:15px;display:block;}
  .slot-select small,.slot-note{font-size:12px;color:#d4c2df;display:block;}
  .slot-amount{font-size:17px;white-space:nowrap;}
  .db04-path-check{display:flex;align-items:end;gap:14px;
    flex-wrap:wrap;margin:14px 0;}
  .db04-path-check label{min-width:220px;flex:1;}
  .db04-result{margin-top:10px;}
  .db04-result p{margin:8px 0;}
  .warning{font-size:12px;}
  .export-controls{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px 0;}
  .download-link{display:inline-block;padding:12px 17px;border-radius:8px;background:#f5ecfa;color:#24182f;font-size:14px;text-decoration:none;font-weight:600;}
  [role=alert]{color:#ffb5bf;}
</style>