<script lang="ts">
 import {onDestroy} from 'svelte';
 import {base} from '$app/paths';
 import type {WandLanguage} from '$lib/ui/preferences';
 import {wandAccountAccess} from '$lib/ui/wand-account-access.ts';
 import {authorContext,publishPreset,retirePreset,loadAuthorImage,uploadAuthorImage,type AuthorImage} from './preset-author-client.ts';
 import {authorWords} from './author-words.ts';
 import type {SessionPreset} from './preset-session-format.ts';
 export let locale:WandLanguage;
 export let entries:readonly SessionPreset[];
 export let selectedEntry:SessionPreset|undefined=undefined;
 type Profile={creator_profile_id:string;display_name:string};
 type Work={artifactId:string;creatorProfileId:string;kind:string;title:string;description:string;state:'published'|'unpublished'};
 let profiles:Profile[]=[],media:AuthorImage[]=[],works:Work[]=[],title='',description='',creator='',entryId=0,artifactId='',selectedMedia:string[]=[],rights=false,busy=false,error=false,success=false,epoch=0,previewUrls=new Map<string,string>(),imageBusy='',input:HTMLInputElement;
 let previous:typeof $wandAccountAccess=null,previousEntry:SessionPreset|undefined,requestId='';
 $: w=authorWords[locale];
 $: eligible=entries.filter(e=>e.domain==='wand'&&!e.privateBackup&&!e.publicSource);
 $: chosen=eligible.find(e=>e.id===entryId);
 $: if(previous!==$wandAccountAccess){previous=$wandAccountAccess;reset();if(previous)void refresh();}
 $: if(selectedEntry!==previousEntry){previousEntry=selectedEntry;if(selectedEntry&&eligible.some(e=>e.id===selectedEntry?.id)){entryId=selectedEntry.id;title=selectedEntry.name;artifactId='';requestId='';}}
 function revoke(){for(const url of previewUrls.values())URL.revokeObjectURL(url);previewUrls=new Map();}
 function reset(){epoch++;revoke();profiles=[];media=[];works=[];selectedMedia=[];creator='';artifactId='';rights=false;busy=false;error=false;success=false;requestId='';imageBusy='';}
 onDestroy(reset);
 async function refresh(){
  const transport=$wandAccountAccess;if(!transport)return;const token=epoch;
  try{const data=await authorContext(transport);if(token!==epoch)return;
   profiles=data.profiles.filter((p:any)=>typeof p.creator_profile_id==='string'&&typeof p.display_name==='string');
   media=data.media.filter((m:any)=>typeof m.media_id==='string'&&['image/jpeg','image/png','image/webp'].includes(m.mime_type));
   works=data.works.filter((v:any)=>typeof v.artifactId==='string'&&typeof v.title==='string'&&['published','unpublished'].includes(v.state));
   if(!profiles.some(p=>p.creator_profile_id===creator))creator=profiles[0]?.creator_profile_id??'';
  }catch{if(token===epoch)error=true;}
 }
 function edit(work:Work){artifactId=work.artifactId;title=work.title;description=work.description;creator=work.creatorProfileId;entryId=0;selectedMedia=[];rights=false;requestId='';success=false;}
 function fresh(){artifactId='';title=chosen?.name??'';description='';selectedMedia=[];rights=false;requestId='';success=false;}
 function toggle(id:string){selectedMedia=selectedMedia.includes(id)?selectedMedia.filter(x=>x!==id):selectedMedia.length<10?[...selectedMedia,id]:selectedMedia;requestId='';}
 async function preview(m:AuthorImage){const transport=$wandAccountAccess;if(!transport||imageBusy||previewUrls.has(m.media_id))return;const token=epoch;imageBusy=m.media_id;error=false;try{const blob=await loadAuthorImage(transport,m.media_id);if(token===epoch)previewUrls=new Map(previewUrls).set(m.media_id,URL.createObjectURL(blob));}catch{if(token===epoch)error=true;}finally{if(token===epoch)imageBusy='';}}
 async function addImage(e:Event){const file=(e.currentTarget as HTMLInputElement).files?.[0],transport=$wandAccountAccess;input.value='';if(!file||!transport||!rights||busy)return;const token=epoch;busy=true;error=false;
  try{const id=await uploadAuthorImage(transport,file,rights);if(token!==epoch)return;await refresh();if(token===epoch&&selectedMedia.length<10&&!selectedMedia.includes(id)){selectedMedia=[...selectedMedia,id];requestId='';}}catch{if(token===epoch)error=true;}finally{if(token===epoch)busy=false;}
 }
 async function submit(){const transport=$wandAccountAccess,entry=chosen;if(!transport||!entry||busy)return;const token=epoch;busy=true;error=false;success=false;requestId ||= crypto.randomUUID();
  try{await publishPreset(transport,entry,{title,description,creatorProfileId:creator,mediaIds:selectedMedia,ownWorkConfirmed:rights,...(artifactId?{presetArtifactId:artifactId}:{}),idempotencyKey:requestId},base);if(token!==epoch)return;success=true;requestId='';await refresh();}catch{if(token===epoch)error=true;}finally{if(token===epoch)busy=false;}
 }
 async function retire(work:Work,action:'unpublish'|'delete'){const transport=$wandAccountAccess;if(!transport||busy||!window.confirm(w[action==='delete'?22:21]))return;const token=epoch;busy=true;error=false;try{await retirePreset(transport,action,work.artifactId,crypto.randomUUID());if(token===epoch)await refresh();}catch{if(token===epoch)error=true;}finally{if(token===epoch)busy=false;}}
