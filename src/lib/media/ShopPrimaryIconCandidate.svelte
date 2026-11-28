<script lang="ts">
  import {base} from '$app/paths';
  import {openCurrentItemDatabase} from '../items/public-item-master.ts';
  import {itemMedia} from './item-media.ts';
  import {readShopPrimaryIconCandidate} from './shop-primary-icon.ts';
  let {itemId,detail=false}:{itemId:number;detail?:boolean}=$props();
  let profile=$state<'default'|'male'>('default');
  let result=$state<Awaited<ReturnType<typeof readShopPrimaryIconCandidate>>>(null);
  let loading=$state(true);
  // Diagnostic only. No access to the save or profile; default is a chosen
  // comparison context. A distinct male icon is never substituted by primary.
  let db:ReturnType<typeof openCurrentItemDatabase>|null=null;
  $effect(()=>{
    const id=itemId,variant=detail?'original':'thumbnail',context=profile;
    let live=true;result=null;loading=true;
    db??=openCurrentItemDatabase(base);
    void db.then(master=>readShopPrimaryIconCandidate(master,itemMedia,id,variant,context))
      .then(r=>{if(live)result=r;}).catch(()=>{db=null;})
      .finally(()=>{if(live)loading=false;});
    return ()=>{live=false;};
  });
</script>
<div class="fallback" aria-busy={loading}>
  {#if result?.image}<img src={result.image.url} alt="" loading="lazy" decoding="async"/>{/if}
  <div class="caption">
    {#if loading}<small role="status">Item DB 読み込み中…</small>
    {:else if result?.image}<small>Item DB · 比較候補</small>
    {:else if result?.selection.status==='male'}<small>男性用画像未解決</small>
    {:else}<small>Item DB画像未解決</small>{/if}
    {#if result?.selection.status==='male'||(result?.selection.status==='primary'&&result.selection.className==='ClothingItemData')}
      <div class="context">
        <button type="button" aria-pressed={profile==='default'} onclick={()=>profile='default'}>Default</button>
        <button type="button" aria-pressed={profile==='male'} onclick={()=>profile='male'}>Male</button>
      </div>
    {:else if profile==='male'}<button type="button" onclick={()=>profile='default'}>Default</button>{/if}
  </div>
</div>
<style>
  .fallback{width:100%;height:100%;min-height:0;position:relative;display:grid;place-items:center;overflow:hidden}
  img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0}
  .caption{position:absolute;bottom:0;max-width:100%;text-align:center;background:var(--wand-card);padding:3px;border-radius:3px}
  small{font-size:.7rem}.context{display:flex;justify-content:center;gap:2px}
  button{font-size:.7rem;padding:2px 4px;background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:3px}
  button[aria-pressed=true]{border-color:var(--wand-accent)}
</style>
