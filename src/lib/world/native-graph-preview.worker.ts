/**
 * DB-04 owner-private source reference graph: local JSON-only Worker.
 *
 * Read-only JSON is decoded in the Worker; no binary ZIP parsing or WASM
 * replacement in TypeScript. Users extract the graph ZIP offline first.
 * Only bounded source ID/count projections cross the Svelte UI boundary.
 * Neither source content nor save files are uploaded or persisted.
 */
import {WorldReferenceIndex} from './reference-graph.ts';
import {
  createDb04GraphBrowser,
  type Db04GraphBrowser, type Db04GraphBrowserQuery
} from './native-graph-browser.ts';

type Message=
  | {command:'load';requestId:number;file:Blob}
  | {command:'query';requestId:number;query:Db04GraphBrowserQuery}
  | {command:'clear';requestId:number};
type Reply=
  | {kind:'loaded';requestId:number;catalog:Db04GraphBrowser['catalog']}
  | {kind:'page';requestId:number;page:ReturnType<Db04GraphBrowser['page']>}
  | {kind:'cleared';requestId:number}
  | {kind:'error';requestId:number;message:string};
interface WorkerScope {
  onmessage:((event:MessageEvent<unknown>)=>Promise<void>)|null;
  postMessage:(reply:Reply)=>void;
}
const worker=self as unknown as WorkerScope;
let browser:Db04GraphBrowser|null=null;
const MAX_GRAPH_JSON_BYTES=16*1024*1024;
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const goodId=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function decode(v:unknown):Message{
  if(!obj(v)||!goodId(v.requestId))throw new TypeError('INVALID_REQUEST_ID');
  if(v.command==='clear')return {command:'clear',requestId:v.requestId};
  if(v.command==='load'){
    if(!(v.file instanceof Blob)||v.file.size<1||
      v.file.size>MAX_GRAPH_JSON_BYTES)
      throw new TypeError('SOURCE_GRAPH_JSON_REQUIRED_OR_TOO_LARGE');
    return {command:'load',requestId:v.requestId,file:v.file};
  }
  if(v.command==='query'&&obj(v.query)){
    const q=v.query;
    if(!['world','area','grid','unlinked_world'].includes(String(q.scope))||
      !goodId(q.offset)||!goodId(q.limit)||
      q.limit<1||q.limit>128||
      (q.scopeId!==null&&typeof q.scopeId!=='string')||
      (q.exactItemId!==undefined&&typeof q.exactItemId!=='string'))
      throw new TypeError('INVALID_SOURCE_GRAPH_QUERY');
    return {command:'query',requestId:v.requestId,
      query:{
        scope:q.scope as Db04GraphBrowserQuery['scope'],
        scopeId:q.scopeId as string|null,
        exactItemId:q.exactItemId as string|undefined,
        offset:q.offset,
        limit:q.limit
      }};
  }
  throw new TypeError('UNKNOWN_SOURCE_GRAPH_COMMAND');
}
worker.onmessage=async({data}:MessageEvent<unknown>):Promise<void>=>{
  const requestId=obj(data)&&goodId(data.requestId)?data.requestId:0;
  try{
    const command=decode(data);
    if(command.command==='clear'){
      browser=null;
      worker.postMessage({kind:'cleared',requestId});
      return;
    }
    if(command.command==='load'){
      browser=null;
      // Parse text only. The original distribution is a private ZIP; it
      // must be extracted before selecting its single reference-graph JSON.
      const text=await command.file.text();
      if(text.length>MAX_GRAPH_JSON_BYTES)
        throw new TypeError('SOURCE_GRAPH_JSON_TOO_LARGE');
      const graph=new WorldReferenceIndex(JSON.parse(text) as unknown);
      browser=createDb04GraphBrowser(graph);
      worker.postMessage({kind:'loaded',requestId,catalog:browser.catalog});
      return;
    }
    if(browser===null)throw new TypeError('SOURCE_GRAPH_NOT_LOADED');
    worker.postMessage({kind:'page',requestId,
      page:browser.page(command.query)});
  }catch(error){
    worker.postMessage({
      kind:'error',requestId,
      message:error instanceof Error?error.message.slice(0,200):
        '原本参照グラフの読み込みに失敗しました'
    });
  }
};
