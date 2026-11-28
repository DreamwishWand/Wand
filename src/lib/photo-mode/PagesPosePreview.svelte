<script lang="ts">
  import {base} from '$app/paths';
  import {onMount} from 'svelte';
  import {localSaveSession} from '$lib/ui/local-save-session';
  import {selectEyeMaterial,eyeMaterialKey} from './eye-palette.ts';
  import {savedSkinIndex} from './skin-palette.ts';
  import {savedBodyPreference} from './saved-avatar-appearance.ts';
  import PosePreview from './PosePreview.svelte';
  import {loadPagesPoseIndex,bodyTypes,assetUrl,loadPreviewScene,relatedPoseMatches,collectionPoseHref,collectionPoseFromSearch,poseRows,type PreviewIndex} from './pages-preview.ts';
  import {poseCopy} from './preview-copy.ts';
  let {itemId,locale,getRelatedName}:{itemId:number;locale:string;getRelatedName?:(id:number,locale:string)=>Promise<string|null>}=$props();
  let index=$state<PreviewIndex|null>(null);
  let expanded=$state(false);
  let copy=$derived(poseCopy(locale));
  let selection=$state({itemId:0,pose:0});
  let poses=$derived(index?poseRows(index,itemId):[]);
  let poseIndex=$derived(selection.itemId===itemId&&selection.pose<poses.length?selection.pose:0);
  let row=$derived(poses[poseIndex]);
  let appearance=$derived($localSaveSession.avatarAppearance);
  let skinKey=$derived(bodyTypes.map(b=>savedSkinIndex(appearance,b,row?.[b]?.kind==='mermaid')??'-').join(':'));
  let eyeKey=$derived(bodyTypes.map(b=>eyeMaterialKey(selectEyeMaterial(index?.eyePalette,appearance,b,row?.[b]?.kind==='mermaid'))).join('|'));
  let savedSkinAvailable=$derived(!!index?.skinPalette&&bodyTypes.some(b=>row?.[b]&&savedSkinIndex(appearance,b,row[b]?.kind==='mermaid')!==undefined));
  let options=$derived.by(()=>{
    const m=index,r=row,c=copy;
    if(!m||!r)return [];
    return bodyTypes.flatMap((b,i)=>{
      const entry=r[b],skin=savedSkinIndex(appearance,b,entry?.kind==='mermaid');
      return entry?[{id:b,iconUrl:assetUrl(base,m.bodyIcons[b],'.png'),label:c.bodyType+' '+(i+1),load:(signal:AbortSignal)=>loadPreviewScene(base,itemId,b,m,entry,c.companion,signal,c.prop,skin,selectEyeMaterial(m.eyePalette,appearance,b,entry.kind==='mermaid'))}]:[];
    });
  });
  let playerOnly=$derived(bodyTypes.some(b=>{const o=row?.[b];return [70200018,70200020,70200029].includes(itemId)&&(o?.kind==='player'&&o.accessoryIncluded===false&&o.companionIncluded===undefined||o?.kind==='mermaid'&&o.accessoryIncluded!==true)}));
  let companionOnly=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded===false}));
  let partialActor=$derived(companionOnly&&bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='pair'||o?.kind==='player'&&o.companionIncluded===true}));
  let secondaryPassOmitted=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded===true&&o.secondaryPassOmitted===true}));
  let limboGeometryDiagnostic=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded===true&&o.limboGeometryDiagnostic===true}));
  let mermaidDiagnostic=$derived(bodyTypes.some(b=>row?.[b]?.kind==='mermaid'));
  let independentTiming=$derived(bodyTypes.some(b=>{const o=row?.[b];return o?.kind==='player'&&o.companionIncluded===true&&o.nativeLoops!==undefined}));
  let related=$derived(index?relatedPoseMatches(index,itemId,poseIndex):[]);
  let names=$derived(expanded&&getRelatedName?Promise.all(related.map(async match=>({...match,name:await getRelatedName!(match.itemId,locale).catch(()=>null)}))):Promise.resolve([]));
  onMount(()=>{
    let alive=true;
    void loadPagesPoseIndex(base).then(m=>{if(alive){index=m;if(m){const linked=collectionPoseFromSearch(m,itemId,window.location.search);if(linked!==null){selection={itemId,pose:linked};expanded=true}}}}).catch(()=>{});
    return()=>{alive=false};
  });
</script>
{#if options.length}
  <details class="pose-test" bind:open={expanded}>
    <summary>{copy.title}</summary>
    {#if expanded}
      <p>{copy.note} {#if savedSkinAvailable}{copy.savedSkin}{/if} {#if index?.eyePalette}{copy.eyeDiagnostic}{/if} {#if options.length===1}{copy.partial}{/if} {#if playerOnly}{copy.playerOnly}{/if} {#if partialActor}{copy.partialActor}{:else if companionOnly}{copy.companionOnly}{/if} {#if independentTiming}{copy.nativeLoops}{/if} {#if secondaryPassOmitted}{copy.secondaryPassOmitted}{/if} {#if itemId===120000145}{copy.residualMotion}{/if} {#if limboGeometryDiagnostic}{copy.limboGeometryDiagnostic}{/if} {#if mermaidDiagnostic}{copy.mermaidDiagnostic}{/if}</p>
      {#if poses.length>1}
        <div class="pose-variants" aria-label={copy.pose}>
          {#each poses as _,i}
            <button type="button" aria-pressed={poseIndex===i} onclick={()=>selection={itemId,pose:i}}>{copy.pose} {i+1}</button>
          {/each}
        </div>
      {/if}
      {#key itemId+':'+poseIndex}
        <PosePreview {options} {copy} preferredBody={savedBodyPreference(appearance)} appearanceKey={skinKey+':'+eyeKey}/>
      {/key}
      {#await names then items}
        {@const found=items.filter(x=>x.name)}
        {#if found.length}
          <div class="related-poses"><strong>{copy.related}</strong>
            {#each found as item (item.itemId)}
              <a href={collectionPoseHref(base,item.itemId,item.identity)}>{item.name}{#if item.poseIndex>0} · {copy.pose} {item.poseIndex+1}{/if}</a>
            {/each}
          </div>
        {/if}
      {/await}
    {/if}
  </details>
{/if}
<style>
  .pose-test{margin:8px 0;color:var(--wand-text)}
  summary{cursor:pointer;font-weight:600}
  p{font-size:.8rem}
  .pose-variants{display:flex;gap:4px;margin:4px 0}
  .pose-variants button{background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;min-height:36px;padding:4px 8px}
  .pose-variants button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}
  .pose-variants button:focus-visible{outline:2px solid var(--wand-focus)}
  .related-poses{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;font-size:.8rem;align-items:center}
  .related-poses a{color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;background:var(--wand-menu);padding:4px 6px}
  .related-poses a:focus-visible{outline:2px solid var(--wand-focus)}
</style>
