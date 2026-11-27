<script lang="ts">
 import NativePresetDetail from '$lib/presets/NativePresetDetail.svelte';
 import NativeSceneConvert from '$lib/presets/NativeSceneConvert.svelte';
 import NativeRestoreReview from '$lib/presets/NativeRestoreReview.svelte';
 import PresetAuthorPanel from '$lib/presets/PresetAuthorPanel.svelte';
 import PublicPresetCatalog from '$lib/presets/PublicPresetCatalog.svelte';
 import {catalogWords} from '$lib/presets/catalog-words.ts';
 import {onMount,onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
 import {localSaveSession} from '$lib/ui/local-save-session';
 import {sessionPresets,rememberPreset,savePresetFile,downloadPresetFile,removeSessionPreset,renameSessionPreset} from '$lib/presets/preset-session.ts';
 import {presetDomain,type PresetDomain,type PresetKind,type SessionPreset} from '$lib/presets/preset-session-format.ts';
 import {readPresetText,compactPresetFile,PRESET_ACCEPT} from '$lib/presets/preset-file.ts';
 import {createShareFile} from '$lib/presets/preset-share-file.ts';
 import {presetItems} from '$lib/presets/preset-items.ts';
 import {presetPickerWords} from '$lib/world/preset-picker-words.ts';
 import {serviceWords} from '$lib/presets/service-words.ts';
 import {worldArtwork} from '$lib/world/world-artwork.ts';
 import {openPublicItemMaster} from '$lib/items/public-item-master.ts';
 type NativeRow={ordinal:number;kind:'tom-furniture'|'tom-clothing'|'native-decoration';storage:string;baseItemId:number|null;name:string|null;active:boolean};
 type NativeIndex={contract:string;gameSchema:number;groups:{group:string;status:string;count:number|null}[];rows:NativeRow[];writerAuthorized:false};
 let locale:WandLanguage='ja',root:'wand'|'tom'|'game'|'my'='wand',myDomain:PresetDomain='wand',view:'current'|'backups'|'published'|'browse'='browse',kind:PresetKind|'all'='all',query='',selected=0,alias='',input:HTMLInputElement,reading=false,error=false;
 let job:Worker|null=null,index:NativeIndex|null=null,source:File|null=null,nativeError=false,nativeBusy=false,alive=true,epoch=0;
 let sharing=false,shareError=false;
 let counts:Map<number,number>|null=null,images=new Map<number,string>(),names=new Map<number,string>(),packedSize:number|null=null,detailsEpoch=0,code='',purpose:'decoration'|'shop'='decoration',codeView='';
 const kindIndex:Record<PresetKind,number>={scene:11,support:12,biome:13,island:14,world:15,region:16,room:17,floor:18,building:19,design:20,network:21,'tom-furniture':22,'tom-clothing':23,'native-decoration':24,'decoration-code':25,'shop-code':26};
 const domains:PresetDomain[]=['wand','tom','game'];
 const roots=['wand','tom','game','my'] as const;
 const labels={wand:'Wand Presets',tom:'Touch of Magic',game:'In-Game Presets',my:'My Presets'};
 $: cw=catalogWords[locale];$: w=serviceWords[locale];$: p=presetPickerWords[locale];$: domain=root==='my'?myDomain:root;
 $: entries=$sessionPresets.filter(e=>e.domain===domain&&(kind==='all'||e.kind===kind)&&e.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice().reverse();
 $: current=entries.find(e=>e.id===selected);
 $: nativeRows=index?.rows.filter(e=>presetDomain(e.kind)===domain&&(kind==='all'||e.kind===kind))??[];
 $: kinds=(Object.keys(kindIndex) as PresetKind[]).filter(k=>presetDomain(k)===domain);
 $: if(source!==$localSaveSession.file)resetNative($localSaveSession.file);
 $: void detail(current,locale);
 onMount(()=>watchWandLanguage(v=>locale=v));
 onDestroy(()=>{alive=false;epoch++;detailsEpoch++;job?.terminate();});
 function resetNative(file:File|null){epoch++;job?.terminate();job=null;source=file;index=null;nativeBusy=false;nativeError=false;}
 function switchRoot(v:typeof root){root=v;kind='all';query='';selected=0;view=v==='wand'?'browse':'backups';}
 function switchDomain(v:PresetDomain){myDomain=v;kind='all';query='';selected=0;view='backups';}
 function choose(e:SessionPreset){selected=e.id;alias=e.name;}
 async function add(e:Event){const el=e.currentTarget as HTMLInputElement,files=[...(el.files??[])];el.value='';if(reading)return;reading=true;error=false;try{for(const file of files){try{const row=await rememberPreset(file);if(alive){if(row.domain===domain)choose(row);else error=true;}}catch{if(alive)error=true;}}}finally{if(alive)reading=false;}}
 async function detail(entry:SessionPreset|undefined,language:WandLanguage){
  const token=++detailsEpoch;counts=null;images=new Map();names=new Map();packedSize=null;codeView='';if(!entry)return;
  try{const raw=await readPresetText(entry.file);if(!alive||token!==detailsEpoch)return;counts=entry.privateBackup?null:presetItems(raw);
   if(entry.kind==='decoration-code'||entry.kind==='shop-code')codeView=JSON.parse(raw).code;
   const packed=await compactPresetFile(raw,entry.name);if(!alive||token!==detailsEpoch)return;packedSize=packed.size;
   const ids=[...(counts?.keys()??[])].slice(0,120);if(!ids.length)return;
   for(const id of ids.slice(0,32))void worldArtwork(base,id).then(url=>{if(alive&&token===detailsEpoch&&url)images=new Map(images).set(id,url);}).catch(()=>{});
   const db=await openPublicItemMaster(base,fetch,{scope:'complete',gameVersion:'1.26.2'}),all=await db.getBrowseNames(language),wanted=new Set(ids);
   if(alive&&token===detailsEpoch)names=new Map(all.filter(([id])=>wanted.has(id)));
  }catch{/* Imported files remain available for the target parser. */}
 }
 function native(command:'index'|'backup',ordinal?:number){
  if(!source||nativeBusy)return;const file=source,token=++epoch;nativeBusy=true;nativeError=false;
  const own=new Worker(new URL('../../lib/presets/native-preset.worker.ts',import.meta.url),{type:'module'});job=own;
  const done=(d:any)=>{own.terminate();if(job!==own||!alive||source!==file||epoch!==token)return;job=null;nativeBusy=false;
   try{if(command==='index'&&d?.kind==='index'&&d.result?.contract==='wand.native-preset-index@1'&&Array.isArray(d.result.rows)&&Array.isArray(d.result.groups)&&d.result.writerAuthorized===false)index=d.result;
    else if(command==='backup'&&d?.kind==='backup'&&typeof d.raw==='string'){savePresetFile(d.raw,'wand-'+(index?.rows.find(e=>e.ordinal===ordinal)?.kind??'native')+'-backup-'+ordinal+'.json');}
    else throw Error('native');}catch{nativeError=true;}
  };own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);own.postMessage({command,file,ordinal});
 }
 async function shareFile(entry:SessionPreset){
  if(sharing||entry.domain!=='wand')return;sharing=true;shareError=false;
  try{const packed=await createShareFile(entry.file,entry.name+'-shared',base);if(!alive)return;const url=URL.createObjectURL(packed),a=document.createElement('a');a.href=url;a.download=packed.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch{if(alive)shareError=true;}finally{if(alive)sharing=false;}
 }
 function saveCode(){const value=code.trim();if(!value||value.length>128||/[\u0000-\u001f\u007f]/.test(value)){error=true;return;}savePresetFile(JSON.stringify({schema:'wand.preset.game-code@1',purpose,code:value,status:'unverified'}),'wand-'+purpose+'-code.json');code='';}
</script>
<svelte:head><title>Presets · Dreamwish Wand</title></svelte:head>
<section class="preset-service">
 <h1>Presets</h1>
 <nav aria-label="Presets">{#each roots as key}<button type="button" aria-pressed={root===key} on:click={()=>switchRoot(key)}>{labels[key]}</button>{/each}</nav>
 {#if root==='my'}<nav aria-label="My Presets">{#each domains as key}<button type="button" aria-pressed={myDomain===key} on:click={()=>switchDomain(key)}>{labels[key]}</button>{/each}</nav>{/if}
 <nav aria-label={w[19]}>{#if root==='wand'}<button type="button" aria-pressed={view==='browse'} on:click={()=>view='browse'}>{cw[0]}</button>{/if}{#if domain!=='wand'}<button type="button" aria-pressed={view==='current'} on:click={()=>view='current'}>{w[1]}</button>{/if}<button type="button" aria-pressed={view==='backups'} on:click={()=>view='backups'}>{w[2]}</button><button type="button" aria-pressed={view==='published'} on:click={()=>view='published'}>{w[3]}</button></nav>
 {#if view==='browse'}<PublicPresetCatalog {locale}/>
 {:else if view==='published'}{#if domain==='wand'}<PresetAuthorPanel {locale} entries={$sessionPresets} selectedEntry={current}/>{:else}<p role="status">{w[4]}</p>{/if}
 {:else if view==='current'}<div class="toolbar"><button type="button" disabled={!source||nativeBusy} on:click={()=>native('index')}>{w[1]}</button><select bind:value={kind} aria-label={w[19]}><option value="all">{w[15]}</option>{#each kinds as k}<option value={k}>{p[kindIndex[k]]}</option>{/each}</select>{#if !source}<small>{w[5]}</small>{/if}</div>
  {#if nativeError}<p role="alert">{w[6]}</p>{/if}
  {#if index?.groups.some(g=>g.status==='unavailable')}<p role="status">{w[7]}</p>{/if}
  <div class="native-list">{#each nativeRows as row (row.ordinal)}<article><strong>{row.name||p[kindIndex[row.kind]]}</strong><small>{row.storage==='female'?'♀':row.storage==='male'?'♂':''} {w[8]}</small><button type="button" disabled={nativeBusy} on:click={()=>native('backup',row.ordinal)}>{p[6]}</button></article>{:else}{#if index}<p>{p[9]}</p>{/if}{/each}</div>
  <small>{w[18]}</small>
 {:else}
  <div class="toolbar"><input type="file" hidden multiple accept={PRESET_ACCEPT} bind:this={input} on:change={add}/><button type="button" disabled={reading} on:click={()=>input.click()}>{p[1]}</button><input type="search" placeholder={p[2]} aria-label={p[2]} bind:value={query}/><select bind:value={kind} aria-label={w[19]}><option value="all">{w[15]}</option>{#each kinds as k}<option value={k}>{p[kindIndex[k]]}</option>{/each}</select></div>
  <small>{p[8]}</small>
  {#if domain==='game'}<form class="toolbar" on:submit|preventDefault={saveCode}><select bind:value={purpose} aria-label={w[19]}><option value="decoration">{w[13]}</option><option value="shop">{w[14]}</option></select><input maxlength="128" placeholder={w[11]} aria-label={w[11]} bind:value={code}/><button disabled={!code.trim()}>{w[10]}</button></form><small>{w[12]}</small>{/if}
  <div class="library"><div class="entries">{#each entries as entry (entry.id)}<button type="button" class="entry" aria-pressed={selected===entry.id} on:click={()=>choose(entry)}><strong>{entry.name}</strong><small>{p[kindIndex[entry.kind]]}{entry.privateBackup?' · '+w[8]:''}</small></button>{:else}<p>{p[9]}</p>{/each}</div>
  {#if current}<aside><strong>{current.name}</strong><small>{p[kindIndex[current.kind]]} {current.version??''}</small>{#if packedSize!==null}<small>{w[20]}: {packedSize.toLocaleString(locale)} B</small>{/if}
  {#if current.publicSource}<small>{cw[14]} · {current.publicSource.creatorName}</small>{/if}
  {#if current.privateBackup}<small>{w[8]} · {w[18]}</small><NativePresetDetail entry={current} {locale}/><NativeRestoreReview entry={current} {source} {locale}/>{#if current.kind==='native-decoration'}<NativeSceneConvert entry={current} {locale}/>{/if}{:else}<small>{w[21]}</small>{/if}
  {#if counts}<small>{counts.size} / {[...counts.values()].reduce((n,v)=>n+v,0)}</small><div class="item-list">{#each [...counts].slice(0,120) as [id,n] (id)}<div>{#if images.has(id)}<img src={images.get(id)} alt="" loading="lazy"/>{/if}<span>{names.get(id)??'—'}</span><strong>×{n}</strong></div>{/each}</div>{/if}
  {#if codeView}<code>{codeView}</code><small>{w[12]}</small>{/if}
  <div class="toolbar"><input bind:value={alias} maxlength="160" aria-label={p[4]}/><button type="button" on:click={()=>{if(current&&!renameSessionPreset(current.id,alias))error=true;}}>{p[4]}</button></div>
  <div class="toolbar"><button type="button" on:click={()=>{if(current)void downloadPresetFile(current.file,current.name).catch(()=>error=true);}}>{p[6]}</button><button type="button" on:click={()=>{if(current)removeSessionPreset(current.id);selected=0;}}>{p[5]}</button>{#if current.domain==='wand'}<button type="button" disabled={sharing} on:click={()=>current&&void shareFile(current)}>{w[22]}</button><a href={base+'/world/'}>{w[9]}</a>{/if}</div></aside>{/if}</div>
 {/if}
 {#if error}<small role="alert">{p[10]}</small>{/if}{#if shareError}<small role="alert">{w[23]}</small>{/if}
</section>
<style>
 .preset-service{display:grid;gap:10px;padding:14px;min-width:0}h1{margin:0;font-size:1.4rem}nav,.toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}button,input,select,a{color:inherit;font:inherit}button,input,select{padding:7px;border-radius:5px;border:1px solid var(--wand-line);background:var(--wand-card)}button[aria-pressed=true]{outline:2px solid var(--wand-accent,currentColor);outline-offset:-2px}button:disabled{opacity:.5}a{padding:7px}
 .library{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr);gap:10px;align-items:start}.entries,.native-list{display:grid;gap:6px}.entry,article{display:flex;flex-direction:column;align-items:start;gap:5px;text-align:left;min-width:0;overflow-wrap:anywhere}article,aside{padding:10px;border:1px solid var(--wand-line);border-radius:7px;background:var(--wand-card)}aside{display:grid;gap:8px}.item-list{max-height:40vh;overflow:auto;display:grid;gap:4px}.item-list>div{display:flex;align-items:center;gap:6px}.item-list span{flex:1}.item-list img{width:36px;height:36px;object-fit:contain}code{overflow-wrap:anywhere}@media(max-width:680px){.library{grid-template-columns:1fr}}
</style>
