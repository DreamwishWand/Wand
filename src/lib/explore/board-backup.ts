import {readBoards,type Board,type BoardState} from './model.ts';
export const MOODBOARD_BACKUP_SCHEMA='wand.explore.moodboard-backup@1' as const;
export interface MoodboardBackup {schema:typeof MOODBOARD_BACKUP_SCHEMA;active:string|null;boards:Board[]}
/** Persist only portable creative records, never profile data, save data or artwork bytes. */
function portableBoard(board:Board):Board{
  return {id:board.id,name:board.name,note:board.note,
    groups:board.groups.map(g=>({id:g.id,name:g.name})),
    entries:board.entries.map(e=>({itemId:e.itemId,groupId:e.groupId}))};
}
export function encodeMoodboardBackup(state:BoardState,onlyId?:string):string{
  const boards=state.boards.filter(b=>onlyId===undefined||b.id===onlyId).map(portableBoard);
  if(!boards.length)throw Error('MOODBOARD_BACKUP_EMPTY');
  return JSON.stringify({schema:MOODBOARD_BACKUP_SCHEMA,active:onlyId??state.active,boards} satisfies MoodboardBackup);
}
export function readMoodboardBackup(raw:string):MoodboardBackup{
  const input=JSON.parse(raw) as MoodboardBackup;
  if(input?.schema!==MOODBOARD_BACKUP_SCHEMA||!Array.isArray(input.boards)||!input.boards.length)
    throw Error('MOODBOARD_BACKUP_INVALID');
  const state=readBoards(JSON.stringify({schema:'wand.explore.boards@1',active:input.active,boards:input.boards,favorites:[]}));
  return {schema:MOODBOARD_BACKUP_SCHEMA,active:state.active,boards:state.boards.map(portableBoard)};
}
/** Additive restore: preserve all existing boards, skip exact copies and
 * re-identify divergent boards sharing an ID. Group IDs are board-local. */
export function mergeMoodboardBackup(state:BoardState,backup:MoodboardBackup,newId:()=>string):BoardState{
  const boards=[...state.boards];
  const existing=new Map(boards.map(b=>[b.id,b]));
  const reserved=new Set([...existing.keys(),...backup.boards.map(b=>b.id)]);
  let selected:string|null=null;
  for(const source of backup.boards){
    const board=portableBoard(source),old=existing.get(board.id);
    if(old&&JSON.stringify(portableBoard(old))===JSON.stringify(board)){
      if(source.id===backup.active)selected=old.id;
      continue;
    }
    if(old){
      const id=newId();
      if(!id||reserved.has(id))throw Error('MOODBOARD_BACKUP_ID_CONFLICT');
      reserved.add(id);board.id=id;
    }
    boards.push(board);existing.set(board.id,board);
    if(source.id===backup.active)selected=board.id;
  }
  return {...state,boards,active:selected??state.active??boards[0]?.id??null};
}
