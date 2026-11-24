<script lang="ts">
  import {onMount,tick} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {base} from '$app/paths';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import {COLLECTION_UNIVERSE_TAG_NAMES} from '$lib/collection/universe-tag-names';
  import {collectionDb01FacetLabel,collectionDb01TagLabel} from '$lib/collection/db01-native-facets';
  import {collectionTopCategoryLabel} from '$lib/collection/category-hierarchy';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {emptyBoards,readBoards,createBoard,editBoard,toggleItem,deleteBoard,toggleFavorite,STORAGE_KEY,type ExploreItem,type BoardState} from '$lib/explore/model';
  let locale=$state<WandLanguage>('ja');
  let items=$state.raw<ExploreItem[]>([]);
  let images=$state.raw<Record<string,string>>({});
  let boards=$state.raw<BoardState>(emptyBoards());
  let storageRaw:string|null=null;
  let ready=$state(false),loading=$state(true),failed=$state(false),storageFailed=$state(false);
  let boardsOpen=$state(false),searchOpen=$state(false),searchInput:HTMLInputElement,search=$state(''),family=$state('furniture'),universe=$state('all'),favorites=$state(false),limit=$state(100);
  let newName=$state(''),rename=$state(''),groupName=$state(''),selected=$state<ExploreItem|null>(null);
  const t=(ja:string,en:string)=>locale==='ja'?ja:en;
  const facets=['furnitureKind','color','furnitureStyle'] as const;
  type Facet=typeof facets[number];
  let tags=$state<Record<Facet,string>>({furnitureKind:'',color:'',furnitureStyle:''});
  let selectionMode=$state(false),selectedIds=$state<number[]>([]);
  const familyOf=(i:ExploreItem)=>i.nativeCategory==='Trimming'?'interior':i.subtype===2?'landscaping':[1,7].includes(i.subtype)?'roads-fences':'furniture';
  const nameOf=(i:ExploreItem)=>i.names[locale]??i.names.en??t('名称未確認','Unnamed item');
  const byId=$derived(new Map(items.map(i=>[i.itemId,i])));
  const active=$derived(boards.boards.find(b=>b.id===boards.active)??null);
  const universeOptions=$derived(COLLECTION_UNIVERSE_TAG_NAMES.filter(u=>items.some(i=>(family==='all'||familyOf(i)===family)&&i.universes.includes(u.id))).sort((a,b)=>a.names[locale].localeCompare(b.names[locale],locale)));
  const facetOptions=$derived.by(()=>{
    const sets:Record<Facet,Set<string>>={furnitureKind:new Set(),color:new Set(),furnitureStyle:new Set()};
    for(const item of items)if(family==='all'||familyOf(item)===family)
      for(const [key,value] of item.tags)sets[key]?.add(value);
    return Object.fromEntries(facets.map(key=>[key,[...sets[key]].sort()])) as Record<Facet,string[]>;
  });
  const filtered=$derived.by(()=>{const q=search.trim().toLocaleLowerCase();const fav=new Set(boards.favorites);return items.filter(i=>(family==='all'||familyOf(i)===family)&&(universe==='all'||(universe==='none'?!i.universes.length:i.universes.includes(Number(universe))))&&facets.every(key=>!tags[key]||i.tags.some(([f,v])=>f===key&&v===tags[key]))&&(!favorites||fav.has(i.itemId))&&(!q||nameOf(i).toLocaleLowerCase().includes(q)));});
  function save(next:BoardState){if(!ready||storageFailed)return;try{
    if(localStorage.getItem(STORAGE_KEY)!==storageRaw)throw Error('CONFLICT');
    const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);storageRaw=raw;boards=next;
  }catch{storageFailed=true;}}
  async function toggleSearch(){searchOpen=!searchOpen;if(searchOpen){await tick();searchInput?.focus();}else{search='';limit=100;}}
  function selectItem(id:number){selectedIds=selectedIds.includes(id)?selectedIds.filter(v=>v!==id):[...selectedIds,id];}
  function bulkAdd(){if(!active)return;const ids=new Set(active.entries.map(e=>e.itemId));save(editBoard(boards,active.id,b=>({...b,entries:[...b.entries,...selectedIds.filter(id=>!ids.has(id)).map(itemId=>({itemId,groupId:null}))]})));selectedIds=[];selectionMode=false;}
  function reorderItem(id:number,step:number){if(!active)return;save(editBoard(boards,active.id,b=>{
    const entries=[...b.entries],i=entries.findIndex(e=>e.itemId===id);if(i<0)return b;
    let j=i+step;while(j>=0&&j<entries.length&&entries[j].groupId!==entries[i].groupId)j+=step;
    if(j<0||j>=entries.length)return b;[entries[i],entries[j]]=[entries[j],entries[i]];return {...b,entries};
  }));}
  function pickBoard(id:string){save({...boards,active:id});}
  function addBoard(){if(!newName.trim())return;save(createBoard(boards,crypto.randomUUID(),newName));newName='';boardsOpen=true;}
  function removeBoard(){if(active&&confirm(t('このムードボードを削除しますか？','Delete this moodboard?')))save(deleteBoard(boards,active.id));}
  function changeName(){if(active&&rename.trim())save(editBoard(boards,active.id,b=>({...b,name:rename.trim()})));rename='';}
  function addGroup(){if(active&&groupName.trim())save(editBoard(boards,active.id,b=>({...b,groups:[...b.groups,{id:crypto.randomUUID(),name:groupName.trim()}]})));groupName='';}
  function removeGroup(id:string){if(active&&confirm(t('グループを削除してアイテムを未分類に戻しますか？','Delete group and move its items to Unsorted?')))save(editBoard(boards,active.id,b=>({...b,groups:b.groups.filter(g=>g.id!==id),entries:b.entries.map(e=>e.groupId===id?{...e,groupId:null}:e)})));}
  function moveItem(id:number,groupId:string){if(active)save(editBoard(boards,active.id,b=>({...b,entries:b.entries.map(e=>e.itemId===id?{...e,groupId:groupId||null}:e)})));}
  function toggle(id:number){if(active)save(toggleItem(boards,active.id,id));}
  function more(node:HTMLElement){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))limit+=100;},{rootMargin:'300px'});observer.observe(node);return {destroy:()=>observer.disconnect()};}
  onMount(()=>{
    const unwatch=watchWandLanguage(v=>locale=v);
    try{storageRaw=localStorage.getItem(STORAGE_KEY);boards=readBoards(storageRaw);ready=true;}catch{storageFailed=true;}
    const w=new Worker(new URL('../../../lib/explore/catalog.worker.ts',import.meta.url),{type:'module'});
    w.onmessage=(e:MessageEvent<{items?:ExploreItem[];error?:boolean}>)=>{if(e.data.items)items=e.data.items;else failed=true;loading=false;};
    w.onerror=()=>{failed=true;loading=false;};
    w.postMessage({base});
    void fetch(base+'/ddv/collection/item-images-r39.json').then(r=>r.ok?r.json():null).then(d=>{if(d?.schema==='wand.collection.item-images.r39@1'&&d.items)images=d.items;}).catch(()=>{});
    const storageListener=(e:StorageEvent)=>{if(e.key===STORAGE_KEY){try{storageRaw=e.newValue;boards=readBoards(storageRaw);}catch{storageFailed=true;}}};
    window.addEventListener('storage',storageListener);
    return()=>{w.terminate();unwatch();window.removeEventListener('storage',storageListener);};
  });
