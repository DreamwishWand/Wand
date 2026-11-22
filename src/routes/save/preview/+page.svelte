<script lang="ts">
  import {onDestroy} from 'svelte';

  // Development-only verification surface. The Rust Worker does not expose
  // patched JSON, an encrypted P1G, a save download or a production Writer.
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
  const MAX_BYTES=128*1024*1024;

  function cancel(){
    revision++;
    active?.terminate();
    active=null;
    processing=false;
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
    const request=revision;
    processing=true;
    let bytes:Uint8Array|null=null;
    let worker:Worker|null=null;
    try{
      bytes=new Uint8Array(await file.arrayBuffer());
      if(request!==revision)return;
      worker=new Worker(
        new URL('../../../lib/save/save-amount-preview.worker.mjs',import.meta.url),
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
      };
      worker.onmessage=event=>finish(event.data);
      worker.onerror=event=>{event.preventDefault();finish({kind:'error'});};
      worker.onmessageerror=()=>finish({kind:'error'});
      worker.postMessage({
        command:'preview-existing-amount',
        format,bytes,
        target:kind==='inventory'
          ? {kind,inventoryId,itemId}
          : {kind,containerId,slotIndex:Number(slotIndex),itemId:Number(chestItemId)},
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
</script>

<svelte:head>
  <title>DB-05 数量変更プレビュー（開発用） | Dreamwish Wand</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="dev-preview">
  <p class="eyebrow">DEVELOPMENT · DB-05 SAVE</p>
  <h1>数量変更プレビュー</h1>
  <p>JSONまたは暗号化P1Gの既存Inventory・Chest数量変更をRust/WASMで検証します。実ファイルを変更・保存・ダウンロードする機能はありません。</p>
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
    <p role="status">Rust/WASMで数量変更の検証に成功しました。変更後の構造を内部で再検証しました。ファイルは出力していません。</p>
  {:else if result==='unchanged'}
    <p role="status">変更前後の数量が同じです。元データは変更されていません。</p>
  {:else if result==='error'}
    <p role="alert">検証できませんでした。対象・数量・形式を確認してください。元ファイルは変更していません。</p>
  {/if}
  <p class="warning">開発用の検証画面です。実ゲームでの再読み込み成功や安全な書き出しを保証しません。編集可能なセーブファイルは生成されません。</p>
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
  [role=alert]{color:#ffb5bf;}
</style>