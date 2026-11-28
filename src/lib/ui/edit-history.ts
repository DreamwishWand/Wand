import {writable} from 'svelte/store';
import type {CollectionRuntime,CollectionState} from '$lib/collection/runtime';

/** In-memory, per-tool edit timeline; only Collection writes are currently supported. */
export type HistoryArea='collection'|'world'|'save';
export interface HistoryDescription{title:string;change:string}
export interface HistoryEntry extends HistoryDescription{id:number;timestamp:number}
export type HistoryError='stale'|'failed'|null;
export interface HistoryView{
  entries:readonly HistoryEntry[];
  cursor:number;
  busy:boolean;
  error:HistoryError;
}
interface StoredEntry extends HistoryEntry{before:string;after:string}
const LIMIT=40;
const empty:HistoryView={entries:[],cursor:0,busy:false,error:null};
export const historyView=writable<HistoryView>(empty);

class EditHistoryController {
  private entries:StoredEntry[]=[];
  private cursor=0;
  private editing=0;
  private traveling=false;
  private error:HistoryError=null;
  private serial=0;
  private currentRuntime:CollectionRuntime|null=null;

  private notify():void{
    historyView.set({
      entries:this.entries.map(({id,title,change,timestamp})=>({id,title,change,timestamp})),
      cursor:this.cursor,
      busy:this.editing>0||this.traveling,
      error:this.error
    });
  }
  private atCursor():string|null{
    if(this.entries.length===0)return null;
    return this.cursor===0?this.entries[0].before:this.entries[this.cursor-1].after;
  }
  private discard(error:HistoryError=null):void{
    this.entries=[];this.cursor=0;this.error=error;this.notify();
  }
  /** The Collection route registers its live Rust-backed runtime while mounted. */
  attachCollection(runtime:CollectionRuntime):()=>void{
    const expected=this.atCursor();
    if(expected!==null&&expected!==JSON.stringify(runtime.state))this.discard('stale');
    this.currentRuntime=runtime;
    return ()=>{if(this.currentRuntime===runtime)this.currentRuntime=null;};
  }
  /** A changed IndexedDB record must never be overwritten by a stale history. */
  reconcileCollection(state:CollectionState):void{
    const expected=this.atCursor();
    if(expected!==null&&expected!==JSON.stringify(state))this.discard('stale');
  }
  beginCollectionEdit():void{this.editing++;this.notify();}
  endCollectionEdit():void{this.editing=Math.max(0,this.editing-1);this.notify();}
  isTraveling():boolean{return this.traveling;}
  recordCollection(before:CollectionState,after:CollectionState,description:HistoryDescription):void{
    const previous=JSON.stringify(before),next=JSON.stringify(after);
    if(previous===next)return;
    const expected=this.atCursor();
    if(expected!==null&&expected!==previous)this.discard('stale');
    this.entries=this.entries.slice(0,this.cursor);
    this.entries.push({
      id:++this.serial,title:description.title,change:description.change,
      timestamp:Date.now(),before:previous,after:next
    });
    if(this.entries.length>LIMIT)this.entries.shift();
    this.cursor=this.entries.length;
    this.error=null;this.notify();
  }
  clearCollection():void{this.discard();}
  async travelCollection(target:number):Promise<boolean>{
    if(this.traveling||this.editing>0||!Number.isInteger(target)||
       target<0||target>this.entries.length||target===this.cursor)return false;
    const expected=this.atCursor();
    const targetState=target===0?this.entries[0]?.before:this.entries[target-1]?.after;
    if(!expected||!targetState)return false;
    this.traveling=true;this.error=null;this.notify();
    let ephemeral:CollectionRuntime|null=null;
    try{
      const runtime=this.currentRuntime??await (async()=>{
        const {CollectionRuntime}=await import('$lib/collection/runtime');
        return CollectionRuntime.openProfile();
      })();
      if(runtime!==this.currentRuntime)ephemeral=runtime;
      if(JSON.stringify(runtime.state)!==expected){
        this.discard('stale');
        return false;
      }
      await runtime.restore(targetState);
      this.cursor=target;this.error=null;this.notify();
      if(typeof window!=='undefined')
        window.dispatchEvent(new Event('wand:collection-history-restored'));
      return true;
    }catch(error){
      if(error instanceof Error&&error.message==='COLLECTION_STORAGE_CONFLICT')
        this.discard('stale');
      else this.error='failed';
      this.notify();
      return false;
    }finally{
      ephemeral?.close();
      this.traveling=false;this.notify();
    }
  }
  undo():Promise<boolean>{return this.travelCollection(this.cursor-1);}
  redo():Promise<boolean>{return this.travelCollection(this.cursor+1);}
}
export const editHistory=new EditHistoryController();
