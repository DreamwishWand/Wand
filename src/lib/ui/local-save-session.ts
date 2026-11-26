import {writable} from 'svelte/store';
import type {SavedMemoryFlags} from '../media/saved-memory-flags.ts';
import {readWandLanguage} from './preferences.ts';
import {appendReplayStep,travelReplayStep,type CheckpointJournal} from '../world/checkpoint-journal.ts';
import {checkpointWords} from '../world/world-checkpoint-words.ts';

/** A selected game save stays exclusively in this browser tab's memory. */
export type LocalSaveReadStatus='selected'|'reading'|'parsed'|'invalid';
export interface LocalSaveSession{
  readonly file:File|null;
  readonly revision:number;
  readonly collectionStatus:LocalSaveReadStatus;
  readonly worldCheckpoint?:WorldCheckpointHistory;
  readonly memoryFlags?:SavedMemoryFlags;
}
/** Explicitly applied, independently validated experimental copies. In-memory
 * only: preserve the original File and use a fresh revision for every change. */
export interface WorldCheckpointHistory{
 readonly original:File;
 readonly files:readonly File[];
 readonly cursor:number;
 readonly firstStep:number;
 readonly journal?:CheckpointJournal;
}
export const WORLD_CHECKPOINT_MAX_BYTES=128*1024*1024;
export const WORLD_CHECKPOINT_MAX_STEPS=32;
export function appendWorldCheckpoint(history:WorldCheckpointHistory|undefined,source:File,copy:File):WorldCheckpointHistory|null{
 if(source===copy||copy.size<1||copy.size>32*1024*1024)return null;
 const base=history??{original:source,files:[source],cursor:0,firstStep:0};
 if(base.files[base.cursor]!==source)return null;
 const files=[...base.files.slice(0,base.cursor+1),copy];
 let firstStep=base.firstStep;
 const total=()=>files.reduce((n,f)=>n+f.size,0)+(files.includes(base.original)?0:base.original.size);
 // Evict oldest *undo* checkpoints, never the original or current copy.
 // The reachable history has no artificial jump back to the original.
 while(files.length>2&&(files.length>WORLD_CHECKPOINT_MAX_STEPS+1||total()>WORLD_CHECKPOINT_MAX_BYTES)){files.shift();firstStep++;}
 if(total()>WORLD_CHECKPOINT_MAX_BYTES)return null;
 return {original:base.original,files,cursor:files.length-1,firstStep,journal:appendReplayStep(history?.journal,base.firstStep+base.cursor,copy,firstStep)};
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
function guardCheckpointUnload(e:BeforeUnloadEvent){if(current.worldCheckpoint){e.preventDefault();e.returnValue='';}}
function confirmExternalChange(next:File|null):boolean{
 if(changeGuard)return changeGuard(current.file,next);
 return !current.worldCheckpoint||typeof window!=='undefined'&&window.confirm(checkpointWords[readWandLanguage()][5]);
}
function clearCheckpointUnload(){if(typeof window!=='undefined')window.removeEventListener('beforeunload',guardCheckpointUnload);}
export function selectLocalSaveFile(file:File):boolean{
  if(current.file===file)return true;
  if(!confirmExternalChange(file))return false;
  clearCheckpointUnload();
  current={file,revision:++nextRevision,collectionStatus:'selected'};
  state.set(current);
  return true;
}
export function closeLocalSaveFile():boolean{
  if(current.file===null)return true;
  if(!confirmExternalChange(null))return false;
  clearCheckpointUnload();
  current={file:null,revision:++nextRevision,collectionStatus:'selected'};
  state.set(current);
  return true;
}
/** Session-scoped, read-only flags. New save revisions discard this field.
 * Never persisted or converted to owned/missing without native verification. */
export function updateCollectionMemoryFlags(revision:number,file:File,flags:SavedMemoryFlags):void{
  if(!isCurrentLocalSaveSelection(revision,file))return;
  current={...current,memoryFlags:flags};
  state.set(current);
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
 if(typeof window!=='undefined')window.addEventListener('beforeunload',guardCheckpointUnload);
 state.set(current);return true;
}
export function travelWorldCheckpoint(source:File,delta:-1|1):boolean{
 if(current.file!==source||!current.worldCheckpoint)return false;
 const h=current.worldCheckpoint,cursor=h.cursor+delta;
 if(!Number.isInteger(cursor)||cursor<0||cursor>=h.files.length)return false;
 current={file:h.files[cursor],revision:++nextRevision,collectionStatus:'selected',worldCheckpoint:{...h,cursor,journal:travelReplayStep(h.journal,h.firstStep+cursor)}};
 state.set(current);return true;
}

/** Publish the fully rebuilt history only after all semantic replay steps
 * have passed the original Rust copy writers. No intermediate checkpoint
 * is exposed to Collection, other services, or the current Save session. */
export function restoreWorldCheckpoint(original:File,history:WorldCheckpointHistory):boolean{
 if(current.file!==original||current.worldCheckpoint||history.original!==original||!history.journal||
 history.firstStep!==history.journal.firstStep||history.firstStep+history.cursor!==history.journal.cursor||
 history.firstStep+history.files.length-1!==history.journal.steps.length||history.cursor<0||history.cursor>=history.files.length||
 history.files.length>WORLD_CHECKPOINT_MAX_STEPS+1||history.files.reduce((n,f)=>n+f.size,history.files.includes(original)?0:original.size)>WORLD_CHECKPOINT_MAX_BYTES)return false;
 current={file:history.files[history.cursor],revision:++nextRevision,collectionStatus:'selected',worldCheckpoint:history};
 if(typeof window!=='undefined')window.addEventListener('beforeunload',guardCheckpointUnload);
 state.set(current);return true;
}
