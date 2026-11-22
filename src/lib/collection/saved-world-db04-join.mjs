/**
 * Optional, local-only DB-04 default-grid/source overlay reconciliation.
 *
 * Exact source paths (GridDefaultLayoutPath + GridDataPath) are the ONLY
 * accepted routing evidence. Save Grid IDs are not native source Grid IDs.
 * A DiffGrid.ModifiedObjects map is an overlay: materialize default entries,
 * then suppress RemovedObjects and substitute ModifiedObjects. Never classify
 * the saved-only identities as player-owned, nor rewrite manual Collection.
 */
export const COLLECTION_DB04_JOIN_CONTRACT='wand.collection.db04-grid-join@1';
const MAX_GRIDS=2048,MAX_OBJECTS=150000,MAX_ITEMS=50000;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const numericKey=k=>/^(0|[1-9][0-9]*)$/.test(k)&&
  Number.isSafeInteger(Number(k))&&String(Number(k))===k;
const furniture=n=>Number.isSafeInteger(n)&&n>0&&Math.trunc(n/10000000)===4;
const invalid=()=>{throw new TypeError('COLLECTION_DB04_JOIN_INVALID_WORKER_REPLY');};

/** Returns safe, ID-only aggregates with no coordinates, paths or save keys. */
export function reconcileSavedWorldWithDb04(root,source){
  const schema=root?.GameInfo?.Version;
  const catalog=source?.catalog;
  const versionOk=schema===643&&source?.gameVersion==='1.26.2'&&
    source?.platform==='Steam'&&catalog?.manifest?.gameVersion==='1.26.2'&&
    catalog?.manifest?.platform==='Steam';
  const all=root?.World?.GridCollection;
  let observedGrids=0,matchedGrids=0,unresolvedGrids=0,invalidGrids=0,
    partialSourceGrids=0,sourceDefaultObjects=0,effectiveObjects=0,
    removedDefaultObjects=0,savedOnlyObjects=0,changedDefaultIdentities=0;
  const stats=new Map();
  let sampled=false;
  function bucket(id){
    let row=stats.get(id);
    if(!row){row={itemId:id,sourceDefault:0,effectiveSaved:0,
      savedOnlyIdentity:0,removedDefaultIdentity:0,changedDefaultIdentity:0};
      stats.set(id,row);}
    return row;
  }
  function add(id,column){
    if(furniture(id))bucket(id)[column]++;
  }
  if(versionOk&&record(all)){
    const full=record(all.Grids)?all.Grids:{};
    const diff=record(all.DiffGrids)?all.DiffGrids:{};
    const fullKeys=Object.keys(full),diffKeys=Object.keys(diff);
    const limit=MAX_GRIDS;
    const observations=[...fullKeys.map(id=>[id,full[id],false]),
      ...diffKeys.map(id=>[id,diff[id],true])];
    if(own(all,'Grids')&&!record(all.Grids))invalidGrids++;
    if(own(all,'DiffGrids')&&!record(all.DiffGrids))invalidGrids++;
    if(observations.length>limit){
      sampled=true;unresolvedGrids+=Math.min(observations.length-limit,MAX_GRIDS);
    }
    let scanned=0;
    for(const [key,grid,isDiff] of observations.slice(0,limit)){
      observedGrids++;
      // A save-local Grid identity never routes to a native DB-04 Grid.
      if(!numericKey(key)||!record(grid)||
        (own(grid,'ID')&&grid.ID!==Number(key))||
        (isDiff&&own(full,key))){invalidGrids++;continue;}
      const layoutPath=grid.GridDefaultLayoutPath;
      const dataPath=grid.GridDataPath;
      if(typeof layoutPath!=='string'||!layoutPath.startsWith('SceneLayouts/')||
        typeof dataPath!=='string'||!dataPath.startsWith('GridData/')){
        unresolvedGrids++;continue;
      }
      const layout=catalog.layouts?.get(layoutPath);
      if(!layout||layout.layoutKind!=='nativeGridCollection'||
        !Array.isArray(layout.nativeGridEntries)){
        unresolvedGrids++;continue;
      }
      const exact=layout.nativeGridEntries.filter(e=>
        e?.gridDataPath===dataPath&&Number.isSafeInteger(e.gridIdNative));
      if(exact.length!==1){unresolvedGrids++;continue;}
      const native=exact[0];
      const defaultObjects=catalog.layoutObjectsByGrid?.get(layoutPath)?.get(native.gridIdNative)??[];
      if(!Array.isArray(defaultObjects)||
        !Number.isSafeInteger(native.defaultObjectCount)||
        native.defaultObjectCount<0||
        defaultObjects.length!==native.defaultObjectCount){
        partialSourceGrids++;continue;
      }
      const originals=new Map();
      let bad=false;
      for(const obj of defaultObjects){
        const id=obj?.gridObjectIdNative,item=obj?.itemId;
        if(!Number.isSafeInteger(id)||id<0||!Number.isSafeInteger(item)||
          item<=0||originals.has(String(id))){bad=true;break;}
        originals.set(String(id),item);
      }
      if(bad){partialSourceGrids++;continue;}
      const saved=isDiff?grid.ModifiedObjects:grid.Objects;
      if(!record(saved)){invalidGrids++;continue;}
      let removed=new Set();
      if(isDiff){
        if(grid.RemovedObjects!==undefined&&!Array.isArray(grid.RemovedObjects)){
          invalidGrids++;continue;
        }
        const raw=grid.RemovedObjects??[];
        if(raw.some(x=>!Number.isSafeInteger(x)||x<0)){
          invalidGrids++;continue;
        }
        removed=new Set(raw.map(String));
      }
      const effective=new Map(isDiff?originals:[]);
      let added=0,changed=0,invalidObject=false;
      for(const [id,obj] of Object.entries(saved)){
        scanned++;
        if(scanned>MAX_OBJECTS){invalidObject=true;break;}
        if(!numericKey(id)||!record(obj)||
          (own(obj,'ID')&&obj.ID!==Number(id))||
          !Number.isSafeInteger(obj.ItemID)||obj.ItemID<=0){
          invalidObject=true;break;
        }
        if(!removed.has(id))effective.set(id,obj.ItemID);
      }
      if(invalidObject){invalidGrids++;continue;}
      for(const removedId of removed)effective.delete(removedId);
      // Counters are committed ONLY for individually valid, exact-source
      // matched grids. Never count a partial/invalid grid as authoritative.
      matchedGrids++;
      const sourceRows=[...originals];
      for(const [id,item] of sourceRows){
        sourceDefaultObjects++;
        add(item,'sourceDefault');
        if(!effective.has(id)){
          removedDefaultObjects++;
          add(item,'removedDefaultIdentity');
        }else if(effective.get(id)!==item){
          changedDefaultIdentities++;
          add(effective.get(id),'changedDefaultIdentity');
        }
      }
      for(const [id,item] of effective){
        effectiveObjects++;
        add(item,'effectiveSaved');
        if(!originals.has(id)){
          savedOnlyObjects++;
          add(item,'savedOnlyIdentity');
        }
      }
    }
  }
  const rows=Object.freeze([...stats.values()]
    .filter(row=>furniture(row.itemId))
    .sort((a,b)=>a.itemId-b.itemId).slice(0,MAX_ITEMS)
    .map(row=>Object.freeze({...row})));
  if(stats.size>MAX_ITEMS)sampled=true;
  const status=!versionOk?'unsupported_source_or_schema':
    !record(all)?'not_observed':
    !matchedGrids?'no_exact_source_match':
    matchedGrids===observedGrids&&
      !unresolvedGrids&&!invalidGrids&&!partialSourceGrids&&
      stats.size<=MAX_ITEMS?'all_observed_grids_matched':'partial_exact_matches';
  return Object.freeze({
    contract:COLLECTION_DB04_JOIN_CONTRACT,
    status,saveSchema:Number.isSafeInteger(schema)?schema:null,
    observedGrids,matchedGrids,unresolvedGrids,invalidGrids,
    partialSourceGrids,sourceDefaultObjects,effectiveObjects,
    removedDefaultObjects,savedOnlyObjects,changedDefaultIdentities,
    sampled,
    entries:rows,
    semantic:'exact_source_path_default_object_overlay_only',
    exactPathOnly:true,
    globalWorldCoverageVerified:false,playerOwnershipVerified:false,
    playerPlacementVerified:false,sourceAuthenticityVerified:false,
    saveWritesEnabled:false,manualCollectionChanged:false,
    personalMetadataExported:false
  });
}

