/**
 * DB-05 public search over per-open, UI-local Save Grid projections only.
 * Grid ordinals are not native IDs. Search results cannot authorize edits;
 * Rust/WASM independently re-resolves each local target from original bytes.
 */
export interface LocalGridSearchRow {
  readonly localOrdinal:number;
  readonly localGridOrdinal:number;
  readonly recordKind:'full'|'diff_modified';
  readonly itemId:string;
  readonly coordinatesObserved:boolean;
  readonly x:number|null;
  readonly y:number|null;
}
export interface LocalGridSearchHit {
  readonly localGridOrdinal:number;
  readonly recordKind:'full'|'diff_modified';
  readonly x:number;
  readonly y:number;
  readonly ordinals:number[];
  readonly matchedItemId:string;
}
function matches(
  row:LocalGridSearchRow,query:string,
  itemName:(id:string)=>string,ordinalOnly:boolean
):boolean{
  if(ordinalOnly)return String(row.localOrdinal).includes(query);
  return String(row.localOrdinal).includes(query)||
    row.itemId.toLocaleLowerCase().includes(query)||
    itemName(row.itemId).toLocaleLowerCase().includes(query);
}

/**
 * Search ALL observed local Grids without conflating positions that happen
 * to have the same numeric X/Y in unrelated Grids. Same-position objects
 * within one Grid are presented as a single selectable marker.
 */
export function searchLocalGridPositions(
  rows:readonly LocalGridSearchRow[],
  query:string,
  itemName:(id:string)=>string=()=>'',limit=20
):LocalGridSearchHit[]{
  const normalized=query.trim().toLocaleLowerCase();
  const ordinalOnly=normalized.startsWith('#');
  const needle=ordinalOnly?normalized.slice(1):normalized;
  if(!needle||!Number.isSafeInteger(limit)||limit<1||limit>100)return [];
  const markers=new Map<string,{
    localGridOrdinal:number;
    recordKind:LocalGridSearchHit['recordKind'];
    x:number;y:number;ordinals:number[];
    matchedItemId:string|null;
  }>();
  for(const row of rows){
    if(!row.coordinatesObserved||row.x===null||row.y===null)continue;
    const key=`${row.localGridOrdinal}:${row.x}:${row.y}`;
    let marker=markers.get(key);
    if(!marker){
      marker={localGridOrdinal:row.localGridOrdinal,
        recordKind:row.recordKind,x:row.x,y:row.y,
        ordinals:[],matchedItemId:null};
      markers.set(key,marker);
    }
    marker.ordinals.push(row.localOrdinal);
    if(marker.matchedItemId===null&&
       matches(row,needle,itemName,ordinalOnly)){
      marker.matchedItemId=row.itemId;
    }
  }
  const hits:LocalGridSearchHit[]=[];
  for(const marker of markers.values()){
    if(marker.matchedItemId===null)continue;
    hits.push({
      localGridOrdinal:marker.localGridOrdinal,
      recordKind:marker.recordKind,
      x:marker.x,y:marker.y,
      ordinals:marker.ordinals,
      matchedItemId:marker.matchedItemId
    });
    if(hits.length===limit)break;
  }
  return hits;
}
