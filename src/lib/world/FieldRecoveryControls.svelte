<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {isCardinal} from './saved-map-transform.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,locale:WandLanguage='ja',blocked=false;
 export let grids:readonly PublicTerrainGridRef[]=[];
 export let label:(key:string)=>string=key=>key;
 export let onApplied:()=>void=()=>{};
 const words={
  ja:['回収・収納','収納先','インベントリー','チェスト','回収を検証','処理中…','安全に回収できないか、収納先が満杯です。','閉じる'],
  en:['Recover to storage','Destination','Inventory','Chest','Validate recovery','Working…','Recovery is unsafe or the destination is full.','Close'],
  fr:['Récupérer et ranger','Destination','Inventaire','Coffre','Vérifier','Traitement…','Récupération non sûre ou destination pleine.','Fermer'],
  it:['Raccogli e deposita','Destinazione','Inventario','Cassa','Verifica','Elaborazione…','Recupero non sicuro o destinazione piena.','Chiudi'],
  de:['Aufnehmen und lagern','Ziel','Inventar','Truhe','Prüfen','Verarbeitung…','Aufnahme nicht sicher oder Ziel voll.','Schließen'],
  'es-ES':['Recoger y guardar','Destino','Inventario','Cofre','Verificar','Procesando…','Recogida no segura o destino lleno.','Cerrar'],
  'zh-CN':['回收并存储','存储位置','背包/物品栏','储物箱','验证回收','处理中…','无法安全回收或目标已满。','关闭'],
  'pt-BR':['Recolher e guardar','Destino','Inventário','Baú','Verificar','Processando…','Recolhimento inseguro ou destino cheio.','Fechar']
 } as const;
 interface Destination{ordinal:number;kind:'inventory'|'home-storage'|'chest';capacity:number;used:number;owner:null|{itemId:number;gridDataPath:string;x:number;y:number}}
 const homeStorageWords={ja:'自宅収納',en:'Home Storage',fr:'Rangement de la maison',it:'Deposito di casa',de:'Heimlager','es-ES':'Almacenamiento de casa','zh-CN':'家中储物箱','pt-BR':'Armazenamento de casa'} as const;
 const allowed=browser&&testSaveExportEnabled(window.location);
 let worker:Worker|null=null,source:File|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,rows:Destination[]=[],destination=0,expected='',open=false,error=false;
 $: w=words[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: plan=items.length>0&&items.length<=32&&new Set(items.map(p=>p.object.localOrdinal)).size===items.length&&items.every(p=>p.object.activityItem&&isCardinal(p.object.orientation)&&!p.object.storage&&!p.object.subgrid)?items.map(p=>({localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation})):null;
 $: key=JSON.stringify(plan);
 $: if(source&&(source!==file||expected!==key||blocked))cancel();
 function cancel(){worker?.terminate();worker=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;source=null;expected='';rows=[];destination=0;open=false;error=false;}
 function request(list:boolean){
  if(!allowed||blocked||!file||!plan||worker||copy||!list&&!rows.some(r=>r.ordinal===destination))return;
  if(list){cancel();open=true;source=file;expected=key;}
  const f=file,k=key,own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});worker=own;error=false;
  const done=(d:any)=>{own.terminate();if(worker!==own||source!==f||file!==f||expected!==k||key!==k||blocked){d?.bytes?.fill(0);return;}worker=null;
   try{if(list){
    if(d?.kind!=='activity-recovery-destinations'||d.result?.contract!=='wand.db05.field-recovery-destinations@1'||!Array.isArray(d.result.rows)||d.result.rows.length>8192)throw Error('destinations');
    const result=d.result.rows as Destination[];
    if(result.some((r,i)=>r.ordinal!==i+1||!['inventory','home-storage','chest'].includes(r.kind)||!Number.isSafeInteger(r.capacity)||r.capacity<1||r.capacity>8192||!Number.isSafeInteger(r.used)||r.used<0||r.used>8192||r.kind==='chest'&&(!r.owner||!Number.isSafeInteger(r.owner.itemId)||typeof r.owner.gridDataPath!=='string'||!Number.isSafeInteger(r.owner.x)||!Number.isSafeInteger(r.owner.y))))throw Error('destination');
    rows=result;destination=rows[0]?.ordinal??0;if(!rows.length)error=true;
   }else{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}
   }catch{d?.bytes?.fill(0);error=true;}
  };
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  own.postMessage({command:list?'activity-recovery-destinations':'activity-recovery-export',allowExperimentalCopy:true,file:f,plan:list?{}:{destinationOrdinal:destination,rows:plan}});
 }
 function destinationLabel(r:Destination){
  if(!r.owner)return (r.kind==='home-storage'?homeStorageWords[locale]:w[2])+' · '+r.used+'/'+r.capacity;
  const g=grids.find(g=>g.gridDataPath===r.owner?.gridDataPath);
  return w[3]+' '+rows.filter(x=>x.kind==='chest'&&x.ordinal<=r.ordinal).length+(g?' · '+label(g.key):'')+' ('+r.owner.x+', '+r.owner.y+') · '+r.used+'/'+r.capacity;
 }
 function apply(){if(!allowed||blocked||!copy||!file||file!==source||key!==expected)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();onApplied();}
 onDestroy(cancel);
</script>
{#if allowed&&plan}
 <div class="field-recovery">
  {#if !open}<button type="button" disabled={blocked} on:click={()=>request(true)}>{w[0]}</button>
  {:else}
   {#if worker}<small role="status">{w[5]}</small>{:else if rows.length&&!copy}<label>{w[1]} <select bind:value={destination}>{#each rows as r (r.ordinal)}<option value={r.ordinal}>{destinationLabel(r)}</option>{/each}</select></label><button type="button" disabled={blocked||!destination} on:click={()=>request(false)}>{w[4]}</button>{/if}
   {#if copy}<small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
   <button type="button" on:click={cancel}>{w[7]}</button>
   {#if error}<small role="alert">{w[6]}</small>{/if}
  {/if}
 </div>
{/if}
<style>
 .field-recovery{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.field-recovery small{flex-basis:100%;color:var(--wand-muted)}button,select,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}button:disabled{opacity:.45}select{max-width:100%}a{color:var(--wand-accent)}
</style>