</script>
<section class="author-panel">
 {#if !$wandAccountAccess}<p role="status">{w[1]} {w[24]}</p>
 {:else}
 <div class="toolbar"><button type="button" disabled={busy} on:click={fresh}>{w[15]}</button></div>
 {#if works.length}<div class="works">{#each works as work (work.artifactId)}<article><strong>{work.title}</strong><small>{work.state==='published'?w[10]:w[11]}</small><div class="toolbar"><button type="button" disabled={busy} on:click={()=>edit(work)}>{w[14]}</button>{#if work.state==='published'}<button type="button" disabled={busy} on:click={()=>retire(work,'unpublish')}>{w[8]}</button>{/if}<button type="button" disabled={busy} on:click={()=>retire(work,'delete')}>{w[9]}</button></div></article>{/each}</div>{:else}<small>{w[13]}</small>{/if}
 <form on:submit|preventDefault={submit}>
  <strong>{artifactId?w[14]:w[15]}</strong>
  <label>{w[20]}<select bind:value={entryId} disabled={busy} on:change={()=>{requestId='';if(!artifactId)title=eligible.find(e=>e.id===entryId)?.name??'';}}><option value={0}>—</option>{#each eligible as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}</select></label>
  <label>{w[4]}<select bind:value={creator} disabled={busy} on:change={()=>requestId=''}>{#each profiles as profile (profile.creator_profile_id)}<option value={profile.creator_profile_id}>{profile.display_name}</option>{/each}</select></label>
  {#if !profiles.length}<small>{w[19]}</small>{/if}
  <label>{w[2]}<input bind:value={title} maxlength="240" required disabled={busy} on:input={()=>requestId=''}/></label>
  <label>{w[3]}<textarea bind:value={description} maxlength="20000" disabled={busy} on:input={()=>requestId=''} rows="3"></textarea></label>
  <label class="check"><input type="checkbox" bind:checked={rights} disabled={busy} on:change={()=>requestId=''}/>{w[6]}</label>
  <div class="toolbar"><strong>{w[5]} ({selectedMedia.length}/10)</strong><input hidden type="file" accept="image/jpeg,image/png,image/webp" bind:this={input} on:change={addImage}/><button type="button" disabled={!rights||busy} on:click={()=>input.click()}>{w[16]}</button></div>
  <div class="media-grid">{#each media as m (m.media_id)}<article>
   {#if previewUrls.has(m.media_id)}<img src={previewUrls.get(m.media_id)} alt="" loading="lazy"/>{:else}<button type="button" disabled={!!imageBusy||busy} on:click={()=>preview(m)}>{w[17]}</button>{/if}
   <small>{new Date(m.created_at).toLocaleDateString(locale)} · {m.width}×{m.height}</small>
   <label class="check"><input type="checkbox" checked={selectedMedia.includes(m.media_id)} disabled={busy||!previewUrls.has(m.media_id)&&!selectedMedia.includes(m.media_id)||selectedMedia.length>=10&&!selectedMedia.includes(m.media_id)} on:change={()=>toggle(m.media_id)}/>{w[5]}</label>
  </article>{/each}</div>
  <small>{w[23]}</small><button type="submit" disabled={busy||!chosen||!creator||!title.trim()||!rights||selectedMedia.length===0}>{artifactId?w[14]:w[7]}</button>
 </form>
 {#if error}<p role="alert">{w[12]}</p>{/if}{#if success}<p role="status">{w[18]}</p>{/if}
 {/if}
</section>
<style>
 .author-panel,form,label,article{display:grid;gap:8px}.toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.works,.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}article,form{padding:10px;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:6px}button,input,select,textarea{font:inherit;color:inherit;background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:6px}button:disabled{opacity:.5}.check{display:flex;align-items:center;gap:6px}article img{width:100%;aspect-ratio:16/9;object-fit:cover}
</style>
