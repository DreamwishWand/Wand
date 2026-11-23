import {writable} from 'svelte/store';

/** A selected game save stays exclusively in this browser tab's memory. */
export type LocalSaveReadStatus='selected'|'reading'|'parsed'|'invalid';
export interface LocalSaveSession{
  readonly file:File|null;
  readonly revision:number;
  readonly collectionStatus:LocalSaveReadStatus;
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
