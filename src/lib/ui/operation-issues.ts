import {writable} from 'svelte/store';
import type {HistoryArea} from './edit-history';

/** Only fixed diagnostic codes are retained: never put save bytes or filenames into this log. */
export type OperationIssueCode=
  |'save-file-rejected'|'save-read-invalid'
  |'collection-history-stale'|'collection-history-failed';
export type OperationIssueState='open'|'acknowledged'|'resolved';
export interface OperationIssue{
  readonly id:number;
  readonly area:HistoryArea;
  readonly code:OperationIssueCode;
  readonly timestamp:number;
  readonly state:OperationIssueState;
}
export interface OperationIssueView{
  readonly entries:readonly OperationIssue[];
  readonly hasOpen:boolean;
}
const LIMIT=60;
const initial:OperationIssueView={entries:[],hasOpen:false};
const store=writable<OperationIssueView>(initial);
let entries:OperationIssue[]=[];
let nextId=0;

function emit():void{
  store.set({entries:[...entries],hasOpen:entries.some(issue=>issue.state==='open')});
}
export const operationIssueView={subscribe:store.subscribe};

/** A reoccurring open issue is one incident; after acknowledgment or repair, it is a new incident. */
export function reportOperationIssue(area:HistoryArea,code:OperationIssueCode):number{
  const existing=entries.find(issue=>issue.area===area&&issue.code===code&&issue.state==='open');
  if(existing)return existing.id;
  const id=++nextId;
  entries.push({id,area,code,timestamp:Date.now(),state:'open'});
  if(entries.length>LIMIT)entries=entries.slice(-LIMIT);
  emit();
  return id;
}
/** Dismiss an alert without falsely stating that the underlying problem was fixed. */
export function acknowledgeOperationIssue(id:number):void{
  let changed=false;
  entries=entries.map(issue=>{
    if(issue.id!==id||issue.state!=='open')return issue;
    changed=true;
    return {...issue,state:'acknowledged'};
  });
  if(changed)emit();
}
/** Call after the associated source has recovered or was replaced. */
export function resolveOperationIssue(area:HistoryArea,code:OperationIssueCode):void{
  let changed=false;
  entries=entries.map(issue=>{
    if(issue.area!==area||issue.code!==code||issue.state==='resolved')return issue;
    changed=true;
    return {...issue,state:'resolved'};
  });
  if(changed)emit();
}
