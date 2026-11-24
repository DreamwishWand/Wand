<script lang="ts">
  import {onDestroy} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';

  /** This source File was already verified by the DB-04 WorldReferenceIndex
   * inside its dedicated Worker. It stays in the user's browser only. */
  export let originalGraphFile:File;

  type SaveGridReceipt={
    readonly contract:'wand.db05.db04-grid-path-match@2';
    readonly status:'not_observed'|'incompatible_structure'|
      'partial_inconclusive'|'source_path_matches'|
      'diff_structural_candidates_only'|'no_exact_full_path_match';
    readonly observedFullGrids:number;
    readonly matchedFullGrids:number;
    readonly notInPartialSourceFullGrids:number;
    readonly ambiguousSourceFullGrids:number;
    readonly malformedFullGrids:number;
    readonly observedDiffGrids:number;
    readonly hashUnverifiedDiffGrids:number;
    readonly structuralCandidateDiffGrids:number;
    readonly notInPartialSourceDiffGrids:number;
    readonly ambiguousSourceDiffGrids:number;
    readonly malformedDiffGrids:number;
    readonly sampled:boolean;
    readonly sourceCoverageComplete:false;
    readonly sourceOriginalArchiveRechecked:false;
    readonly saveGridNumericIdUsedAsNativeKey:false;
    readonly diffIdentityVerified:false;
    readonly worldCoordinatesVerified:false;
    readonly playerPlacementVerified:false;
    readonly nativeDefaultObjectEquivalenceVerified:false;
    readonly saveWritingAuthorized:false;
  };
  const fields=[
    'observedFullGrids','matchedFullGrids','notInPartialSourceFullGrids',
    'ambiguousSourceFullGrids','malformedFullGrids','observedDiffGrids',
    'hashUnverifiedDiffGrids','structuralCandidateDiffGrids',
    'notInPartialSourceDiffGrids','ambiguousSourceDiffGrids',
    'malformedDiffGrids'
  ] as const;
  function validatedReceipt(value:unknown):value is SaveGridReceipt{
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const v=value as Record<string,unknown>;
    return v.contract==='wand.db05.db04-grid-path-match@2'&&
      ['not_observed','incompatible_structure','partial_inconclusive',
        'source_path_matches','diff_structural_candidates_only',
        'no_exact_full_path_match'].includes(String(v.status))&&
      fields.every(key=>typeof v[key]==='number'&&
        Number.isSafeInteger(v[key])&&(v[key] as number)>=0)&&
      typeof v.sampled==='boolean'&&
      v.sourceCoverageComplete===false&&
      v.sourceOriginalArchiveRechecked===false&&
      v.saveGridNumericIdUsedAsNativeKey===false&&
      v.diffIdentityVerified===false&&
      v.worldCoordinatesVerified===false&&
      v.playerPlacementVerified===false&&
      v.nativeDefaultObjectEquivalenceVerified===false&&
      v.saveWritingAuthorized===false;
  }

  let saveInput:HTMLInputElement|null=null;
  let auditWorker:Worker|null=null;
  let serial=0;
  let activeSource:File=originalGraphFile;
  let busy=false;
  let error='';
  let receipt:SaveGridReceipt|null=null;

  function reset(){
    serial++;
    auditWorker?.terminate();
    auditWorker=null;
    busy=false;
    error='';
    receipt=null;
    if(saveInput)saveInput.value='';
  }
  // Replacing the original source graph invalidates every prior Save audit.
  $: if(originalGraphFile!==activeSource){
    activeSource=originalGraphFile;
    reset();
  }
  onDestroy(reset);

  async function compare(event:Event){
    const input=event.currentTarget as HTMLInputElement;
    const selected=input.files?.[0];
    input.value='';
    if(!selected)return;
    reset();
    if(!originalGraphFile||
      !['.json','.profile','.p1g','.dat','.bin'].some(ext=>
        selected.name.toLowerCase().endsWith(ext))||
      selected.size<1||selected.size>128*1024*1024){
      error='JSON、.profile、.p1g形式のローカルセーブを選択してください。';
      return;
    }
    busy=true;
    const ownSerial=serial;
    const ownedSource=originalGraphFile;
    let saveBytes:Uint8Array|null=null;
    let graphBytes:Uint8Array|null=null;
    try{
      const [saveBuffer,graphBuffer]=await Promise.all([
        selected.arrayBuffer(),ownedSource.arrayBuffer()
      ]);
      saveBytes=new Uint8Array(saveBuffer);
      graphBytes=new Uint8Array(graphBuffer);
      if(ownSerial!==serial||ownedSource!==originalGraphFile)return;
      if(graphBytes.byteLength<1||graphBytes.byteLength>16*1024*1024)
        throw new TypeError('DB04_ORIGINAL_GRAPH_LIMIT');
      const ownedWorker=new Worker(
        new URL('../save/save-amount-preview.worker.ts',import.meta.url),
        {type:'module'}
      );
      auditWorker=ownedWorker;
      const fail=()=>{
        if(auditWorker!==ownedWorker||ownSerial!==serial)return;
        busy=false;
        error='セーブと原本のGridDataPathを照合できませんでした。';
        receipt=null;
        ownedWorker.terminate();
        auditWorker=null;
      };
      ownedWorker.onmessage=(message:MessageEvent<unknown>)=>{
        if(auditWorker!==ownedWorker||ownSerial!==serial)return;
        const value=message.data;
        if(value&&typeof value==='object'&&
          (value as {kind?:string}).kind==='db04'&&
          validatedReceipt((value as {receipt?:unknown}).receipt)){
          receipt=(value as {receipt:SaveGridReceipt}).receipt;
          error='';
          busy=false;
          ownedWorker.terminate();
          auditWorker=null;
        }else fail();
      };
      ownedWorker.onerror=fail;
      ownedWorker.onmessageerror=fail;
      // The existing one-shot Rust/WASM Worker owns both buffers after
      // transfer, wipes them and reports ONLY anonymous source-match counts.
      ownedWorker.postMessage({
        command:'inspect-db04-grid-paths',
        format:'auto',bytes:saveBytes,graph:graphBytes
      },[saveBytes.buffer as ArrayBuffer,graphBytes.buffer as ArrayBuffer]);
      saveBytes=null;
      graphBytes=null;
    }catch{
      if(ownSerial===serial){
        auditWorker?.terminate();
        auditWorker=null;
        busy=false;
        error='セーブと原本のGridDataPathを照合できませんでした。';
      }
    }finally{
      if(saveBytes?.byteLength)saveBytes.fill(0);
      if(graphBytes?.byteLength)graphBytes.fill(0);
    }
  }
