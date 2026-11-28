<script lang="ts">
  import {onMount} from 'svelte';
  import type {PremiumBundleRevision,PublicCompleteItemMaster} from '../items/public-item-master.ts';
  import type {loadShopSourceMedia} from './shop-source-media.ts';
  import {readShopContentArtwork,type ShopContentArtwork} from './shop-content-artwork.ts';
  import {bundleArtworkUrl,type BundleArtwork} from './bundle-artwork.ts';
  import {itemMedia} from './item-media.ts';
  import {watchWandLanguage,type WandLanguage} from '../ui/preferences.ts';
  let {revision,reader,database,detail=false}:{
    revision:PremiumBundleRevision;reader:Awaited<ReturnType<typeof loadShopSourceMedia>>;
    database:PublicCompleteItemMaster;detail?:boolean
  }=$props();
  let rows=$state<readonly ShopContentArtwork[]>([]);
  let names=$state<ReadonlyMap<number,string>>(new Map());
  let locale=$state<WandLanguage>('ja');
  let loading=$state(true),error=$state('');
  const url=(asset:BundleArtwork,original:boolean)=>bundleArtworkUrl('https://media.dreamwishwand.com',asset,original)??undefined;
  onMount(()=>watchWandLanguage(v=>locale=v));
  $effect(()=>{
    const r=revision,db=database,language=locale;
    let alive=true;names=new Map();
    const ids=[...new Set(r.components.map(c=>c.itemId))];
    void db.getItems(ids).then(items=>{
      if(alive)names=new Map(items.flatMap(item=>item?.names[language]?[[item.itemId,item.names[language]] as const]:[]));
    }).catch(()=>{});
    return ()=>{alive=false;};
  });
  $effect(()=>{
    const r=revision,shop=reader,variant=detail?'original':'thumbnail';
    let alive=true;rows=[];loading=true;error='';
    void readShopContentArtwork(r,shop,itemMedia,variant)
      .then(result=>{if(alive)rows=result;})
      .catch(e=>{if(alive)error=e instanceof Error?e.message:String(e);})
      .finally(()=>{if(alive)loading=false;});
    return ()=>{alive=false;};
  });
</script>
<div class="contents" aria-busy={loading}>
  <h3>Contents · {revision.components.length}</h3>
  <p class="note">定義順 / Source order — runtime Items sequence unverified</p>
  {#if loading}<p role="status">Loading…</p>
  {:else if error}<p role="alert">{error}</p>
  {:else}
    <div class="cards">
      {#each rows as row (row.position)}
        <div class="item">
          <div class="pictures">
            {#if row.kind==='explicit'}
              {#if row.sprite}<figure><img src={url(row.sprite,detail)} alt="" loading="lazy" decoding="async"/><figcaption>Sprite</figcaption></figure>{/if}
              {#if row.texture && row.texture.original.sha256!==row.sprite?.original.sha256}<figure><img src={url(row.texture,detail)} alt="" loading="lazy" decoding="async"/><figcaption>Texture2D</figcaption></figure>{/if}
              {#if !row.sprite&&!row.texture}<span class="missing">Image unavailable</span>{/if}
            {:else if row.item}<figure><img src={row.item.url} alt="" loading="lazy" decoding="async"/><figcaption>Item DB</figcaption></figure>
            {:else}<span class="missing">No image</span>{/if}
            {#if row.component.quantity!==1}<span class="quantity">{row.component.quantity}</span>{/if}
          </div>
          <span class="name">{names.get(row.component.itemId)??String(row.component.itemId)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
<style>
  .contents{margin:12px 0}.contents h3{margin:0 0 4px}
  .note{font-size:.8rem;color:var(--wand-muted);margin:0 0 8px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
  .item{min-width:0;border:1px solid var(--wand-line);background:var(--wand-card);border-radius:6px;padding:5px}
  .pictures{position:relative;display:flex;min-height:100px;align-items:center;justify-content:center;gap:3px}
  figure{margin:0;min-width:0;flex:1;text-align:center}
  img{width:100%;height:100px;object-fit:contain;display:block}
  figcaption,.missing{font-size:.7rem;color:var(--wand-muted)}
  .quantity{position:absolute;right:0;top:0;background:var(--wand-card);border:1px solid var(--wand-line);padding:2px 5px;border-radius:4px;font-variant-numeric:tabular-nums}
  .name{display:block;text-align:center;overflow-wrap:anywhere;font-size:.85rem}
</style>
