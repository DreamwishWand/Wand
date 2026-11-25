export const STORAGE_KEY='dreamwishwand.explore.moodboards.v1';
export interface ExploreItem {
  itemId:number;
  names:Readonly<Record<string,string|null>>;
  nativeCategory:'Furniture'|'Trimming'|'Building'|'Skin'|'Environment';
  subtype:number;
  tags:readonly (readonly ['color'|'furnitureStyle'|'furnitureKind',string])[];
  universes:readonly number[];
  universeStatus?:'source_linked'|'unresolved_source'|'no_universe_in_verified_tag_fields';
  iconGuid?:string|null;
  worlds?:readonly string[];
  /** Optional validated shared placement projection. Unknown is not excluded. */
  placementScope?:'indoor'|'outdoor'|'both'|'unknown';
  /** Source-only ordinary home / terrain evidence from the common Item DB.
   * This is not a verified engine placement permission. */
  sourcePlacement?:Readonly<{
    ordinaryScope?:Readonly<{
      scopeHint:'indoor'|'outdoor'|'both'|'unknown';
      roomFloorWallCandidate:boolean|null;
      terrainCandidate:boolean|null;
    }>|null;
    placementLegalityVerified:false;
  }>;
  sourceSetItemId?:number|null;
  sourceSetNames?:Readonly<Record<string,string|null>>;
  prefabGuid?:string|null;
  nativeKey?:string;
  footprintSignature?:string|null;
}
export interface BoardGroup {id:string;name:string}
export interface BoardEntry {itemId:number;groupId:string|null}
export interface Board {id:string;name:string;entries:BoardEntry[];groups:BoardGroup[];note:string}
export interface BoardState {schema:'wand.explore.boards@1';active:string|null;boards:Board[];favorites:number[]}
export function emptyBoards():BoardState{return {schema:'wand.explore.boards@1',active:null,boards:[],favorites:[]}}
const validId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
export function readBoards(raw:string|null):BoardState{
  if(raw===null)return emptyBoards();
  const s=JSON.parse(raw) as BoardState;
  if(!s||s.schema!=='wand.explore.boards@1'||!Array.isArray(s.boards)||!Array.isArray(s.favorites)||
    !s.favorites.every(validId)||new Set(s.favorites).size!==s.favorites.length||
    new Set(s.boards.map(b=>b?.id)).size!==s.boards.length||
    s.boards.some(b=>!b||typeof b.id!=='string'||typeof b.name!=='string'||typeof b.note!=='string'||
      !Array.isArray(b.groups)||!Array.isArray(b.entries)||
      b.groups.some(g=>!g||typeof g.id!=='string'||typeof g.name!=='string')||
      new Set(b.groups.map(g=>g.id)).size!==b.groups.length||
      b.entries.some(e=>!e||!validId(e.itemId)||(e.groupId!==null&&!b.groups.some(g=>g.id===e.groupId)))||
      new Set(b.entries.map(e=>e.itemId)).size!==b.entries.length)||
    (s.active!==null&&!s.boards.some(b=>b.id===s.active)))throw Error('INVALID_MOODBOARDS');
  return s;
}
export function createBoard(state:BoardState,id:string,name:string):BoardState{
  if(!name.trim()||state.boards.some(b=>b.id===id))return state;
  return {...state,active:id,boards:[...state.boards,{id,name:name.trim(),entries:[],groups:[],note:''}]};
}
export function editBoard(state:BoardState,id:string,edit:(b:Board)=>Board):BoardState{
  return {...state,boards:state.boards.map(b=>b.id===id?edit(b):b)};
}
export function toggleItem(state:BoardState,id:string,itemId:number):BoardState{
  if(!validId(itemId))return state;
  return editBoard(state,id,b=>({...b,entries:b.entries.some(e=>e.itemId===itemId)?
    b.entries.filter(e=>e.itemId!==itemId):[...b.entries,{itemId,groupId:null}]}));
}
export function deleteBoard(state:BoardState,id:string):BoardState{
  const boards=state.boards.filter(b=>b.id!==id);
  return {...state,boards,active:state.active===id?(boards[0]?.id??null):state.active};
}
export function toggleFavorite(state:BoardState,itemId:number):BoardState{
  if(!validId(itemId))return state;
  return {...state,favorites:state.favorites.includes(itemId)?state.favorites.filter(id=>id!==itemId):[...state.favorites,itemId]};
}
