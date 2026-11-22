<script lang="ts">
  import {onDestroy} from 'svelte';

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
  type PreviewSnapshot = {
    file:File;format:'json'|'auto';target:EditTarget;
    expected:number;replacement:number;signature:string
  };
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
  onDestroy(cancel);
  function uint32(x:string):number|null{
    if(!/^(?:0|[1-9][0-9]*)$/.test(x))return null;
    const n=Number(x);
    return Number.isSafeInteger(n)&&n>0&&n<=0xffffffff?n:null;
  }
  function identity(x:string):boolean{
    return /^[0-9]{1,20}$/.test(x)&&BigInt(x)>0n&&BigInt(x)<=BigInt('18446744073709551615');
  }
  async function preview(){
    cancel();
    result=null;
    const file=fileInput?.files?.[0];
    const old=uint32(expected),next=uint32(replacement);
    if(!file||!file.size||file.size>MAX_BYTES||old===null||next===null||
      (kind==='inventory'
        ? !identity(inventoryId)||!identity(itemId)
        : !identity(containerId)||!uint32(chestItemId)||
          !/^(?:0|[1-9][0-9]*)$/.test(slotIndex)||
          Number(slotIndex)>1000000)){
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
        if(r?.kind!=='result'||r.receipt?.contract!=='wand.db05.amount-preview@1'||
          r.receipt?.writerAuthorized!==false||r.receipt?.exportAuthorized!==false||
          r.receipt?.lexicalBytesPreserved!==true||
          typeof r.receipt?.changed!=='boolean'){
          result='error';return;
        }
        result=r.receipt.changed?'changed':'unchanged';
        if(r.receipt.changed){
          snapshot={
            file,format:params.format,target:params.target,
            expected:old,replacement:next,signature:params.signature
          };
        }
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'preview-existing-amount',
        format,bytes,
        target:params.target,
        expected:old,replacement:next
      },[bytes.buffer]);
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
       current.signature!==snapshot.signature){
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
      worker.postMessage({
        command:'export-existing-amount-copy',
        allowExperimentalCopy:true,
        format:selected.format,
        bytes,target:selected.target,
        expected:selected.expected,replacement:selected.replacement
      },[bytes.buffer]);
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
        aria-label="検証用セーブファイル" disabled={processing} />
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
    <button type="button" on:click={preview} disabled={processing}>
      {processing?'Rust/WASMで確認中…':'変更を検証'}
    </button>
    <button type="button" class="secondary" on:click={()=>{cancel();result=null;if(fileInput)fileInput.value='';}}>
      破棄
    </button>
  </section>
  {#if result==='changed'}
    <p role="status">Rust/WASMで数量変更の検証に成功しました。変更後の構造を内部で再検証しました。</p>
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
  .dev-preview{max-width:740px;margin:0 auto;padding:clamp(24px,5vw,60px);color:#f5ebfb;}
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
  .warning{font-size:12px;}
  .export-controls{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px 0;}
  .download-link{display:inline-block;padding:12px 17px;border-radius:8px;background:#f5ecfa;color:#24182f;font-size:14px;text-decoration:none;font-weight:600;}
  [role=alert]{color:#ffb5bf;}
</style>