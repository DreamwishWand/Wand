<script lang="ts">
 import {onDestroy} from 'svelte';
 import {browser} from '$app/environment';
 import {base} from '$app/paths';
 import {worldArtwork} from './world-artwork.ts';
 import {commitWorldCheckpoint} from '../ui/local-save-session.ts';
 import {experimentalCopyDownload} from './experimental-copy.ts';
 import {checkpointWords} from './world-checkpoint-words.ts';
 import {testSaveExportEnabled,testSaveWords} from './test-save-export.ts';
 import {isEightWay} from './saved-map-transform.ts';
 import {MAX_GRID_MIXED_EDITS} from '../save/grid-edit-limits.ts';
 import type {MainlandSavedObject} from './mainland-saved-objects.ts';
 import type {WandLanguage} from '../ui/preferences.ts';
 import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
 export let items:readonly MainlandSavedObject[]=[],file:File|null=null,locale:WandLanguage='ja',blocked=false;
 export let selection:readonly {localOrdinal:number;itemId:string;expectedX:number;expectedY:number;expectedOrientation:string}[]|null=null;
 export let names:ReadonlyMap<number,string>=new Map();
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
 interface Destination{ordinal:number;kind:'inventory'|'home-storage'|'chest'|'unlinked-chest';capacity:number;used:number;afterUsed:number|null;parentItemId:number|null;owner:null|{itemId:number;gridDataPath:string;x:number;y:number}}
 const homeStorageWords={ja:'自宅収納',en:'Home Storage',fr:'Rangement de la maison',it:'Deposito di casa',de:'Heimlager','es-ES':'Almacenamiento de casa','zh-CN':'家中储物箱','pt-BR':'Armazenamento de casa'} as const;
 const unlinkedWords={ja:'配置先未確認',en:'Location unverified',fr:'Emplacement non vérifié',it:'Posizione non verificata',de:'Standort ungeprüft','es-ES':'Ubicación sin verificar','zh-CN':'位置未验证','pt-BR':'Local não verificado'} as const;
 let artwork=new Map<number,string>(),requested=new Set<number>();
 function loadArtwork(destinations:readonly Destination[]){
  for(const id of new Set(destinations.map(r=>r.parentItemId)))if(id!==null&&!requested.has(id)){
   requested.add(id);void worldArtwork(base,id).then(url=>{if(url)artwork=new Map(artwork).set(id,url);}).catch(()=>{});
  }
 }
 $: if(open)loadArtwork(rows);
 const allowed=browser&&testSaveExportEnabled(window.location);
 let worker:Worker|null=null,source:File|null=null,copy:ReturnType<typeof experimentalCopyDownload>|null=null,rows:Destination[]=[],destination=0,quantity=0,expected='',open=false,error=false;
 $: w=words[locale];$: cw=checkpointWords[locale];$: tw=testSaveWords[locale];
 $: outdoorPlan=items.length>0&&items.length<=MAX_GRID_MIXED_EDITS&&new Set(items.map(p=>p.object.localOrdinal)).size===items.length&&items.every(p=>p.object.recoveryCandidate===true&&isEightWay(p.object.orientation)&&!p.object.storage&&!p.object.subgrid)?items.map(p=>({localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation})):null;
 $: plan=selection===null?outdoorPlan:selection.length>0&&selection.length<=MAX_GRID_MIXED_EDITS&&new Set(selection.map(p=>p.localOrdinal)).size===selection.length&&selection.every(p=>isEightWay(p.expectedOrientation))?selection:null;
 $: key=JSON.stringify(plan);
 $: if(source&&(source!==file||expected!==key||blocked))cancel();
 function cancel(){worker?.terminate();worker=null;if(copy)URL.revokeObjectURL(copy.url);copy=null;source=null;expected='';rows=[];destination=0;quantity=0;open=false;error=false;}
 function request(list:boolean){
  if(!allowed||blocked||!file||!plan||worker||copy||!list&&!rows.some(r=>r.ordinal===destination&&r.afterUsed!==null))return;
  if(list){cancel();open=true;source=file;expected=key;}
  const f=file,k=key,own=new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});worker=own;error=false;
  const done=(d:any)=>{own.terminate();if(worker!==own||source!==f||file!==f||expected!==k||key!==k||blocked){d?.bytes?.fill(0);return;}worker=null;
   try{if(list){
    if(d?.kind!=='activity-recovery-destinations'||d.result?.contract!=='wand.db05.field-recovery-destinations@3'||!Number.isSafeInteger(d.result.quantity)||d.result.quantity<1||d.result.quantity>MAX_GRID_MIXED_EDITS*2147483647||!Array.isArray(d.result.rows)||d.result.rows.length>8192)throw Error('destinations');
    const result=d.result.rows as Destination[];
    if(result.some((r,i)=>r.ordinal!==i+1||!['inventory','home-storage','chest','unlinked-chest'].includes(r.kind)||!Number.isSafeInteger(r.capacity)||r.capacity<1||r.capacity>8192||!Number.isSafeInteger(r.used)||r.used<0||r.used>8192||r.used>r.capacity||r.afterUsed!==null&&(!Number.isSafeInteger(r.afterUsed)||r.afterUsed<r.used||r.afterUsed>r.capacity)||(['chest','unlinked-chest'].includes(r.kind)?!Number.isSafeInteger(r.parentItemId)||Number(r.parentItemId)<1:r.parentItemId!==null)||r.kind==='unlinked-chest'&&r.owner!==null||r.kind==='chest'&&(!r.owner||r.owner.itemId!==r.parentItemId||typeof r.owner.gridDataPath!=='string'||!Number.isSafeInteger(r.owner.x)||!Number.isSafeInteger(r.owner.y))))throw Error('destination');
    rows=result;quantity=d.result.quantity;destination=rows.find(r=>r.afterUsed!==null)?.ordinal??0;if(!destination)error=true;
   }else{if(d?.kind!=='furniture-stock-copy')throw Error('copy');copy=experimentalCopyDownload(d,f);}
   }catch{d?.bytes?.fill(0);error=true;}
  };
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  own.postMessage({command:list?'activity-recovery-destinations':'activity-recovery-export',allowExperimentalCopy:true,file:f,plan:list?plan:{destinationOrdinal:destination,rows:plan}});
 }
 function destinationLabel(r:Destination,lookup:ReadonlyMap<number,string>,language:WandLanguage,all:readonly Destination[]){
  const wordsFor=words[language];
  if(r.parentItemId===null)return r.kind==='home-storage'?homeStorageWords[language]:wordsFor[2];
  const name=lookup.get(r.parentItemId)??wordsFor[3];
  const same=all.filter(x=>x.parentItemId===r.parentItemId);
  return name+(same.length>1?' · '+(same.findIndex(x=>x.ordinal===r.ordinal)+1):'');
 }
 function locationLabel(r:Destination,language:WandLanguage,refs:readonly PublicTerrainGridRef[],areaLabel:(key:string)=>string){
  if(r.kind==='unlinked-chest')return unlinkedWords[language];
  if(!r.owner)return '';
  const matches=refs.filter(g=>g.gridDataPath===r.owner?.gridDataPath);
  return (matches.length===1?areaLabel(matches[0].key)+' · ':unlinkedWords[language]+' · ')+'('+r.owner.x+', '+r.owner.y+')';
 }
 function apply(){if(!allowed||blocked||!copy||!file||file!==source||key!==expected)return;if(!commitWorldCheckpoint(file,copy.file)){error=true;return;}cancel();onApplied();}
 onDestroy(cancel);
