<script lang="ts">
  import type {PublicCompleteItemMaster} from '../items/public-item-master.ts';
  import type {createShopSourceReader} from './shop-source-media.ts';
  import {ITEM_MEDIA_ACTIVATION,itemMedia} from './item-media.ts';
  import {readShopPrimaryIconCandidate,type ShopIconConsumer} from './shop-primary-icon.ts';
  let {itemId,detail=false,profile,database,reader,consumer='Icon',gameVersion}:{itemId:number;detail?:boolean;profile:'default'|'male';database:PublicCompleteItemMaster|null;reader:ReturnType<typeof createShopSourceReader>|null;consumer?:ShopIconConsumer;gameVersion?:string}=$props();
  let result=$state<Awaited<ReturnType<typeof readShopPrimaryIconCandidate>>>(null);
  let loading=$state(true);
  // One shared comparison context and master per preview. Keep publication
  // version checks before resolving ItemID or native source artwork.
  $effect(()=>{
    const id=itemId,variant=detail?'original':'thumbnail',context=profile,master=database,source=reader,kind=consumer,version=gameVersion;
    let live=true;result=null;loading=true;
    if(!master||version!=='1.26.2'||master.release.target.platform!=='Steam'||master.release.target.gameVersion!==version||
      ITEM_MEDIA_ACTIVATION.state!=='published'||ITEM_MEDIA_ACTIVATION.gameVersion!=='steam-'+version){
      loading=false;return;
    }
    void readShopPrimaryIconCandidate(master,itemMedia,id,variant,context,source,kind)
      .then(r=>{if(live)result=r;}).catch(()=>{/* remain unresolved */})
      .finally(()=>{if(live)loading=false;});
    return ()=>{live=false;};
  });
</script>
<div class="fallback" aria-busy={loading}>
  {#if result?.image}<img src={result.image.url} alt="" loading="lazy" decoding="async"/>{/if}
  <div class="caption">
    {#if loading}<small role="status">Item DB 読み込み中…</small>
    {:else if result?.image}<small>{result.imageSource==='published_guid'?'原本GUID · 比較候補':'Item DB · 比較候補'}</small>
    {:else if result?.selection.status==='male'}<small>男性用画像未解決</small>
    {:else}<small>Item DB画像未解決</small>{/if}
  </div>
</div>
<style>
  .fallback{width:100%;height:100%;min-height:0;position:relative;display:grid;place-items:center;overflow:hidden}
  img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0}
  .caption{position:absolute;bottom:0;max-width:100%;text-align:center;background:var(--wand-card);padding:3px;border-radius:3px}
  small{font-size:.7rem}
</style>