</script>
<svelte:head><title>Explore · Dreamwish Wand</title></svelte:head>
<section class="decorate">
  <header class="bar">
    <a class="back" href={base+'/decorate/'} aria-label="Decorate">‹ Decorate</a>
    <h1>Explore</h1>
    <button aria-label={t('検索','Search')} aria-expanded={searchOpen} onclick={toggleSearch}><WandIcon name="search" size={19}/></button>
    <button aria-expanded={boardsOpen} class:activeTab={boardsOpen} onclick={()=>boardsOpen=!boardsOpen}><WandIcon name="collection" size={19}/> Moodboards</button>
  </header>
  {#if storageFailed}<p role="alert">{t('保存できません。再読み込みしてください。','Storage unavailable. Reload before editing.')}</p>{/if}
  <div class="workspace" class:withBoards={boardsOpen}>
  <div class="catalog">
    <div class="bar filters">
      {#if searchOpen}<input bind:this={searchInput} type="search" placeholder={t('家具を検索','Search furniture')} aria-label={t('家具を検索','Search furniture')} bind:value={search} oninput={()=>limit=100}/>{/if}
      <select aria-label={t('種類','Family')} bind:value={family} onchange={()=>{universe='all';tags={furnitureKind:'',color:'',furnitureStyle:''};limit=100;}}>
        <option value="all">{t('すべて','All')}</option>
        {#each (['furniture','landscaping','roads-fences','interior'] as const) as category}<option value={category}>{collectionTopCategoryLabel(locale,category)}</option>{/each}
      </select>
      <select aria-label="Universe" bind:value={universe} onchange={()=>limit=100}>
        <option value="all">{t('すべてのユニバース','All universes')}</option><option value="none">{t('ユニバースなし','No universe')}</option>
        {#each universeOptions as u (u.id)}<option value={String(u.id)}>{u.names[locale]}</option>{/each}
      </select>
      {#each facets as facet}
        {#if facetOptions[facet].length}
        <select aria-label={collectionDb01FacetLabel(locale,facet)} bind:value={tags[facet]} onchange={()=>limit=100}>
          <option value="">{collectionDb01FacetLabel(locale,facet)}</option>
          {#each facetOptions[facet] as key}<option value={key}>{collectionDb01TagLabel(locale,key)}</option>{/each}
        </select>
        {/if}
      {/each}
      <label><input type="checkbox" bind:checked={favorites} onchange={()=>limit=100}/>{t('お気に入り','Favorites')}</label>
      <select aria-label={t('追加先','Active moodboard')} value={boards.active??''} onchange={e=>pickBoard(e.currentTarget.value)}>
        <option value="" disabled>{t('追加先ムードボード','Choose moodboard')}</option>
        {#each boards.boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
      </select>
      <button onclick={()=>boardsOpen=true}>{t('ボード管理','Manage boards')}</button>
      <button aria-pressed={selectionMode} onclick={()=>{selectionMode=!selectionMode;selectedIds=[];}}>{t('複数選択','Multi-select')}</button>
      {#if selectionMode}<button disabled={!active||!selectedIds.length||storageFailed} onclick={bulkAdd}>{t('選択を追加','Add selected')} ({selectedIds.length})</button>{/if}
    </div>
    {#if loading}<p>{t('読み込み中…','Loading…')}</p>{:else if failed}<p role="alert">{t('家具データを読み込めません。','Furniture catalog could not be loaded.')}</p>{:else}
      <div class="tiles">
        {#each filtered.slice(0,limit) as item (item.itemId)}
          <article class="tile">
            <button class="item" aria-pressed={selectionMode?selectedIds.includes(item.itemId):undefined} onclick={()=>selectionMode?selectItem(item.itemId):selected=item}><span class="art"><ItemArtwork itemId={item.itemId} sourcePath={images[String(item.itemId)]??null}/></span><span>{nameOf(item)}</span></button>
            <div class="actions"><button aria-label={t('お気に入り','Favorite')} aria-pressed={boards.favorites.includes(item.itemId)} disabled={!ready||storageFailed} onclick={()=>save(toggleFavorite(boards,item.itemId))}>{boards.favorites.includes(item.itemId)?'★':'☆'}</button>
            <button aria-label={t('ムードボードに追加・削除','Add or remove from moodboard')} aria-pressed={active?.entries.some(e=>e.itemId===item.itemId)??false} disabled={!active||storageFailed} onclick={()=>toggle(item.itemId)}>{active?.entries.some(e=>e.itemId===item.itemId)?'✓':'+'}</button></div>
          </article>
        {/each}
      </div>
      {#if filtered.length===0}<p>{t('該当する家具がありません','No matching furniture')}</p>{/if}
      {#if filtered.length>limit}<div use:more class="sentinel"></div>{/if}
    {/if}
  </div>
  {#if boardsOpen}
  <aside class="boards" aria-label="Moodboards">
    <div class="bar board-header"><h2>Moodboards</h2><button aria-label={t('閉じる','Close')} onclick={()=>boardsOpen=false}><WandIcon name="close" size={18}/></button></div>
    <div class="bar"><input bind:value={newName} placeholder={t('新しいボード名','New moodboard name')} aria-label={t('新しいボード名','New moodboard name')}/><button disabled={!newName.trim()||!ready||storageFailed} onclick={addBoard}>{t('作成','Create')}</button></div>
    <div class="board-list">
      {#each boards.boards as b (b.id)}
        <button class="board-card" class:activeTab={b.id===active?.id} onclick={()=>pickBoard(b.id)}>
          <span class="cover">{#each b.entries.slice(0,4) as entry (entry.itemId)}<span><ItemArtwork itemId={entry.itemId} sourcePath={images[String(entry.itemId)]??null}/></span>{/each}</span>
          <strong>{b.name}</strong>
        </button>
      {/each}
    </div>
    {#if active}
      <div class="bar"><h2>{active.name}</h2><input bind:value={rename} aria-label={t('新しい名前','New name')} placeholder={t('新しい名前','New name')}/><button disabled={!rename.trim()||storageFailed} onclick={changeName}>{t('名前変更','Rename')}</button><button disabled={storageFailed} onclick={removeBoard}>{t('削除','Delete')}</button></div>
      {#key active.id}<label class="note">{t('メモ','Notes')}<textarea value={active.note} disabled={storageFailed} onchange={e=>{if(active)save(editBoard(boards,active.id,b=>({...b,note:e.currentTarget.value})));}}></textarea></label>{/key}
      <div class="bar"><input bind:value={groupName} aria-label={t('グループ名','Group name')} placeholder={t('グループ名','Group name')}/><button disabled={!groupName.trim()||storageFailed} onclick={addGroup}>{t('グループ作成','Add group')}</button></div>
      {#each [{id:null,name:t('未分類','Unsorted')},...active.groups] as group (group.id)}
        <div class="bar"><h3>{group.name}</h3>{#if group.id!==null}<button disabled={storageFailed} onclick={()=>removeGroup(group.id!)}>{t('グループ削除','Delete group')}</button>{/if}</div>
        <div class="tiles">
        {#each active.entries.filter(e=>e.groupId===group.id) as entry (entry.itemId)}
          {@const item=byId.get(entry.itemId)}
          <article class="tile">
            <span class="art"><ItemArtwork itemId={entry.itemId} sourcePath={images[String(entry.itemId)]??null}/></span>
            <span>{item?nameOf(item):t('アイテム情報なし','Item unavailable')}</span>
            <select aria-label={t('グループ移動','Move to group')} value={entry.groupId??''} disabled={storageFailed} onchange={e=>moveItem(entry.itemId,e.currentTarget.value)}><option value="">{t('未分類','Unsorted')}</option>{#each active.groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}</select>
            <div class="actions"><button disabled={storageFailed} aria-label={t('前へ','Move earlier')} onclick={()=>reorderItem(entry.itemId,-1)}>↑</button><button disabled={storageFailed} aria-label={t('後へ','Move later')} onclick={()=>reorderItem(entry.itemId,1)}>↓</button><button disabled={storageFailed} onclick={()=>toggle(entry.itemId)}>{t('取り除く','Remove')}</button></div>
          </article>
        {/each}
        </div>
      {/each}
    {/if}
  </aside>
  {/if}
  </div>
  {#if selected}
    <aside class="review" aria-label={t('アイテム詳細','Item details')}>
      <button onclick={()=>selected=null}>{t('閉じる','Close')}</button>
      <div class="large"><ItemArtwork itemId={selected.itemId} sourcePath={images[String(selected.itemId)]??null} large/></div>
      <h2>{nameOf(selected)}</h2>
      <button disabled={!active||storageFailed} onclick={()=>selected&&toggle(selected.itemId)}>{active?.entries.some(e=>e.itemId===selected?.itemId)?t('ボードから削除','Remove from board'):t('ボードへ追加','Add to board')}</button>
    </aside>
  {/if}
</section>
<style>
  .decorate{padding:12px 16px;min-width:0;position:relative}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
  .workspace.withBoards{grid-template-columns:minmax(0,1fr) minmax(300px,35%)}
  .catalog{min-width:0}
  .boards{min-width:0;position:sticky;top:calc(var(--shell-height,60px) + 12px);max-height:calc(100dvh - var(--shell-height,60px) - 24px);overflow:auto;border-left:1px solid var(--wand-line,#66577c);padding-left:12px}
  .boards .tiles{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
  .board-header{justify-content:space-between}
  .back{font-size:12px;text-decoration:none}
  header button{display:inline-flex;align-items:center;gap:6px}
  @media(max-width:780px){.workspace.withBoards{grid-template-columns:minmax(0,1fr)}.boards{position:fixed;z-index:42;right:0;top:var(--shell-height,60px);bottom:0;width:min(420px,100vw);max-height:none;background:var(--wand-panel,#292337);padding:12px;box-shadow:0 0 24px #0008}}

  .bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  h1,h2,h3{font-size:1rem;margin:0 8px 0 0} nav{display:flex;gap:5px;flex-wrap:wrap}
  button,input,select,textarea{background:var(--wand-panel,#292337);color:inherit;border:1px solid var(--wand-line,#66577c);border-radius:7px;padding:7px 9px;min-width:0}
  .activeTab,button[aria-pressed=true]{border-color:var(--wand-accent,#d1b8ff)} .item[aria-pressed=true]{outline:2px solid var(--wand-accent,#d1b8ff);outline-offset:-2px}
  .filters input[type=search]{flex:1;min-width:140px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(114px,1fr));gap:8px}
  .tile{display:flex;flex-direction:column;gap:4px;border:1px solid var(--wand-line,#66577c);border-radius:9px;padding:5px;min-width:0;font-size:12px;overflow-wrap:anywhere}
  .item{padding:0;border:0;background:transparent;display:grid;gap:4px;text-align:center;width:100%;flex:1}
  .art{display:block;height:92px;min-width:0}.actions{display:flex;gap:4px;justify-content:space-between}.actions button{flex:1;padding:3px}
  .board-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px;margin-bottom:16px}
  .board-card{display:grid;gap:6px;overflow-wrap:anywhere}.cover{display:grid;grid-template-columns:repeat(2,1fr);min-height:94px;grid-auto-rows:47px}
  .cover span{min-height:0}.note{display:grid;gap:4px;margin:10px 0}.note textarea{min-height:70px;resize:vertical}
  .review{position:fixed;right:12px;bottom:12px;z-index:40;padding:12px;background:var(--wand-panel,#292337);border:1px solid var(--wand-line,#66577c);border-radius:12px;max-width:min(310px,95vw);box-shadow:0 8px 30px #0008}
  .large{height:170px}.sentinel{height:1px}
  @media(max-width:600px){.decorate{padding:8px}.tiles{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}.art{height:70px}}
</style>