</script>
{#if allowed&&(plan||selection===null&&items.length>0&&items.every(p=>p.object.activityItem||p.object.recoveryCandidate))}
 <div class="field-recovery">
  {#if !open}<button type="button" disabled={blocked||!plan} title={!plan?w[6]:undefined} on:click={()=>request(true)}>{w[0]}</button>
  {:else}
   {#if worker}<small role="status">{w[5]}</small>{:else if rows.length&&!copy}<strong>{w[0]} × {quantity.toLocaleString(locale)}</strong><div class="destination-list" role="group" aria-label={w[1]}>{#each rows as r (r.ordinal)}<button type="button" class="destination-row" aria-pressed={destination===r.ordinal} disabled={r.afterUsed===null} on:click={()=>destination=r.ordinal}>
    {#if r.parentItemId!==null&&artwork.get(r.parentItemId)}<img src={artwork.get(r.parentItemId)} alt="" loading="lazy"/>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V4h8v2M3 12h18M10 11v3h4v-3"/></svg>{/if}
    <span><strong>{destinationLabel(r,names,locale,rows)}</strong>{#if r.parentItemId!==null}<small>{locationLabel(r,locale,grids,label)}</small>{/if}</span><span class="capacity">{r.used}{#if r.afterUsed!==null&&r.afterUsed!==r.used} → {r.afterUsed}{/if}/{r.capacity}</span>
   </button>{/each}</div><button type="button" disabled={blocked||!destination} on:click={()=>request(false)}>{w[4]}</button>{/if}
   {#if copy}<small>{tw[1]}</small><button type="button" disabled={blocked} on:click={apply}>{cw[0]}</button><a href={copy.url} download={copy.name}>{tw[2]}</a>{/if}
   <button type="button" on:click={cancel}>{w[7]}</button>
   {#if error}<small role="alert">{w[6]}</small>{/if}
  {/if}
 </div>
{/if}
<style>
 .field-recovery{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.field-recovery small{flex-basis:100%;color:var(--wand-muted)}button,select,a{font:inherit;color:inherit;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:4px;padding:5px}button:disabled{opacity:.45}select{max-width:100%}a{color:var(--wand-accent)}
 .destination-list{display:grid;gap:3px;max-height:260px;overflow:auto;flex-basis:100%;min-width:200px}.destination-row{display:flex;align-items:center;gap:6px;text-align:left;min-height:42px}.destination-row[aria-pressed="true"]{border-color:var(--wand-accent);outline:1px solid var(--wand-accent);outline-offset:-2px}.destination-row img,.destination-row svg{width:36px;height:36px;object-fit:contain;flex:none}.destination-row svg{fill:none;stroke:currentColor;stroke-width:1.5}.destination-row span:first-of-type{min-width:0;flex:1}.destination-row small{display:block;font-size:.8em}.capacity{font-variant-numeric:tabular-nums;white-space:nowrap}
</style>
