/**
 * Read-only observation of furniture ItemID references in saved World grids.
 *
 * Native Switch v1.24.13 grid transactions prove ListInventory Amount is
 * AVAILABLE/UNPLACED stock for normal PutDownListItem and that placed
 * instances live as GridObjects. A saved GridObject, however, may be a
 * default/world/quest/automatically spawned object: neither its presence nor
 * its source field proves player ownership or an unlock entitlement.
 *
 * DiffGrid.ModifiedObjects is an OVERLAY, not the whole effective grid.
 * A removed object identity must be excluded even if modified data persists.
 * Default-grid objects absent from the save require the matching game source
 * to compute full placed counts. Therefore these are **saved references only**.
 *
 * No grid identity, coordinates, object state, source, save bytes or private
 * profile fields cross the short-lived local Worker boundary.
 */
export const SAVED_GRID_REFERENCES_CONTRACT='wand.collection.saved-grid-furniture-refs@1';
const SCHEMAS=new Set([624,643]);
const MAX_GRIDS=1024,MAX_REFERENCES=100000,MAX_ITEMS=50000;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const key=k=>/^(0|[1-9][0-9]*)$/.test(k)&&Number.isSafeInteger(Number(k))&&String(Number(k))===k;
const furniture=id=>Number.isSafeInteger(id)&&id>0&&Math.trunc(id/10000000)===4;
const fail=()=>{throw new TypeError('SAVED_GRID_REFERENCES_INVALID_WORKER_REPLY');};

export function projectSavedGridFurnitureReferences(root){
  const schema=root?.GameInfo?.Version;
  const supported=SCHEMAS.has(schema);
  const gridCollection=root?.World?.GridCollection;
  const hasCollection=record(root?.World)&&own(root.World,'GridCollection');
  let observedFullGrids=0,observedDiffGrids=0,fullReferences=0,
    diffModifiedReferences=0,invalidRecords=0,sampled=false;
  const byItem=new Map();
  // Only IDs are retained: never persist grid/object identities, coordinates,
  // personal state or details from world objects.
  function add(id,diff) {
    if(!furniture(id))return;
    let row=byItem.get(id);
    if(!row){row={fullGridReferences:0,diffModifiedReferences:0};byItem.set(id,row);}
    if(diff){row.diffModifiedReferences++;diffModifiedReferences++;}
    else{row.fullGridReferences++;fullReferences++;}
  }
  let visited=0,gridsVisited=0;
  function scanObjects(objects,diff,removed){
    for(const [objectKey,obj] of Object.entries(objects)){
      if(visited>=MAX_REFERENCES){sampled=true;break;}
      visited++;
      if(!key(objectKey)||!record(obj)||
        (own(obj,'ID')&&obj.ID!==Number(objectKey))||
        !Number.isSafeInteger(obj.ItemID)||obj.ItemID<=0){
        invalidRecords++;continue;
      }
      if(removed?.has(objectKey))continue;
      add(obj.ItemID,diff);
    }
  }
  if(supported&&record(gridCollection)){
    const full=gridCollection.Grids, diff=gridCollection.DiffGrids;
    const fullKeys=record(full)?Object.keys(full):[];
    const diffKeys=record(diff)?Object.keys(diff):[];
    if((own(gridCollection,'Grids')&&!record(full))||
       (own(gridCollection,'DiffGrids')&&!record(diff)))invalidRecords++;
    if(fullKeys.length+diffKeys.length>MAX_GRIDS)sampled=true;
    for(const [gridKey,grid] of Object.entries(full??{})){
      if(gridsVisited++>=MAX_GRIDS){sampled=true;break;}
      if(!key(gridKey)||!record(grid)||!record(grid.Objects)||
        (own(grid,'ID')&&grid.ID!==Number(gridKey))){
        invalidRecords++;continue;
      }
      observedFullGrids++;
      scanObjects(grid.Objects,false,null);
    }
    // AllGrids enumerates full and diff grids; a duplicate identity indicates
    // ambiguous malformed data for this simple save-only projection.
    for(const [gridKey,grid] of Object.entries(diff??{})){
      if(gridsVisited++>=MAX_GRIDS){sampled=true;break;}
      if(!key(gridKey)||!record(grid)||!record(grid.ModifiedObjects)||
        (own(grid,'ID')&&grid.ID!==Number(gridKey))||
        own(full??{},gridKey)){
        invalidRecords++;continue;
      }
      const removed=grid.RemovedObjects??[];
      // Unknown removal encoding means the entire diff grid is inconclusive;
      // do not falsely label any modified object as active.
      if(!Array.isArray(removed)||
         removed.some(id=>!Number.isSafeInteger(id)||id<0)){
        invalidRecords++;continue;
      }
      observedDiffGrids++;
      scanObjects(grid.ModifiedObjects,true,new Set(removed.map(String)));
    }
  }
  if(byItem.size>MAX_ITEMS){sampled=true;}
  const entries=Object.freeze([...byItem].sort((a,b)=>a[0]-b[0])
    .slice(0,MAX_ITEMS).map(([itemId,counts])=>Object.freeze({
      itemId,fullGridReferences:counts.fullGridReferences,
      diffModifiedReferences:counts.diffModifiedReferences
    })));
  const status=!supported?'unsupported_schema':
    !hasCollection?'not_observed':
    !record(gridCollection)?'incompatible_structure':
    sampled||invalidRecords?'partial_inconclusive':
    (fullReferences+diffModifiedReferences)?'saved_furniture_references':'observed_no_furniture_refs';
  return Object.freeze({
    contract:SAVED_GRID_REFERENCES_CONTRACT,
    saveSchema:Number.isSafeInteger(schema)?schema:null,
    status,observedFullGrids,observedDiffGrids,
    fullReferences,diffModifiedReferences,invalidRecords,sampled,
    entries,
    semantic:'saved_world_grid_item_references_not_player_ownership',
    fullEffectivePlacedCountVerified:false,
    defaultWorldGridJoined:false,
    playerPlacementVerified:false,
    ownershipOrUnlockInferred:false,
    stockQuantityAdjusted:false,
    saveFileModified:false,
    privateSavePublished:false
  });
}