</script>

<section class="save-grid-audit" aria-label="セーブGridDataPath照合">
  <div class="audit-head">
    <h3>セーブと原本を照合</h3>
    <label class="audit-pick">
      <WandIcon name="folder" size={17}/>
      {busy?'照合中…':'セーブを開く'}
      <input bind:this={saveInput} type="file"
        accept=".json,.profile,.p1g,.dat,.bin,application/json,application/octet-stream"
        aria-label="照合用セーブファイル"
        on:change={compare} disabled={busy}/>
    </label>
    {#if receipt||error}
      <button type="button" aria-label="セーブ照合結果を破棄"
        on:click={reset}><WandIcon name="close" size={16}/></button>
    {/if}
  </div>
  {#if busy}<p class="audit-note" role="status">照合中…</p>{/if}
  {#if error}<p class="audit-error" role="alert">{error}</p>{/if}
  {#if receipt}
    <div class="audit-result" aria-label="セーブGridDataPath照合結果">
      <div><strong>{receipt.observedFullGrids}</strong><span>保存済みGrid</span></div>
      <div><strong>{receipt.matchedFullGrids}</strong><span>レイアウト・GridData一致候補</span></div>
      <div><strong>{receipt.ambiguousSourceFullGrids}</strong><span>複数候補</span></div>
      <div><strong>{receipt.notInPartialSourceFullGrids}</strong><span>部分原本に未登録</span></div>
      <div><strong>{receipt.observedDiffGrids}</strong><span>差分Grid</span></div>
      <div><strong>{receipt.structuralCandidateDiffGrids}</strong><span>差分構造の候補</span></div>
    </div>
    <p class="audit-note">
      元のレイアウトパスとGridDataPathの一致候補のみ確認しています。
      保存Gridの数値ID、配置先の同一性、座標変換、差分ハッシュ、
      配置可能性、DLC所有権は未検証です。
      照合できないパスもセーブ破損を意味しません。
    </p>
  {/if}
  <p class="audit-note">Rust/WASMによるローカル読み取り専用照合。
    セーブ・原本ファイルは送信・保存しません。</p>
</section>

<style>
  .save-grid-audit{min-width:0;margin-top:12px;padding-top:12px;
    border-top:1px solid var(--wand-subtle-line)}
  .audit-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
  h3{margin:0 auto 0 0;font-size:14px}
  .audit-pick,.audit-head button{display:inline-flex;align-items:center;
    justify-content:center;gap:7px;padding:8px 10px;position:relative;
    border:1px solid var(--wand-subtle-line);border-radius:8px;
    color:var(--wand-text);background:var(--wand-control);font-size:12px;cursor:pointer}
  .audit-pick{overflow:hidden}
  .audit-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;
    width:100%;max-width:100%}
  .audit-pick:has(input:disabled){opacity:.5}
  .audit-result{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));
    gap:8px;margin-top:12px}
  .audit-result div{display:grid;gap:4px;min-width:0;
    padding:9px;background:var(--wand-surface-raised);border-radius:8px}
  .audit-result strong{font-size:18px;font-variant-numeric:tabular-nums}
  .audit-result span{color:var(--wand-text);font-size:11px}
  .audit-note{margin:9px 0 0;color:var(--wand-muted);line-height:1.5;font-size:12px}
  .audit-error{font-size:12px;color:var(--wand-danger)}
</style>
