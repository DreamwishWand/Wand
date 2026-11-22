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

export function selectLocalSaveFile(file:File):void{
  current={file,revision:++nextRevision,collectionStatus:'selected'};
  state.set(current);
}
export function closeLocalSaveFile():void{
  current={file:null,revision:++nextRevision,collectionStatus:'selected'};
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
