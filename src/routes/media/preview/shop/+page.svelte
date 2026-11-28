<script lang="ts">
  import {onMount} from 'svelte';
  import {readShopRuntimePrefix,type ShopRuntimePrefix} from '$lib/media/shop-runtime-items.ts';
  import {loadPinnedShopBundleSources} from '$lib/acquisition/public-native-shop.ts';
  import {createShopCategoryObservations,type ShopCategoryObservation} from '$lib/media/shop-category-observations.ts';
  import ShopBundleContents from '$lib/media/ShopBundleContents.svelte';
  import {base} from '$app/paths';
  import {openCurrentItemDatabase,type PremiumBundleDefinition,type PublicCompleteItemMaster} from '$lib/items/public-item-master.ts';
  import {loadShopSourceMedia} from '$lib/media/shop-source-media.ts';
  import ShopPrimaryIconCandidate from '$lib/media/ShopPrimaryIconCandidate.svelte';
  import {inspectShopArtwork,inspectOneLineShopArtwork} from '$lib/media/shop-artwork-inspection.ts';
  import {bundleArtworkUrl,type BundleArtwork} from '$lib/media/bundle-artwork.ts';
  let definitions:readonly PremiumBundleDefinition[]=[];
  let database:PublicCompleteItemMaster|null=null;
  let reader:Awaited<ReturnType<typeof loadShopSourceMedia>>|null=null;
  let profile:'default'|'male'='default';
  let query='',selected='',source:'current'|'legacy'='current',detail=false,groupWidth=1500,groupHeight=508;
  let loading=true,error='';
  let categoryLookup:ReturnType<typeof createShopCategoryObservations>|null=null;
  let categoryLoading=true,categoryFailed=false;
  let appearance='';
  let runtime:ShopRuntimePrefix|null=null;
  let runtimeRequest=0;
  async function loadRuntime(v:NonNullable<typeof revision>,db:PublicCompleteItemMaster){
    const request=++runtimeRequest;runtime=null;
    try{const result=await readShopRuntimePrefix(v,db);if(request===runtimeRequest)runtime=result;}catch{/* No inferred runtime order on missing DB data. */}
  }
  $: if(revision&&database)void loadRuntime(revision,database);
  $: observations=definition&&revision&&categoryLookup?categoryLookup(definition,revision):[];
  $: observation=observations.find(o=>o.snapshotKey===appearance)??observations.at(-1)??null;
  const appearanceLabel=(o:ShopCategoryObservation)=>o.snapshotKey+' · '+o.category;
  const origin='https://media.dreamwishwand.com';
  const url=(a:BundleArtwork,original:boolean)=>bundleArtworkUrl(origin,a,original)??undefined;
  $: filtered=definitions.filter(b=>[b.bundleId,b.current?.title,b.legacy?.title].some(v=>v?.toLowerCase().includes(query.trim().toLowerCase())));
  $: definition=definitions.find(b=>b.bundleId===selected);
  $: revision=definition?.[source]??null;
  $: inspection=revision&&reader?inspectShopArtwork(revision,reader,groupWidth,runtime):null;
  $: oneLine=revision&&reader&&observation?.presentation==='one_line'?inspectOneLineShopArtwork(revision,reader,groupWidth,groupHeight,runtime):null;
  function choose(b:PremiumBundleDefinition){selected=b.bundleId;source=b.current?'current':'legacy';appearance='';}
  onMount(()=>{
    let alive=true;
    void loadPinnedShopBundleSources(base).then(s=>{if(alive)categoryLookup=createShopCategoryObservations(s);}).catch(()=>{if(alive)categoryFailed=true;}).finally(()=>{if(alive)categoryLoading=false;});
    Promise.all([openCurrentItemDatabase(base).then(async db=>({db,catalog:await db.getPremiumBundleCatalog()})),loadShopSourceMedia()])
      .then(([{db,catalog},r])=>{if(!alive)return;if(!catalog)throw new Error('Bundle catalog unavailable');
        database=db;definitions=catalog.definitions;reader=r;if(definitions[0])choose(definitions[0]);})
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
            <button aria-pressed={profile==='default'} onclick={()=>profile='default'}>Default</button>
            <button aria-pressed={profile==='male'} onclick={()=>profile='male'}>Male</button>
          </div>
        {/if}
        {#if inspection && revision}
          <p>LightLayout: {inspection.native?.layout??String(revision.artwork?.lightLayout??'未指定')}{inspection.native?.layoutDefaulted?' (原本既定値)':''} / Layout: {String(revision.artwork?.layout??'未指定')}</p>
          {#if categoryLoading}<p role="status">掲載カテゴリ読み込み中…</p>
          {:else if categoryFailed}<p>掲載カテゴリ取得不可</p>
          {:else if observations.length}
            <label>原本掲載記録 <select value={observation?.snapshotKey??''} onchange={(e)=>appearance=e.currentTarget.value}>
              {#each observations as o (o.snapshotKey)}<option value={o.snapshotKey}>{appearanceLabel(o)}</option>{/each}
            </select></label>
            <p>{observation?.presentation==='one_line'?'専用横長カテゴリ：グリッドとは別のPrefab':observation?.presentation==='grid'?'グリッドカテゴリの掲載記録':'未対応カテゴリ'}（掲載時点の記録・現在の販売状況ではない）</p>
          {:else}<p>構成が一致する掲載記録なし。グリッド比較のみ。</p>{/if}
          <label>比較用 group width <input type="number" min={observation?.presentation==='one_line'?903:541} max="16384" bind:value={groupWidth}/></label>
          {#if observation?.presentation==='one_line'}
            <label>比較用 group height <input type="number" min="65" max="16384" bind:value={groupHeight}/></label>
            {#if oneLine}
              {@const t=oneLine.template}
              <p>専用横長Prefab · 原本座標比較（マスク・色・実行時Itemsの全展開は未確認）</p>
              <div class="candidate one-line" style:aspect-ratio={t.artworkWidth+' / '+t.artworkHeight}>
                <div class="slot" style:left={100*t.main.x/t.artworkWidth+'%'} style:width={100*t.main.width/t.artworkWidth+'%'} style:top={100*t.main.y/t.artworkHeight+'%'} style:height={100*t.main.height/t.artworkHeight+'%'}>
                  {#if oneLine.mainImage}<div class="image-frame"><img src={url(oneLine.mainImage,detail)} alt="CurrentImage" loading="lazy" decoding="async" style:object-fit={t.main.fill}/></div>
                  {:else if oneLine.main.status==='unresolved'&&oneLine.main.reason==='runtime_icon_address'&&revision.components[0]}<ShopPrimaryIconCandidate itemId={revision.components[0].itemId} {detail} {profile} {database} {reader} gameVersion={revision.gameVersion} consumer="Sprite"/>
                  {:else}<span>CurrentImage 未確定</span>{/if}
                </div>
                <div class="slot one-line-scroll" style:left={100*t.scroll.x/t.artworkWidth+'%'} style:width={100*t.scroll.width/t.artworkWidth+'%'} style:top={100*t.scroll.y/t.artworkHeight+'%'} style:height={100*t.scroll.height/t.artworkHeight+'%'}>
                  {#if oneLine.scrollItems.length}
                    {#each oneLine.scrollItems as item,j (j)}
                      <div class="one-line-item" style:width={100*t.scroll.itemWidth/t.artworkWidth+'cqw'}>
                        {#if item.image}<img src={url(item.image,detail)} alt={'Items['+j+'].Icon'} loading="lazy" decoding="async" style:object-fit={t.scroll.fill}/>
                        {:else if !item.address}<ShopPrimaryIconCandidate itemId={item.itemId} {detail} {profile} {database} {reader} gameVersion={revision.gameVersion} consumer="Sprite"/>
                        {:else}<span>画像未登録</span>{/if}
                      </div>
                    {/each}
                  {:else}
                  <div class="one-line-item" style:width={100*t.scroll.itemWidth/t.artworkWidth+'cqw'}>
                    {#if oneLine.firstImage}<img src={url(oneLine.firstImage,detail)} alt="Items[0].Icon" loading="lazy" decoding="async" style:object-fit={t.scroll.fill}/>
                    {:else if oneLine.first.status==='unresolved'&&oneLine.first.reason==='runtime_icon_address'&&revision.components[0]}<ShopPrimaryIconCandidate itemId={revision.components[0].itemId} {detail} {profile} {database} {reader} gameVersion={revision.gameVersion} consumer="Sprite"/>
                    {:else}<span>Items[0].Icon 未確定</span>{/if}
                  </div>
                  {/if}
                  {#if !oneLine.runtimeOrderVerified}<div class="one-line-item unresolved">後続Itemsの展開未確定</div>{/if}
                </div>
              </div>
            {:else}<p>Steam版の有効な比較寸法が必要です。</p>{/if}
          {:else if observation?.presentation==='unsupported'}
            <p>このカテゴリの配置は未確認。</p>
          {:else if inspection.template}
            {@const t=inspection.template}
            <p>配置候補（カテゴリ・背景・Icon選択および既定の描画調整は未確定）</p>
            <div class="candidate" style:aspect-ratio={t.artworkWidth+' / '+t.artworkHeight}>
              {#each inspection.slots as slot (slot.binding)}
                <div class="slot" style:left={100*slot.x/t.artworkWidth+'%'} style:width={100*slot.width/t.artworkWidth+'%'}>
                  {#if slot.image}
                    <div class="image-frame" style:inset={slot.adjustment?slot.adjustment.margins.map(n=>100*n/t.artworkWidth+'cqw').join(' '):undefined}>
                      <img src={url(slot.image,detail)} alt={slot.binding} loading="lazy" decoding="async" style:object-fit={slot.adjustment?.fill??'contain'}/>
                    </div>
                  {:else if slot.nativeAddress?.status==='unresolved'&&slot.nativeAddress.reason==='runtime_icon_address'&&slot.itemId!==null}
                    <ShopPrimaryIconCandidate itemId={slot.itemId} {detail} {profile} {database} {reader} gameVersion={revision.gameVersion} consumer={slot.binding.startsWith('Items[')?'Icon':'Sprite'}/>
                  {:else}<span>{slot.binding}<br/>未確定</span>{/if}
                </div>
              {/each}
              {#if t.scroll}
                <div class="slot one-line-scroll" style:left={100*t.scroll.x/t.artworkWidth+'%'} style:width={100*t.scroll.width/t.artworkWidth+'%'}>
                  {#each inspection.scrollItems as item,j (j)}
                    <div class="one-line-item" style:width={100*t.scroll.itemWidth/t.artworkWidth+'cqw'}>
                      {#if item.image}<div class="image-frame" style:inset-inline={100*t.scroll.imageInset/2/t.artworkWidth+'cqw'}><img src={url(item.image,detail)} alt={'Items['+j+'].Icon'} loading="lazy" decoding="async"/></div>
                      {:else if !item.address}<ShopPrimaryIconCandidate itemId={item.itemId} {detail} {profile} {database} {reader} gameVersion={revision.gameVersion}/>
                      {:else}<span>Icon型 / 画像未確定</span>{/if}
                    </div>
                  {/each}
                  {#if !inspection.runtimeOrderVerified}<div class="one-line-item unresolved">後続Itemsの展開未確定</div>{/if}
                </div>
              {/if}
            </div>
          {/if}
          {#if runtime?.revisionSha256===revision.revisionSha256}
            <p>Items順序: {runtime.items.length}件{runtime.complete?'（全順序確定）':'（確定範囲のみ · '+runtime.blockedBy+'）'}</p>
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
        {#if revision&&reader&&database}<ShopBundleContents {revision} {reader} {database} {detail}/>{/if}
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
  .candidate{container-type:inline-size;position:relative;max-width:100%;background:var(--wand-card);border:1px solid var(--wand-line);margin:8px 0}
  .slot{position:absolute;top:0;height:100%;box-sizing:border-box;border:1px dashed var(--wand-line);display:grid;place-items:center;text-align:center;overflow:hidden}
  .image-frame{position:absolute;inset:0;overflow:hidden}
  .one-line{overflow:visible;margin:16px 0 24px}
  .one-line-scroll{display:flex;justify-content:flex-start;align-items:stretch;overflow-x:auto;overflow-y:hidden}
  .one-line-item{flex:none;height:100%;position:relative;display:grid;place-items:center;min-width:0}
  .one-line-item.unresolved{flex:1;min-width:80px;font-size:.75rem}
  .slot img{width:100%;height:100%;object-fit:contain}
  article{background:var(--wand-card);border:1px solid var(--wand-line);padding:8px;margin-bottom:8px}
  .images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .images img{display:block;max-width:100%;max-height:60vh;object-fit:contain}
  @media(max-width:650px){.workspace{grid-template-columns:1fr}aside{position:static}.list{max-height:25vh}}
</style>