/** Main-thread whitelist: source-grid IDs, route paths and object IDs excluded. */
export function sanitizeSavedWorldDb04Join(input){
  if(!record(input)||input.contract!==COLLECTION_DB04_JOIN_CONTRACT||
    !['unsupported_source_or_schema','not_observed','no_exact_source_match',
      'all_observed_grids_matched','partial_exact_matches'].includes(input.status)||
    input.semantic!=='exact_source_path_default_object_overlay_only'||
    input.exactPathOnly!==true||input.globalWorldCoverageVerified!==false||
    input.playerOwnershipVerified!==false||
    input.playerPlacementVerified!==false||
    input.sourceAuthenticityVerified!==false||
    input.saveWritesEnabled!==false||
    input.manualCollectionChanged!==false||
    input.personalMetadataExported!==false||
    typeof input.sampled!=='boolean'||!Array.isArray(input.entries)||
    input.entries.length>MAX_ITEMS)invalid();
  const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:invalid();
  const saveSchema=input.saveSchema===null?null:count(input.saveSchema,99999);
  const observedGrids=count(input.observedGrids,MAX_GRIDS);
  const matchedGrids=count(input.matchedGrids,MAX_GRIDS);
  const unresolvedGrids=count(input.unresolvedGrids,MAX_GRIDS);
  const invalidGrids=count(input.invalidGrids,MAX_GRIDS);
  const partialSourceGrids=count(input.partialSourceGrids,MAX_GRIDS);
  const sourceDefaultObjects=count(input.sourceDefaultObjects,MAX_OBJECTS);
  const effectiveObjects=count(input.effectiveObjects,MAX_OBJECTS);
  const removedDefaultObjects=count(input.removedDefaultObjects,MAX_OBJECTS);
  const savedOnlyObjects=count(input.savedOnlyObjects,MAX_OBJECTS);
  const changedDefaultIdentities=count(input.changedDefaultIdentities,MAX_OBJECTS);
  let prev=0,sourceFurniture=0,effectiveFurniture=0,savedOnlyFurniture=0;
  const entries=Object.freeze(input.entries.map(row=>{
    if(!record(row)||Object.keys(row).length!==6||
      !Number.isSafeInteger(row.itemId)||!furniture(row.itemId)||
      row.itemId<=prev)invalid();
    prev=row.itemId;
    const parsed={itemId:row.itemId,
      sourceDefault:count(row.sourceDefault,MAX_OBJECTS),
      effectiveSaved:count(row.effectiveSaved,MAX_OBJECTS),
      savedOnlyIdentity:count(row.savedOnlyIdentity,MAX_OBJECTS),
      removedDefaultIdentity:count(row.removedDefaultIdentity,MAX_OBJECTS),
      changedDefaultIdentity:count(row.changedDefaultIdentity,MAX_OBJECTS)};
    sourceFurniture+=parsed.sourceDefault;
    effectiveFurniture+=parsed.effectiveSaved;
    savedOnlyFurniture+=parsed.savedOnlyIdentity;
    if(parsed.removedDefaultIdentity>parsed.sourceDefault||
      parsed.savedOnlyIdentity>parsed.effectiveSaved)invalid();
    return Object.freeze(parsed);
  }));
  if(matchedGrids>observedGrids||removedDefaultObjects>sourceDefaultObjects||
    savedOnlyObjects>effectiveObjects||changedDefaultIdentities>sourceDefaultObjects||
    sourceFurniture>sourceDefaultObjects||effectiveFurniture>effectiveObjects||
    savedOnlyFurniture>savedOnlyObjects||
    (input.status==='unsupported_source_or_schema'&&
      (entries.length||matchedGrids||observedGrids))||
    (['not_observed','no_exact_source_match'].includes(input.status)&&
      (entries.length||matchedGrids||sourceDefaultObjects||effectiveObjects))||
    (input.status==='all_observed_grids_matched'&&
      (matchedGrids!==observedGrids||unresolvedGrids||invalidGrids||
        partialSourceGrids||input.sampled||!matchedGrids))||
    (input.status==='partial_exact_matches'&&
      (!matchedGrids||matchedGrids===observedGrids&&
       !unresolvedGrids&&!invalidGrids&&!partialSourceGrids&&!input.sampled))||
    (input.sampled&&input.status==='all_observed_grids_matched'))invalid();
  return Object.freeze({
    contract:COLLECTION_DB04_JOIN_CONTRACT,status:input.status,saveSchema,
    observedGrids,matchedGrids,unresolvedGrids,invalidGrids,
    partialSourceGrids,sourceDefaultObjects,effectiveObjects,
    removedDefaultObjects,savedOnlyObjects,changedDefaultIdentities,
    sampled:input.sampled,entries,
    semantic:'exact_source_path_default_object_overlay_only',
    exactPathOnly:true,globalWorldCoverageVerified:false,
    playerOwnershipVerified:false,playerPlacementVerified:false,
    sourceAuthenticityVerified:false,saveWritesEnabled:false,
    manualCollectionChanged:false,personalMetadataExported:false
  });
}
