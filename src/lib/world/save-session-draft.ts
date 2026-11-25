/** Committed, local-only Save edit recovery. Raw Save bytes are never stored.
 * The exact source SHA-256 binds all ordinals to one original input. The
 * source geometry release and the Rust receipt/plan schema are versioned. */
import {WORLD_BATCH_LIMIT,WORLD_HISTORY_LIMIT,type WorldEditTimeline,type WorldStagedEdit} from './saved-map-batch.ts';
import {isCardinal} from './saved-map-transform.ts';
import {PUBLIC_TERRAIN_ROOT} from './public-terrain-projection.ts';
import {readDesignDraft,changeLocalWorldDraft} from './design-draft.ts';
import type {TerrainScopeReceipt} from './terrain-binding.ts';
import type {SavedNumericPoint} from './saved-grid-source-candidates.ts';
export interface SaveDraftIdentity{fingerprint:string;format:'json'|'p1g';source:string}
export interface SaveDraftContext{area:string;overview:boolean}
export interface SaveSessionDraft{schema:'wand.local-save-world-draft@1';identity:SaveDraftIdentity;timeline:WorldEditTimeline;context:SaveDraftContext}
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0xffffffff;
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
const str=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max;
const invalid=()=>{throw Error('WORLD_SAVE_DRAFT_INVALID');};
export function saveDraftIdentity(fingerprint:unknown,format:unknown):SaveDraftIdentity|null{
 if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint)||format!=='json'&&format!=='p1g')return null;
 return {fingerprint,format,source:PUBLIC_TERRAIN_ROOT+'|wand.db05.db04-terrain-session@1|wand.db05.grid-mixed-batch-preview@1'};
}
export const saveDraftKey=(id:SaveDraftIdentity)=>'save:'+id.format+':'+id.fingerprint;
export function makeSaveSessionDraft(identity:SaveDraftIdentity,timeline:WorldEditTimeline,context:SaveDraftContext):SaveSessionDraft{
 return {schema:'wand.local-save-world-draft@1',identity,timeline,context};
}
export function parseSaveSessionDraft(value:unknown,identity:SaveDraftIdentity,sessions:readonly TerrainScopeReceipt[]):SaveSessionDraft{
 if(!rec(value)||value.schema!=='wand.local-save-world-draft@1'||!rec(value.identity)||value.identity.fingerprint!==identity.fingerprint||value.identity.format!==identity.format||value.identity.source!==identity.source||!rec(value.timeline)||!rec(value.context))throw Error('WORLD_SAVE_DRAFT_IDENTITY');
 const context=value.context,t=value.timeline;
 if(!str(context.area,512)||!sessions.some(s=>s.receipt.viewKey===context.area)||typeof context.overview!=='boolean')throw Error('WORLD_SAVE_DRAFT_CONTEXT');
 if(!Array.isArray(t.snapshots)||!t.snapshots.length||t.snapshots.length>WORLD_HISTORY_LIMIT+1||typeof t.cursor!=='number'||!Number.isInteger(t.cursor)||t.cursor<0||t.cursor>=t.snapshots.length)throw Error('WORLD_SAVE_DRAFT_HISTORY');
 // Only unambiguous original full records from the current Rust session
 // qualify. No cached geometry, edited coordinates or private identity is trusted.
 const points=new Map<number,SavedNumericPoint|null>();
 for(const session of sessions)for(const p of session.receipt.points)points.set(p.localOrdinal,points.has(p.localOrdinal)?null:p);
 const snapshots:WorldEditTimeline['snapshots'][number][]=[];
 for(const snapshot of t.snapshots){
  if(!rec(snapshot)||!Array.isArray(snapshot.edits)||snapshot.edits.length>WORLD_BATCH_LIMIT||!str(snapshot.title,512)||!str(snapshot.warning,2048))throw Error('WORLD_SAVE_DRAFT_SNAPSHOT');
  const edits:WorldStagedEdit[]=[],seen=new Set<number>();
  for(const entry of snapshot.edits){
   if(!rec(entry)||!rec(entry.plan)||!positive(entry.gridOrdinal)||!str(entry.name,512)||!str(entry.warning,2048))throw Error('WORLD_SAVE_DRAFT_EDIT');
   const p=entry.plan;
   if(p.recordKind!=='full'||!positive(p.localOrdinal)||seen.has(p.localOrdinal)||typeof p.itemId!=='string'||!/^[1-9][0-9]{0,19}$/.test(p.itemId)||!int(p.expectedX)||!int(p.expectedY)||(p.replacementX!==null&&!int(p.replacementX))||(p.replacementY!==null&&!int(p.replacementY))||(p.replacementX===null)!==(p.replacementY===null)||(p.expectedOrientation!==null&&!isCardinal(p.expectedOrientation))||(p.replacementOrientation!==null&&!isCardinal(p.replacementOrientation))||(p.expectedOrientation===null)!==(p.replacementOrientation===null))throw Error('WORLD_SAVE_DRAFT_PLAN');
   const original=points.get(p.localOrdinal);
   if(!original||original.subgrid||original.localGridOrdinal!==entry.gridOrdinal||original.itemId!==p.itemId||original.x!==p.expectedX||original.y!==p.expectedY||(p.expectedOrientation!==null&&original.orientation!==p.expectedOrientation))throw Error('WORLD_SAVE_DRAFT_STALE');
   if((p.replacementX===null||p.replacementX===p.expectedX&&p.replacementY===p.expectedY)&&(p.replacementOrientation===null||p.replacementOrientation===p.expectedOrientation))invalid();
   seen.add(p.localOrdinal);
   edits.push({gridOrdinal:entry.gridOrdinal,name:entry.name,warning:entry.warning,plan:{localOrdinal:p.localOrdinal,itemId:p.itemId,recordKind:'full',expectedX:p.expectedX,expectedY:p.expectedY,replacementX:p.replacementX as number|null,replacementY:p.replacementY as number|null,expectedOrientation:p.expectedOrientation as string|null,replacementOrientation:p.replacementOrientation as string|null}});
  }
  snapshots.push({edits,title:snapshot.title,warning:snapshot.warning});
 }
 return {schema:'wand.local-save-world-draft@1',identity,timeline:{snapshots,cursor:t.cursor},context:{area:context.area,overview:context.overview}};
}
export const readSaveDraft=(id:SaveDraftIdentity)=>readDesignDraft(saveDraftKey(id));
export const writeSaveDraft=(id:SaveDraftIdentity,revision:string|null,draft:SaveSessionDraft)=>changeLocalWorldDraft(saveDraftKey(id),revision,draft);
export const discardSaveDraft=(id:SaveDraftIdentity,revision:string|null)=>changeLocalWorldDraft(saveDraftKey(id),revision,null);
