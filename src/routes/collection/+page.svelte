<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {watchWandLanguage} from '$lib/ui/preferences';
  import {editHistory,type HistoryDescription} from '$lib/ui/edit-history';
  import SavedStorePreview from '$lib/collection/SavedStorePreview.svelte';
  import { CollectionRuntime, type CollectionState, type CollectionItem, type CollectionFacet, type CollectionProgress, type CollectionFilter } from '$lib/collection/runtime';
  import { collectionFamilyLabel } from '$lib/collection/copy';
  import {collectionScopeOptions,type CollectionScopeOption} from '$lib/collection/scope-options';

  const categoryPictogram:Record<string,string>={
    Furniture:'chair',Landscaping:'plant','Roads & Fences':'mountain',
    'Wallpaper & Flooring':'home',Buildings:'home','Environment Effects':'sun',
    Clothing:'shirt',Appearance:'character','Touch of Magic':'sparkles',
    'Photo Mode':'camera',Tools:'hammer',Upgrades:'hammer',Characters:'character',
    Companions:'butterfly',Critters:'butterfly',Mounts:'world',
    Crafting:'hammer',Meals:'cooking',Ingredients:'plant',Foraging:'plant',
    Fish:'fish',Gems:'gem',Timebending:'sparkles',Memories:'book',
    'Board Game':'puzzle',Snippets:'puzzle','Lorekeeper Tales':'book',
    'Quest Puzzles':'puzzle',Exhibition:'gallery','Source Activity Items':'hammer'
  };
  const categoryNavLabels:Readonly<Record<string,string>>={
    ja:'カテゴリ',en:'Categories',fr:'Catégories',it:'Categorie',
    de:'Kategorien','es-ES':'Categorías','zh-CN':'类别','pt-BR':'Categorias'
  };
  const terminology:Record<string,string> = {
    OWNERSHIP_AND_DISCOVERY:'所有・発見',
    OWNERSHIP_STOCK_AND_DISCOVERY:'所有・所持数・発見',
    QUANTITY_STOCK:'所持数',
    RECIPE_UNLOCK:'レシピ解放',
    UNLOCKED_LOCKED:'解放状況',
    UNLOCK_OR_AVAILABILITY:'利用可能・解放',
    UNVERIFIED:'セーブ状態未検証'
  };
  const defaultState:CollectionState={
    schema:'wand.collection.local@1',active:'local-1',
    workspaces:[{id:'local-1',name:'My Collection',entries:{}}]
  };
  let runtime:CollectionRuntime|null=null;
  let detachHistory:()=>void=()=>{};
  let state:CollectionState=defaultState;
  let facets:CollectionFacet[]=[];
  let worldScopeOptions:readonly CollectionScopeOption[]=[];
  let universeScopeOptions:readonly CollectionScopeOption[]=[];
  let scopeRuntimeCache:CollectionRuntime|null=null;
  let scopeLocaleCache='';
  let filtered:CollectionItem[]=[];
  let totalMatches=0;
  let overall:CollectionProgress={owned:0,missing:0,unknown:0,discovered:0,total:0};
  let loadError='';
  let loading=true;
  let storeError='';
  let saveReadInProgress=false;
  let historySaveReadLock=false;
  let saveReadTarget:{runtime:CollectionRuntime;workspaceId:string}|null=null;
  let infoMessage='';
  let busy=false;
  let locale='ja';
  let worldFilter='';
  let universeFilter='';
  let selected='';
  let search='';
  let status:'all'|'owned'|'missing'|'unknown'='all';
  let nameStatus:'all'|'verified'|'unverified'='all';
  let expansion='';
  let filtersOpen=false;
  let visible=72;
  let selectionMode=false;
  let selectedIds:number[]=[];
  let selectedItemId:number|null=null;
  let importInput:HTMLInputElement;
  let workspaceOptions:HTMLDetailsElement;
  let localCatalogInput:HTMLInputElement;
  let gameImageMap:Record<string,string>={};
  // Ephemeral projection of saved GridObject references. Never put these
  // observations in the manual Collection state or IndexedDB backup.
  let savedGridByItem:Record<string,{fullGridReferences:number;diffModifiedReferences:number}>={};
  let savedDb04ByItem:Record<string,{sourceDefault:number;effectiveSaved:number;
    savedOnlyIdentity:number;removedDefaultIdentity:number}>={};
  let mobileInspector=false;
  let inspectorClose:HTMLButtonElement;
  let inspectorTrigger:HTMLElement|null=null;

  $: workspace=state.workspaces.find(x=>x.id===state.active)??state.workspaces[0];
  $: entries=workspace?.entries??{};
  $: selectionLabel=facets.find(x=>x.id===selected)?.label??'';
  $: visibleItems=filtered;
  // The Rust engine owns category identity and ordering. Group visible
  // records in one pass rather than repeatedly scanning every item once per
  // category on each infinite-scroll append.
  function groupVisibleItems(items:readonly CollectionItem[],categories:readonly CollectionFacet[]){
    const groups=new Map<string,CollectionItem[]>();
    for(const category of categories)groups.set(category.id,[]);
    for(const item of items){
      const matching=groups.get(item.family);
      if(matching)matching.push(item);
      else groups.set(item.family,[item]);
    }
    return [...groups].filter(([,records])=>records.length>0)
      .map(([id,records])=>({id,items:records}));
  }
  $: groupedItems=groupVisibleItems(visibleItems,facets);
  $: selectedItem=selectedItemId!==null && runtime?runtime.item(selectedItemId,locale):null;
  $: selectedEntry=selectedItem?entries[String(selectedItem.itemId)]??{}:{};
  $: selectedGridRefs=selectedItem?savedGridByItem[String(selectedItem.itemId)]??null:null;
  $: selectedDb04Refs=selectedItem?savedDb04ByItem[String(selectedItem.itemId)]??null:null;
  $: isBrowsing=Boolean(selected||search.trim()||status!=='all'||nameStatus!=='all'||expansion||worldFilter||universeFilter);

  function categoryLabel(lang:string,id:string):string {
    const special:Record<string,Record<string,string>>={
      ja:{Memories:'思い出','Quest Puzzles':'クエストのパズル',Exhibition:'展示','Source Activity Items':'その他のアイテム（詳細分類未確認）'},
      en:{Memories:'Memories','Quest Puzzles':'Quest Puzzles',Exhibition:'Exhibition','Source Activity Items':'Other items (unclassified)'},
      fr:{Memories:'Souvenirs','Quest Puzzles':'Énigmes de quête',Exhibition:'Exposition','Source Activity Items':'Autres objets (non classés)'},
      it:{Memories:'Ricordi','Quest Puzzles':'Enigmi delle missioni',Exhibition:'Esposizione','Source Activity Items':'Altri oggetti (non classificati)'},
      de:{Memories:'Erinnerungen','Quest Puzzles':'Quest-Rätsel',Exhibition:'Ausstellung','Source Activity Items':'Andere Gegenstände (unklassifiziert)'},
      'es-ES':{Memories:'Recuerdos','Quest Puzzles':'Puzles de misiones',Exhibition:'Exposición','Source Activity Items':'Otros objetos (sin clasificar)'},
      'zh-CN':{Memories:'回忆','Quest Puzzles':'任务谜题',Exhibition:'展览','Source Activity Items':'其他物品（未分类）'},
      'pt-BR':{Memories:'Memórias','Quest Puzzles':'Quebra-cabeças de missões',Exhibition:'Exposição','Source Activity Items':'Outros itens (sem classificação)'}
    };
    return special[lang]?.[id]??collectionFamilyLabel(lang,id)??id;
  }
  function labelFacet(kind:'world'|'universe',id:string):string {
    if(!runtime)return id;
    const meta=runtime.metadata;
    const list=kind==='world'?meta.worlds:meta.universes;
    const labels=kind==='world'?meta.worldLabels:meta.universeLabels;
    const i=list.indexOf(id);
    const lang=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'].indexOf(locale);
    return i<0?id:labels[i]?.[lang<0?0:lang]??labels[i]?.[0]??id;
  }
  function labelWorld(id:string):string{return labelFacet('world',id);}
  function labelUniverse(id:string):string{return labelFacet('universe',id);}
  function currentFilter(offset:number,limit:number):CollectionFilter {
    return {
      locale,search,category:selected,
      world:worldFilter,universe:universeFilter,
      expansion,status,nameStatus,offset,limit
    };
  }
  function refresh():void {
    if(!runtime)return;
    try{
      facets=runtime.facets('category',locale);
      // Source Tag associations are not CollectionArea membership. The
      // runtime only exposes these options when the catalog explicitly carries
      // reviewed, source-validated per-item scope evidence.
      if(scopeRuntimeCache!==runtime||scopeLocaleCache!==locale){
        const provenance=runtime.metadata.verifiedScopeMembership;
        worldScopeOptions=collectionScopeOptions(runtime.metadata,'world',
          provenance?.world?runtime.facets('world',locale):[],locale);
        universeScopeOptions=collectionScopeOptions(runtime.metadata,'universe',
          provenance?.universe?runtime.facets('universe',locale):[],locale);
        // Counts of catalog members are static across user manual edits.
        // Do not scan 13k source facets on every infinite-scroll page.
        scopeRuntimeCache=runtime;
        scopeLocaleCache=locale;
      }
      if(worldFilter&&!worldScopeOptions.some(x=>x.id===worldFilter))worldFilter='';
      if(universeFilter&&!universeScopeOptions.some(x=>x.id===universeFilter))universeFilter='';
      const collected:CollectionItem[]=[];
      let next=0;
      let total=0;
      do{
        const page=runtime.query(currentFilter(next,Math.min(200,visible-next)));
        total=page.total;
        collected.push(...page.items);
        next+=page.items.length;
        if(page.items.length===0)break;
      }while(next<Math.min(total,visible));
      filtered=collected;
      totalMatches=total;
      overall=runtime.progress;
      state=runtime.state;
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
  }
  function resetView():void{visible=72;selectedIds=[];selectedItemId=null;refresh();}
  /** Scroll only requests the next page from Rust. Re-querying 0..visible
   * after every intersection creates quadratic decoding and DOM churn for
   * the 13k+ item catalog. Edits/filter changes still use full refresh().
   */
  function appendNextPage():void {
    if(!runtime||busy||loading||storeError||filtered.length>=totalMatches)return;
    try{
      const offset=filtered.length;
      const page=runtime.query(currentFilter(offset,72));
      if(page.total!==totalMatches){
        // The source filter changed outside the observer: rebuild its current
        // view rather than stitching together incompatible result sets.
        refresh();
        return;
      }
      if(page.items.length===0)throw new Error('COLLECTION_PAGINATION_EMPTY_PAGE');
      filtered=[...filtered,...page.items];
      visible=filtered.length;
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
  }
  function observeMore(node:HTMLElement) {
    if(typeof IntersectionObserver==='undefined')return {destroy:()=>{}};
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)&&visible<totalMatches&&!busy)
        appendNextPage();
    },{rootMargin:'400px'});
    observer.observe(node);
    return {destroy:()=>observer.disconnect()};
  }
  async function commit(action:()=>Promise<void>,description:HistoryDescription,repair=false):Promise<void>{
    if(!runtime||busy||editHistory.isTraveling()||(storeError&&!repair))return;
    const before=runtime.state;
    busy=true;editHistory.beginCollectionEdit();
    try{
      await action();
      editHistory.recordCollection(before,runtime.state,description);
      storeError='';
      refresh();
      infoMessage='ブラウザ内のCollection記録を更新しました。DDVセーブファイルは変更していません。';
    }catch(error){storeError=error instanceof Error?error.message:String(error);}
    finally{busy=false;editHistory.endCollectionEdit();}
  }
  function describeEntry(itemId:number,patch:Record<string,unknown>):HistoryDescription{
    const item=runtime?.item(itemId,locale);
    const previous=entries[String(itemId)]??{};
    const key=Object.keys(patch)[0];
    const oldValue=(previous as Record<string,unknown>)[key];
    const nextValue=patch[key];
    const displayed=(value:unknown):string=>{
      if(key==='status')return value==='owned'?'所持':value==='missing'?'未所持':'未記録';
      if(key==='discovered'||key==='favorite')return value===true?'あり':'なし';
      return value===undefined||value===null?'—':String(value);
    };
    const label=key==='status'?'所持状態':key==='quantity'?'所持数':
      key==='discovered'?'発見':key==='favorite'?'お気に入り':'記録';
    return {title:item?.label??String(itemId),change:`${label}: ${displayed(oldValue)} → ${displayed(nextValue)}`};
  }
  async function reloadLatestRecord():Promise<void> {
    if (!runtime || busy) return;
    busy=true;
    try {
      await runtime.reloadLatest();
      editHistory.reconcileCollection(runtime.state);
      storeError='';
      selectedItemId=null;
      selectedIds=[];
      selectionMode=false;
      refresh();
      if (!storeError) infoMessage='ほかのタブで保存された最新のローカル記録を読み込みました。';
    } catch (error) {
      storeError=error instanceof Error?error.message:String(error);
    } finally {
      busy=false;
    }
  }
  function changeEntry(change:Record<string,unknown>):void{
    if(selectedItem&&runtime){
      const id=selectedItem.itemId;
      void commit(()=>runtime!.setEntry(id,change),describeEntry(id,change));
    }
  }
  function toggleItemStatus(id:number):void{
    if(!runtime)return;
    const current=entries[String(id)]?.status;
    const patch={status:current==='owned'?'missing' as const:'owned' as const};
    void commit(()=>runtime!.setEntry(id,patch),describeEntry(id,patch));
  }
  async function showItem(id:number,event:MouseEvent):Promise<void>{
    inspectorTrigger=event.currentTarget as HTMLElement;
    selectedItemId=id;
    if(mobileInspector){await tick();inspectorClose?.focus({preventScroll:true});}
  }
  async function closeItem():Promise<void>{
    selectedItemId=null;await tick();
    if(inspectorTrigger?.isConnected)inspectorTrigger.focus({preventScroll:true});
    inspectorTrigger=null;
  }
  function toggleSelected(id:number):void{
    selectedIds=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];
  }
  function applyBulk(next:'owned'|'missing'|null):void{
    if(!runtime||!selectedIds.length)return;
    const ids=[...selectedIds];
    void commit(async()=>{
      await runtime!.setBulk(ids,next??'unknown');
      selectedIds=[];selectionMode=false;
    },{title:`一括更新（${ids.length}件）`,change:`所持状態 → ${next==='owned'?'所持':next==='missing'?'未所持':'未記録'}`});
  }
  function applyFilteredBulk(next:'owned'|'missing'|'unknown'):void {
    if(!runtime||busy||storeError||totalMatches===0)return;
    const count=totalMatches;
    const label=next==='owned'?'所持 / 解放':next==='missing'?'未所持':'未記録';
    if(!window.confirm(`現在の条件に一致する全${count.toLocaleString(locale)}件を「${label}」に変更します。画面に未表示のアイテムも対象です。実行しますか？`))return;
    const filter=currentFilter(0,1);
    void commit(async()=>{
      await runtime!.setBulkMatching(filter,next);
      selectedIds=[];
      selectionMode=false;
    },{title:`条件に一致する${count}件`,change:`所持状態 → ${label}`});
  }
  function chooseFacet(id:string):void{selected=id;resetView();}
  function clearScope():void{selected='';search='';status='all';nameStatus='all';expansion='';worldFilter='';universeFilter='';resetView();}
  function changeWorkspace(id:string):void{
    if(!runtime||busy||saveReadInProgress)return;
    const target=state.workspaces.find(x=>x.id===id)?.name??id;
    void commit(async()=>{await runtime!.workspace('select',id);selectedItemId=null;selectedIds=[];},
      {title:'記録を切り替え',change:`${workspace.name} → ${target}`});
  }
  function newWorkspace():void{
    if(!runtime||busy||saveReadInProgress)return;
    const name=window.prompt('新しいローカル記録の名前（最大80文字）');
    if(name?.trim())void commit(()=>runtime!.workspace('add','local-'+crypto.randomUUID(),name),
      {title:'記録を作成',change:name.trim()});
  }
  function editWorkspaceName():void{
    if(!runtime||!workspace||busy||saveReadInProgress)return;
    const name=window.prompt('記録の名前',workspace.name);
    if(name?.trim())void commit(()=>runtime!.workspace('rename',workspace.id,name),
      {title:'記録名を変更',change:`${workspace.name} → ${name.trim()}`});
  }
  function deleteWorkspace():void{
    if(!runtime||busy||saveReadInProgress||state.workspaces.length<2)return;
    if(!window.confirm('現在の記録を削除します。先にバックアップを保存しましたか？'))return;
    void commit(()=>runtime!.workspace('delete',state.active),
      {title:'記録を削除',change:workspace.name});
  }
  async function useOwnerLocalCatalog(event:Event):Promise<void> {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||busy||saveReadInProgress)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.openOwnerLocalDb01(file);
      detachHistory();runtime?.close();
      runtime=loaded;
      detachHistory=editHistory.attachCollection(runtime);
      loaded=null;
      loadError='';
      storeError='';
      clearScope();
      infoMessage='Steam v1.26.2の'+runtime.progress.total.toLocaleString('ja')+'件へローカルで切り替えました。ゲームデータは送信・保存していません。';
    } catch(error) {
      loaded?.close();
      infoMessage='ローカルカタログを読み込めませんでした：'+(error instanceof Error?error.message:String(error));
    } finally {
      busy=false;
      input.value='';
    }
  }
  async function usePublicCatalog():Promise<void>{
    if(busy||saveReadInProgress)return;
    busy=true;
    let loaded:CollectionRuntime|null=null;
    try {
      loaded=await CollectionRuntime.open(base);
      detachHistory();runtime?.close();
      runtime=loaded;
      detachHistory=editHistory.attachCollection(runtime);
      loaded=null;
      loadError='';
      storeError='';
      clearScope();
      infoMessage='公開されている検証済みCollection参照データに戻しました。';
    }catch(error){
      loaded?.close();
      infoMessage='公開カタログの読込に失敗しました：'+(error instanceof Error?error.message:String(error));
    }finally{busy=false;}
  }
  function downloadBackup():void{
    if(!runtime||busy||storeError||saveReadInProgress)return;
    const data=runtime.exportBackup();
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');
    a.href=url;a.download='dreamwish-wand-collection-backup.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function restoreBackup(event:Event):Promise<void>{
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    if(!file||!runtime||busy||saveReadInProgress)return;
    try{
      if(file.size>10_000_000)throw new Error('COLLECTION_BACKUP_TOO_LARGE');
      const data=await file.text();
      if(!window.confirm('現在のローカル記録をすべて置き換えます。先にバックアップを保存しましたか？'))return;
      await commit(()=>runtime!.restore(data),{title:'バックアップを復元',change:'Collection記録を置き換え'},true);
      selectedItemId=null;clearScope();
    }catch(error){infoMessage=error instanceof Error?error.message:String(error);}
    finally{input.value='';}
  }
  onMount(()=>{
    const toggleHeaderFilters=()=>{filtersOpen=!filtersOpen;};
    window.addEventListener('wand:collection-filters',toggleHeaderFilters);
    const handleHeaderBackup=()=>downloadBackup();
    window.addEventListener('wand:collection-backup',handleHeaderBackup);
    const onHistoryRestored=()=>{selectedItemId=null;selectedIds=[];selectionMode=false;refresh();};
    window.addEventListener('wand:collection-history-restored',onHistoryRestored);
    const unwatchLanguage=watchWandLanguage(next=>{
      if(locale!==next){locale=next;refresh();}
    });
    let alive=true;
    const media=window.matchMedia('(max-width: 820px)');
    mobileInspector=media.matches;
    const changed=(e:MediaQueryListEvent)=>{mobileInspector=e.matches;};
    media.addEventListener('change',changed);
    void(async()=>{
      try{
        const loaded=await CollectionRuntime.open(base);
        if(!alive){loaded.close();return;}
        runtime=loaded;
        detachHistory=editHistory.attachCollection(loaded);
        refresh();
        try{
          const response=await fetch(base+'/ddv/collection/item-images-r39.json');
          if(response.ok){
            const images=await response.json();
            if(images.schema==='wand.collection.item-images.r39@1'&&images.items&&typeof images.items==='object')
              gameImageMap=images.items;
          }
        }catch{}
      }catch(error){if(alive)loadError=error instanceof Error?error.message:String(error);}
      finally{if(alive)loading=false;}
    })();
    return()=>{alive=false;if(historySaveReadLock){historySaveReadLock=false;editHistory.endCollectionEdit();}detachHistory();unwatchLanguage();window.removeEventListener('wand:collection-history-restored',onHistoryRestored);window.removeEventListener('wand:collection-backup',handleHeaderBackup);window.removeEventListener('wand:collection-filters',toggleHeaderFilters);media.removeEventListener('change',changed);runtime?.close();};
  });
  function beginSaveRead():void {
    // Preserve the active workspace and runtime at file selection, not at
    // Worker completion. Do not let an asynchronous save update another record.
    saveReadTarget=runtime&&!busy&&!storeError?{runtime,workspaceId:state.active}:null;
    saveReadInProgress=true;
    if(!historySaveReadLock){editHistory.beginCollectionEdit();historySaveReadLock=true;}
    window.dispatchEvent(new CustomEvent('wand:collection-busy',{detail:true}));
  }
  function finishSaveRead():void {
    saveReadInProgress=false;
    saveReadTarget=null;
    if(historySaveReadLock){historySaveReadLock=false;editHistory.endCollectionEdit();}
    window.dispatchEvent(new CustomEvent('wand:collection-busy',{detail:false}));
  }
  /** Native save history and positive-stock ownership are applied together
   * in one IndexedDB transaction, overriding matching manual entries only. */
  async function importSaveProfile(event:CustomEvent<{
    discovered:{itemId:number;discovered:boolean}[];
    positiveOwned:{itemId:number;role:string}[];
  }>):Promise<void> {
    if(!saveReadTarget||saveReadTarget.runtime!==runtime||
       saveReadTarget.workspaceId!==state.active){
      infoMessage='セーブの読み取り中に対象のローカル記録が変更されたため、自動反映を中止しました。セーブを再選択してください。';
      return;
    }
    if(!runtime||busy||storeError){
      infoMessage='Collectionの保存処理が実行できないため、セーブの状態は反映していません。競合がある場合は最新の記録を読み込んでからセーブを再選択してください。';
      return;
    }
    const projection=event.detail;
    if(!Array.isArray(projection?.discovered)||
       !Array.isArray(projection?.positiveOwned)||
       (!projection.discovered.length&&!projection.positiveOwned.length))return;
    busy=true;editHistory.beginCollectionEdit();
    const before=runtime.state;
    try{
      const applied=await runtime.applyMappedSaveProfile(projection);
      editHistory.recordCollection(before,runtime.state,{
        title:'セーブの状態を反映',
        change:`発見 ${applied.discovery}件・所持 ${applied.ownership}件`
      });
      storeError='';
      refresh();
      infoMessage=`セーブの発見履歴 ${applied.discovery.toLocaleString(locale)}件、正の数量で確認した所持 ${applied.ownership.toLocaleString(locale)}件をローカル記録へ反映しました。数量0・未収録ID・矛盾するIDは手動記録を維持します。元のセーブには書き込みません。`;
    }catch(error){
      storeError=error instanceof Error?error.message:String(error);
      infoMessage='セーブの状態は反映されませんでした。既存の手動記録は維持しています。';
    }finally{busy=false;editHistory.endCollectionEdit();}
  }
  function receiveDb04Join(event:CustomEvent<{entries:{
    itemId:number;sourceDefault:number;effectiveSaved:number;
    savedOnlyIdentity:number;removedDefaultIdentity:number;
  }[]}|null>):void{
    const refs:Record<string,{sourceDefault:number;effectiveSaved:number;
      savedOnlyIdentity:number;removedDefaultIdentity:number}>={};
    for(const row of event.detail?.entries??[])refs[String(row.itemId)]={
      sourceDefault:row.sourceDefault,effectiveSaved:row.effectiveSaved,
      savedOnlyIdentity:row.savedOnlyIdentity,removedDefaultIdentity:row.removedDefaultIdentity
    };
    savedDb04ByItem=refs;
  }
  function receiveSavedGridReferences(event:CustomEvent<{
    entries:{itemId:number;fullGridReferences:number;diffModifiedReferences:number}[];
  }|null>):void {
    const rows=event.detail?.entries??[];
    const projection:Record<string,{fullGridReferences:number;diffModifiedReferences:number}>={};
    for(const row of rows)projection[String(row.itemId)]={
      fullGridReferences:row.fullGridReferences,
      diffModifiedReferences:row.diffModifiedReferences
    };
    savedGridByItem=projection;
  }
  function lookupSavedCollectionId(itemId:number):void {
    if(!Number.isSafeInteger(itemId)||itemId<=0||!runtime)return;
    selected='';worldFilter='';universeFilter='';expansion='';
    status='all';nameStatus='all';search=String(itemId);
    filtersOpen=false;resetView();
    infoMessage='セーブに保存されたItem ID '+itemId+'の公開カタログ参照を表示しています。所持・解放判定ではありません。';
    document.querySelector('.collection-workspace')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function historicalLookup(itemId:number):{itemId:number;label:string;family:string}|null{
    if(!runtime)return null;
    try{
      const item=runtime.item(itemId,locale);
      return {itemId:item.itemId,label:item.label,family:item.family};
    }catch{return null;}
  }
</script>

<svelte:window on:keydown={(event:KeyboardEvent)=>{ if(event.key==='Escape' && mobileInspector && selectedItemId!==null) void closeItem(); }} />

<svelte:head>
  <title>Collection | Dreamwish Wand</title>
  <meta name="description" content="Explore DDV items by category, world and universe, with optional local collection tracking."/>
</svelte:head>

<section class="collection-page">
  <!-- Global toolbar owns save loading, backup and restore. Inputs stay mounted. -->
  <input bind:this={localCatalogInput} class="visually-hidden" type="file"
    accept=".json,application/json" aria-label="Steam v1.26.2のオーナーローカルカタログ"
    on:change={useOwnerLocalCatalog}/>
  <input bind:this={importInput} class="visually-hidden" type="file"
    accept=".json,application/json" aria-label="Collectionバックアップを選択"
    on:change={restoreBackup}/>

  {#if storeError}
    <div class="error-banner" role="alert">
      {#if storeError==='COLLECTION_STORAGE_CONFLICT'}
        別のタブでCollectionの記録が更新されました。古い記録による上書きを防止しています。
        <button type="button" disabled={busy} on:click={()=>void reloadLatestRecord()}>最新の記録を読み直す</button>
        <small>COLLECTION_STORAGE_CONFLICT</small>
      {:else}
        {storeError}　ブラウザのデータは削除していません。
      {/if}
    </div>
  {/if}
  {#if infoMessage}<div class="info-banner" role="status">{infoMessage}<button type="button" on:click={()=>infoMessage=''} aria-label="通知を閉じる">×</button></div>{/if}

  {#if loading}
    <div class="loading-panel" role="status">読み込み中…</div>
  {:else if loadError}
    <div class="error-banner" role="alert">データの検証または読み込みに失敗しました。{loadError}</div>
  {:else}
    <SavedStorePreview headless resolveHistorical={historicalLookup} {locale} {gameImageMap} collectionCommitBusy={busy}
      on:lookupItem={(event:CustomEvent<number>)=>lookupSavedCollectionId(event.detail)}
      on:saveProfile={importSaveProfile}
      on:saveReadStarted={beginSaveRead}
      on:saveReadFinished={finishSaveRead}
      on:saveReadError={(event:CustomEvent<string>)=>infoMessage=event.detail}
      on:gridReferences={receiveSavedGridReferences}
      on:db04Join={receiveDb04Join} />
    <div class="collection-workspace">
      <div class="workspace-top">
        <div class="collection-record-switcher" role="group" aria-label="ローカル記録">
          <select aria-label="ローカル記録を選択" value={state.active}
            disabled={Boolean(storeError)||busy||saveReadInProgress}
            on:change={(event)=>changeWorkspace((event.currentTarget as HTMLSelectElement).value)}>
            {#each state.workspaces as work}<option value={work.id}>{work.name}</option>{/each}
          </select>
          <details class="collection-record-menu" bind:this={workspaceOptions}>
            <summary aria-label="記録の管理" title="記録の管理"><WandIcon name="ellipsis" size={21}/></summary>
            <div class="collection-record-actions" role="group" aria-label="ローカル記録の管理">
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress||state.workspaces.length>=5}
                on:click={()=>{workspaceOptions.open=false;newWorkspace();}}>
                <WandIcon name="plus" size={16}/>新規
              </button>
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress}
                on:click={()=>{workspaceOptions.open=false;editWorkspaceName();}}>
                <WandIcon name="edit" size={16}/>名前変更
              </button>
              <button type="button" disabled={Boolean(storeError)||busy||saveReadInProgress||state.workspaces.length<2}
                on:click={()=>{workspaceOptions.open=false;deleteWorkspace();}}>
                <WandIcon name="trash" size={16}/>削除
              </button>
              {#if runtime?.isOwnerLocal || (runtime && runtime.metadata.snapshot!=='steam-1.26.2-native-itemlist-v1')}
                <button type="button" disabled={busy||loading||saveReadInProgress}
                  on:click={()=>{workspaceOptions.open=false;runtime?.isOwnerLocal?void usePublicCatalog():localCatalogInput.click();}}>
                  <WandIcon name="folder" size={16}/>{runtime?.isOwnerLocal?'公開データに戻す':'カタログファイルを開く'}
                </button>
              {/if}
            </div>
          </details>
        </div>
        <div class="toolbar">
          <label class="search-box">
            <span aria-hidden="true"><WandIcon name="search" size={19}/></span>
            <input type="search" aria-label="8言語のアイテム名で検索" bind:value={search} on:input={resetView} placeholder="アイテム名を検索"/>
          </label>
          <button type="button" class="subtle-button" aria-expanded={filtersOpen} on:click={()=>filtersOpen=!filtersOpen}>フィルター {filtersOpen?'▴':'▾'}</button>
        </div>
      </div>
      {#if worldScopeOptions.length||universeScopeOptions.length}
        <div class="collection-scope-toolbar" role="group" aria-label="コレクションの表示範囲">
          {#if worldScopeOptions.length}
            <div class="collection-world-switcher" role="group" aria-label="ワールド">
              <span class="scope-axis-label" aria-hidden="true">ワールド</span>
              <div class="collection-scope-scroll">
                <button type="button" class:chosen={!worldFilter} aria-pressed={!worldFilter}
                  on:click={()=>{worldFilter='';resetView();}}>すべて</button>
                {#each worldScopeOptions as option (option.id)}
                  <button type="button" class:chosen={worldFilter===option.id}
                    aria-pressed={worldFilter===option.id}
                    on:click={()=>{worldFilter=option.id;resetView();}}>{option.label}</button>
                {/each}
              </div>
            </div>
          {/if}
          {#if universeScopeOptions.length}
            <label class="collection-universe-switcher">
              <span>ユニバース</span>
              <select aria-label="ユニバースで絞り込み" value={universeFilter}
                on:change={(event)=>{universeFilter=(event.currentTarget as HTMLSelectElement).value;resetView();}}>
                <option value="">すべて</option>
                {#each universeScopeOptions as option (option.id)}
                  <option value={option.id}>{option.label}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
      {/if}
      {#if filtersOpen}
        <div class="filter-panel">
          <fieldset><legend>収集状況（手動記録）</legend>
            {#each [{id:'all',name:'すべて'},{id:'owned',name:'所持 / 解放'},{id:'missing',name:'未所持'},{id:'unknown',name:'未記録'}] as option}
              <button type="button" class:chosen={status===option.id} aria-pressed={status===option.id} on:click={()=>{status=option.id as typeof status;resetView();}}>{option.name}</button>
            {/each}
          </fieldset>
          <label class="filter-label">追加コンテンツ
            <select bind:value={expansion} on:change={resetView}>
              <option value="">すべて</option>
              {#each runtime?.metadata.expansions??[] as id}<option value={id}>{id}</option>{/each}
            </select>
          </label>
          <button type="button" class="subtle-button" on:click={clearScope}>条件を解除</button>
        </div>
      {/if}
      <div class="workspace-body" class:has-inspector={Boolean(selectedItem)}>
        <div class="collection-results">
          {#if isBrowsing}
            <div class="results-heading">
              <div class="breadcrumbs">
                <button type="button" on:click={clearScope}>{categoryNavLabels[locale]??categoryNavLabels.en}</button>
                {#if selected}<span> / {selectionLabel}</span>{/if}
              </div>
              <div class="result-actions">
                <span class="result-count">{totalMatches.toLocaleString(locale)} 件</span>
                <button type="button" class="subtle-button" disabled={Boolean(storeError)} aria-pressed={selectionMode}
                  on:click={()=>{selectionMode=!selectionMode;selectedIds=[];selectedItemId=null;}}>{selectionMode?'選択を終了':'複数選択'}</button>
              </div>
            </div>
            {#if selectionMode && filtered.length}
              <div class="bulk-actions" role="group" aria-label="Collectionの一括記録">
                <span>{selectedIds.length} 件選択</span>
                <button type="button" on:click={()=>selectedIds=[...new Set<number>(visibleItems.map((item:any)=>Number(item.itemId)))]}>表示中を選択</button>
                <button type="button" on:click={()=>selectedIds=[]} disabled={!selectedIds.length}>選択解除</button>
                <button type="button" on:click={()=>applyBulk('owned')} disabled={!selectedIds.length}>所持 / 解放</button>
                <button type="button" on:click={()=>applyBulk('missing')} disabled={!selectedIds.length}>未所持</button>
                <button type="button" on:click={()=>applyBulk(null)} disabled={!selectedIds.length}>未記録</button>
                <span class="bulk-all-separator" aria-hidden="true">｜</span>
                <span>条件一致の全{totalMatches.toLocaleString(locale)}件：</span>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('owned')}>全件を所持 / 解放</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('missing')}>全件を未所持</button>
                <button type="button" disabled={busy||Boolean(storeError)} on:click={()=>applyFilteredBulk('unknown')}>全件を未記録</button>
              </div>
            {/if}
            {#if !totalMatches}
              <div class="empty-panel" role="status">
                <p>該当するアイテムはありません</p>
                <button type="button" class="subtle-button" on:click={clearScope}>条件を解除</button>
              </div>
            {:else}
              {#each groupedItems as group (group.id)}
                {#if !selected || search.trim()}
                  <h3 class="result-group-title">{categoryLabel(locale,group.id)} <span>{group.items.length}</span></h3>
                {/if}
                <div class="items-grid">
                  {#each group.items as item (item.itemId)}
                    <div class="item-card" class:current={selectedItemId===item.itemId} class:bulk-selected={selectedIds.includes(item.itemId)}>
                      <button type="button" class="item-card-body"
                        on:click={(event)=>selectionMode?toggleSelected(item.itemId):void showItem(item.itemId,event)}
                        aria-pressed={selectionMode?selectedIds.includes(item.itemId):selectedItemId===item.itemId}
                        aria-label={selectionMode?`${item.label} を選択`:`${item.label} の詳細`}>
                        <span class="item-icon" aria-hidden="true">{#if selectionMode}{selectedIds.includes(item.itemId)?'☑':'☐'}{:else}<ItemArtwork itemId={item.itemId} sourcePath={gameImageMap[String(item.itemId)]??null} />{/if}</span>
                        <span class="item-card-copy"><strong>{item.label}</strong><span>{categoryLabel(locale,item.family)}</span></span>
                      </button>
                      <button type="button" class="item-state-toggle" disabled={Boolean(storeError)||selectionMode}
                        class:owned={entries[String(item.itemId)]?.status==='owned'}
                        on:click={()=>toggleItemStatus(item.itemId)}
                        aria-label={entries[String(item.itemId)]?.status==='owned'?`${item.label} を未所持にする`:`${item.label} を所持済みにする`}
                        title={entries[String(item.itemId)]?.status==='owned'?'所持済み：押すと未所持':'押すと所持済みに記録'}>
                        <WandIcon name={entries[String(item.itemId)]?.status==='owned'?'check':'plus'} size={20}/>
                      </button>
                    </div>
                  {/each}
                </div>
              {/each}
              {#if visible<totalMatches}
                <div class="more-button" use:observeMore aria-label="スクロールで続きを自動読み込み" role="status"><WandIcon name="sparkles" size={18}/></div>
              {/if}
            {/if}
          {:else}
            <div class="section-lead">
              <h2>カテゴリ</h2>
            </div>
            <div class="facet-grid">
              {#each facets as facet (facet.id)}
                <button type="button" class="facet-card" disabled={facet.total===0} on:click={()=>chooseFacet(facet.id)}>
                  <span class="facet-flourish" aria-hidden="true"><WandIcon name={categoryPictogram[facet.id]??'collection'} size={22}/></span>
                  <strong>{categoryLabel(locale,facet.id)}</strong>
                  {#if facet.total>0}
                    <span>{facet.owned.toLocaleString(locale)} / {facet.total.toLocaleString(locale)}</span>
                  {:else}
                    <span>0</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if selectedItem}
          <aside class="item-inspector" role={mobileInspector?"dialog":undefined} aria-modal={mobileInspector?"true":undefined} aria-label="アイテム情報">
            <div class="inspector-heading"><span class="visually-hidden">アイテム情報</span><button type="button" bind:this={inspectorClose} on:click={closeItem} aria-label="詳細を閉じる">×</button></div>
            <div class="inspector-art"><ItemArtwork itemId={selectedItem.itemId} alt={selectedItem.label} sourcePath={gameImageMap[String(selectedItem.itemId)]??null} large /></div>
            <h2>{selectedItem.label}</h2>
            <p class="inspector-meta">{categoryLabel(locale,selectedItem.family)}</p>
            <details class="inspector-details">
              <summary>詳細情報</summary>
              <dl>
                <dt>ワールド</dt><dd>{selectedItem.worlds.map(labelWorld).join('、')||'—'}</dd>
                <dt>ユニバース</dt><dd>{selectedItem.universes.map(labelUniverse).join('、')||'—'}</dd>
                <dt>追加コンテンツ</dt><dd>{selectedItem.expansions.join(', ')||'—'}</dd>
              </dl>
            </details>
            <div class="inspector-section">
              <h3>Collection記録</h3>
              <div class="ownership-actions">
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='owned'} on:click={()=>changeEntry({status:'owned'})}>所持 / 解放</button>
                <button type="button" disabled={Boolean(storeError)} class:active={selectedEntry.status==='missing'} on:click={()=>changeEntry({status:'missing'})}>未所持</button>
                <button type="button" disabled={Boolean(storeError)} class:active={!selectedEntry.status} on:click={()=>changeEntry({status:null})}>未記録</button>
              </div>
              {#if ['QUANTITY_STOCK','OWNERSHIP_STOCK_AND_DISCOVERY'].includes(selectedItem.stateSemantic)}
                <label class="numeric-field">手動所持数
                  <input type="number" min="0" max="999999" step="1" value={selectedEntry.quantity??''}
                    disabled={Boolean(storeError)}
                    on:change={(event)=>{
                      const value=(event.currentTarget as HTMLInputElement).value;
                      changeEntry({quantity:value===''?null:Number(value)});
                    }} placeholder="未記録"/>
                </label>
              {/if}
              {#if selectedItem.stateSemantic.includes('DISCOVERY') || selectedEntry.discovered!==undefined}
                <label class="check-row"><input type="checkbox" checked={selectedEntry.discovered===true}
                  disabled={Boolean(storeError)} on:change={(event)=>changeEntry({discovered:(event.currentTarget as HTMLInputElement).checked})}/> 発見済み</label>
              {/if}
              <label class="check-row"><input type="checkbox" checked={selectedEntry.favorite===true}
                disabled={Boolean(storeError)} on:change={(event)=>changeEntry({favorite:(event.currentTarget as HTMLInputElement).checked})}/> お気に入り</label>
            </div>
          </aside>
        {/if}
      </div>
    </div>
  {/if}
</section>