export function sanitizeSavedGridFurnitureReferences(input){
  if(!record(input)||input.contract!==SAVED_GRID_REFERENCES_CONTRACT||
    !['unsupported_schema','not_observed','incompatible_structure',
      'partial_inconclusive','saved_furniture_references',
      'observed_no_furniture_refs'].includes(input.status)||
    input.semantic!=='saved_world_grid_item_references_not_player_ownership'||
    input.fullEffectivePlacedCountVerified!==false||
    input.defaultWorldGridJoined!==false||
    input.playerPlacementVerified!==false||
    input.ownershipOrUnlockInferred!==false||
    input.stockQuantityAdjusted!==false||
    input.saveFileModified!==false||input.privateSavePublished!==false||
    typeof input.sampled!=='boolean'||!Array.isArray(input.entries)||
    input.entries.length>MAX_ITEMS)fail();
  const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:fail();
  const saveSchema=input.saveSchema===null?null:count(input.saveSchema,99999);
  const observedFullGrids=count(input.observedFullGrids,MAX_GRIDS);
  const observedDiffGrids=count(input.observedDiffGrids,MAX_GRIDS);
  const fullReferences=count(input.fullReferences,MAX_REFERENCES);
  const diffModifiedReferences=count(input.diffModifiedReferences,MAX_REFERENCES);
  const invalidRecords=count(input.invalidRecords,MAX_REFERENCES+MAX_GRIDS);
  if(observedFullGrids+observedDiffGrids>MAX_GRIDS||
    fullReferences+diffModifiedReferences>MAX_REFERENCES||
    (input.status==='unsupported_schema'&&SCHEMAS.has(saveSchema))||
    (input.status!=='unsupported_schema'&&!SCHEMAS.has(saveSchema)))fail();
  let previous=0,fullSum=0,diffSum=0;
  const entries=Object.freeze(input.entries.map(row=>{
    if(!record(row)||Object.keys(row).length!==3||!own(row,'itemId')||
      !own(row,'fullGridReferences')||!own(row,'diffModifiedReferences')||
      !furniture(row.itemId)||row.itemId<=previous)fail();
    previous=row.itemId;
    const fullGridReferences=count(row.fullGridReferences,MAX_REFERENCES);
    const diffModifiedReferences=count(row.diffModifiedReferences,MAX_REFERENCES);
    if(!fullGridReferences&&!diffModifiedReferences)fail();
    fullSum+=fullGridReferences;
    diffSum+=diffModifiedReferences;
    return Object.freeze({itemId:row.itemId,fullGridReferences,diffModifiedReferences});
  }));
  if(fullSum>fullReferences||diffSum>diffModifiedReferences||
    (!input.sampled&&(fullSum!==fullReferences||diffSum!==diffModifiedReferences))||
    (input.status==='saved_furniture_references'&&
      (input.sampled||invalidRecords||!entries.length))||
    (input.status==='observed_no_furniture_refs'&&
      (input.sampled||invalidRecords||entries.length||fullReferences||diffModifiedReferences))||
    (input.status==='partial_inconclusive'&&!(input.sampled||invalidRecords))||
    (['unsupported_schema','not_observed','incompatible_structure'].includes(input.status)&&
      (entries.length||fullReferences||diffModifiedReferences||
        observedFullGrids||observedDiffGrids||invalidRecords)))fail();
  return Object.freeze({
    contract:SAVED_GRID_REFERENCES_CONTRACT,saveSchema,status:input.status,
    observedFullGrids,observedDiffGrids,fullReferences,
    diffModifiedReferences,invalidRecords,sampled:input.sampled,entries,
    semantic:'saved_world_grid_item_references_not_player_ownership',
    fullEffectivePlacedCountVerified:false,defaultWorldGridJoined:false,
    playerPlacementVerified:false,ownershipOrUnlockInferred:false,
    stockQuantityAdjusted:false,saveFileModified:false,
    privateSavePublished:false
  });
}
