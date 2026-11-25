import {writable} from 'svelte/store';

/** A selected game save stays exclusively in this browser tab's memory. */
export type LocalSaveReadStatus='selected'|'reading'|'parsed'|'invalid';
export interface LocalSaveSession{
  readonly file:File|null;
  readonly revision:number;
  readonly collectionStatus:LocalSaveReadStatus;
  readonly worldCheckpoint?:WorldCheckpointHistory;
}
/** Explicitly applied, independently validated experimental copies. In-memory
 * only: preserve the original File and use a fresh revision for every change. */
export interface WorldCheckpointHistory{
 readonly files:readonly File[];
 readonly cursor:number;
}
export const WORLD_CHECKPOINT_MAX_BYTES=128*1024*1024;
export const WORLD_CHECKPOINT_MAX_STEPS=32;
export function appendWorldCheckpoint(history:WorldCheckpointHistory|undefined,source:File,copy:File):WorldCheckpointHistory|null{
 if(source===copy||copy.size<1||copy.size>32*1024*1024)return null;
 const base=history??{files:[source],cursor:0};
 if(base.files[base.cursor]!==source)return null;
 const files=[...base.files.slice(0,base.cursor+1),copy];
 if(files.length>WORLD_CHECKPOINT_MAX_STEPS+1||files.reduce((n,f)=>n+f.size,0)>WORLD_CHECKPOINT_MAX_BYTES)return null;
 return {files,cursor:files.length-1};
}
let nextRevision=0;
let completedRevision=0;
let current:LocalSaveSession={file:null,revision:0,collectionStatus:'selected'};
const state=writable<LocalSaveSession>(current);
export const localSaveSession={subscribe:state.subscribe};

/** A mounted editor may veto a user-initiated file change before subscribers
 * see it. This guards *all* entry points: header, drop, Collection, and editor.
 * No File or Save bytes are retained by the guard registration itself.
 */
type LocalSaveChangeGuard=(previous:File|null,next:File|null)=>boolean;
let changeGuard:LocalSaveChangeGuard|null=null;
export function registerLocalSaveChangeGuard(
  guard:LocalSaveChangeGuard
):()=>void{
  if(changeGuard!==null)throw new Error('LOCAL_SAVE_GUARD_ALREADY_REGISTERED');
  changeGuard=guard;
  return ()=>{
    if(changeGuard===guard)changeGuard=null;
  };
}
export function selectLocalSaveFile(file:File):boolean{
  if(current.file===file)return true;
  if(changeGuard&&!changeGuard(current.file,file))return false;
  current={file,revision:++nextRevision,collectionStatus:'selected'};
  state.set(current);
  return true;
}
export function closeLocalSaveFile():boolean{
  if(current.file===null)return true;
  if(changeGuard&&!changeGuard(current.file,null))return false;
  current={file:null,revision:++nextRevision,collectionStatus:'selected'};
  state.set(current);
  return true;
}
export function needsCollectionRead(revision:number):boolean{
  return revision>completedRevision;
}
export function updateCollectionRead(revision:number,status:Exclude<LocalSaveReadStatus,'selected'>):void{
  if(revision!==current.revision||!current.file)return;
  current={...current,collectionStatus:status};
  state.set(current);
  if(status==='parsed'||status==='invalid')completedRevision=revision;
}

/** Reject responses from a file that has since been replaced or closed. */
export function isCurrentLocalSaveSelection(revision:number,file:File):boolean{
  return current.revision===revision && current.file===file;
}

/** Only callers with a verified copy receipt may apply a new checkpoint.
 * No external file-selection bypass: the exact active source is required.
 * The World Editor checks outstanding transform drafts before invoking. */
export function commitWorldCheckpoint(source:File,copy:File):boolean{
 if(current.file!==source)return false;
 const history=appendWorldCheckpoint(current.worldCheckpoint,source,copy);
 if(!history)return false;
 current={file:copy,revision:++nextRevision,collectionStatus:'selected',worldCheckpoint:history};
 state.set(current);return true;
}
export function travelWorldCheckpoint(source:File,delta:-1|1):boolean{
 if(current.file!==source||!current.worldCheckpoint)return false;
 const h=current.worldCheckpoint,cursor=h.cursor+delta;
 if(!Number.isInteger(cursor)||cursor<0||cursor>=h.files.length)return false;
 current={file:h.files[cursor],revision:++nextRevision,collectionStatus:'selected',worldCheckpoint:{files:h.files,cursor}};
 state.set(current);return true;
}
