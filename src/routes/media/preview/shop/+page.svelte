<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {openCurrentItemDatabase,type PremiumBundleDefinition} from '$lib/items/public-item-master.ts';
  import {loadShopSourceMedia} from '$lib/media/shop-source-media.ts';
  import {inspectShopArtwork} from '$lib/media/shop-artwork-inspection.ts';
  import {bundleArtworkUrl,type BundleArtwork} from '$lib/media/bundle-artwork.ts';
  let definitions:readonly PremiumBundleDefinition[]=[];
  let reader:Awaited<ReturnType<typeof loadShopSourceMedia>>|null=null;
  let query='',selected='',source:'current'|'legacy'='current',detail=false,groupWidth=1500;
  let loading=true,error='';
  const origin='https://media.dreamwishwand.com';
  const url=(a:BundleArtwork,original:boolean)=>bundleArtworkUrl(origin,a,original)??undefined;
  $: filtered=definitions.filter(b=>[b.bundleId,b.current?.title,b.legacy?.title].some(v=>v?.toLowerCase().includes(query.trim().toLowerCase())));
  $: definition=definitions.find(b=>b.bundleId===selected);
  $: revision=definition?.[source]??null;
  $: inspection=revision&&reader?inspectShopArtwork(revision,reader,groupWidth):null;
  function choose(b:PremiumBundleDefinition){selected=b.bundleId;source=b.current?'current':'legacy';}
  onMount(()=>{
    let alive=true;
    Promise.all([openCurrentItemDatabase(base).then(db=>db.getPremiumBundleCatalog()),loadShopSourceMedia()])
      .then(([catalog,r])=>{if(!alive)return;if(!catalog)throw new Error('Bundle catalog unavailable');
        definitions=catalog.definitions;reader=r;if(definitions[0])choose(definitions[0]);})
      .catch(e=>{if(alive)error=e instanceof Error?e.message:String(e);})
      .finally(()=>{if(alive)loading=false;});
    return ()=>{alive=false;};
  });
</script>
<svelte:head><title>Dreamwish Wand — Shop artwork preview</title></svelte:head>
<main>
  <header><h1>Shop artwork preview</h1><p>原本画像・配置候補の検証専用。ゲーム内表示との一致、販売状況は未確認。</p></header>
  {#if loading}<p role="status">Loading…</p>
  {:else if error}<p role="alert">{error}</p>
  {:else}
    <div class="workspace">
      <aside>
        <label>Bundle search <input bind:value={query} placeholder="Bundle ID / title" /></label>
        <p>{filtered.length} / {definitions.length}</p>
        <div class="list">
          {#each filtered as b (b.bundleId)}
            <button class:active={selected===b.bundleId} aria-pressed={selected===b.bundleId} onclick={()=>choose(b)}>{b.current?.title??b.legacy?.title??b.bundleId}<small>{b.bundleId}</small></button>
          {/each}
        </div>
      </aside>
      <section>
        {#if definition}
          <h2>{revision?.title??definition.bundleId}</h2>
          <div class="controls">
            <button disabled={!definition.current} aria-pressed={source==='current'} onclick={()=>source='current'}>Steam</button>
            <button disabled={!definition.legacy} aria-pressed={source==='legacy'} onclick={()=>source='legacy'}>Switch</button>
            <label><input type="checkbox" bind:checked={detail}/> Original resolution</label>
          </div>
        {/if}
        {#if inspection && revision}
          <p>LightLayout: {String(revision.artwork?.lightLayout??'未指定')} / Layout: {String(revision.artwork?.layout??'未指定')}</p>
          <label>比較用 group width <input type="number" min="541" max="16384" bind:value={groupWidth}/></label>
          {#if inspection.template}
            {@const t=inspection.template}
            <p>配置候補（背景・調整・Icon選択未確定）</p>
            <div class="candidate" style:aspect-ratio={t.artworkWidth+' / '+t.artworkHeight}>
              {#each inspection.slots as slot (slot.binding)}
                <div class="slot" style:left={100*slot.x/t.artworkWidth+'%'} style:width={100*slot.width/t.artworkWidth+'%'}>
                  {#if slot.image}<img src={url(slot.image,detail)} alt={slot.binding} loading="lazy" decoding="async"/>
                  {:else}<span>{slot.binding}<br/>未確定</span>{/if}
                </div>
              {/each}
              {#if t.scroll}<div class="slot" style:left={100*t.scroll.x/t.artworkWidth+'%'} style:width={100*t.scroll.width/t.artworkWidth+'%'}>Scroll / Icon 未確定</div>{/if}
            </div>
          {/if}
          <h3>原本参照</h3>
          {#each inspection.rows.filter(r=>r.address!=null&&r.address!=='') as row (row.field)}
            <article>
              <strong>{row.field}{row.itemId?' · '+row.itemId:''}</strong>
              <small>{String(row.address)}</small>
              <div class="images">
                {#each [{kind:'Sprite',asset:row.sprite},{kind:'Texture2D',asset:row.texture}] as entry (entry.kind)}
                  <div>
                    <span>{entry.kind}</span>
                    {#if entry.asset}<img src={url(entry.asset,detail)} alt={row.field+' '+entry.kind} loading="lazy" decoding="async"/><small>{entry.asset.original.width} × {entry.asset.original.height}</small>
                    {:else}<p>未登録 / 対象外</p>{/if}
                  </div>
                {/each}
              </div>
            </article>
          {:else}<p>明示的な画像参照なし。</p>{/each}
        {/if}
      </section>
    </div>
  {/if}
</main>
<style>
  main{color:var(--wand-text);background:var(--wand-bg);padding:12px;min-height:80vh}
  h1,h2,h3,p{margin:0 0 8px} h1{font-size:1.25rem} h2{font-size:1.1rem}
  .workspace{display:grid;grid-template-columns:minmax(180px, min(28vw,340px)) minmax(0,1fr);gap:12px}
  aside,section{min-width:0} aside{position:sticky;top:0;align-self:start}
  .list{max-height:70vh;overflow:auto;display:grid;gap:4px}
  button,input{color:var(--wand-text);background:var(--wand-card);border:1px solid var(--wand-line);border-radius:5px;padding:6px}
  button.active,button[aria-pressed=true]{border-color:var(--wand-accent);outline:1px solid var(--wand-accent)}
  button:disabled{opacity:.5} .list button{text-align:left;overflow-wrap:anywhere}
  input:not([type=checkbox]){max-width:100%;box-sizing:border-box}
  .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  small{display:block;color:var(--wand-muted);overflow-wrap:anywhere}
  .candidate{position:relative;max-width:100%;background:var(--wand-card);border:1px solid var(--wand-line);margin:8px 0}
  .slot{position:absolute;top:0;height:100%;box-sizing:border-box;border:1px dashed var(--wand-line);display:grid;place-items:center;text-align:center;overflow:hidden}
  .slot img{width:100%;height:100%;object-fit:contain}
  article{background:var(--wand-card);border:1px solid var(--wand-line);padding:8px;margin-bottom:8px}
  .images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .images img{display:block;max-width:100%;max-height:60vh;object-fit:contain}
  @media(max-width:650px){.workspace{grid-template-columns:1fr}aside{position:static}.list{max-height:25vh}}
</style>
