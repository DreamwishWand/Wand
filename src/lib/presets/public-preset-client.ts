import {PRESET_SCHEMAS,type PresetKind} from './preset-session-format.ts';
import {verifyPublicPreset,type PublicPresetReceipt} from './preset-publication.ts';
import {loadShareCatalog} from './preset-share-file.ts';
export const PUBLIC_KINDS=['scene','support','region','biome','island','world','room','floor','building','design','network'] as const;
export type PublicKind=typeof PUBLIC_KINDS[number];
export interface PublicPresetEntry{workId:string;revisionId:string;artifactId:string;title:string;creatorProfileId:string;creatorName:string;publishedAt:string;receipt:PublicPresetReceipt;mediaId:string|null}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const number=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function parsePublicEntry(v:any):PublicPresetEntry{
 const q=v?.receipt;
 if(!v||!uuid(v.workId)||!uuid(v.revisionId)||!uuid(v.artifactId)||!uuid(v.creatorProfileId)||!text(v.title,240)||!text(v.creatorName,240)||!text(v.publishedAt,64)||!Number.isFinite(Date.parse(v.publishedAt))||v.mediaId!==null&&!uuid(v.mediaId)||
 !q||q.schemaVersion!==2||!PRESET_SCHEMAS.includes(q.schema)||q.schema==='wand.preset.native-backup@1'||q.schema==='wand.preset.game-code@1'||!PUBLIC_KINDS.includes(q.kind)||q.gameVersion!=='1.26.2'||!number(q.byteSize,1,16_000_000)||!['application/json','application/gzip'].includes(q.contentType)||!(/^[0-9a-f]{64}$/).test(q.checksumSha256)||!number(q.totalObjects,0,200000)||!number(q.distinctObjectTypes,0,q.totalObjects))throw Error('PUBLIC_PRESET_RESPONSE');
 return {workId:v.workId,revisionId:v.revisionId,artifactId:v.artifactId,title:v.title,creatorProfileId:v.creatorProfileId,creatorName:v.creatorName,publishedAt:v.publishedAt,receipt:{schemaVersion:2,schema:q.schema,kind:q.kind,gameVersion:'1.26.2',byteSize:q.byteSize,contentType:q.contentType,checksumSha256:q.checksumSha256,distinctObjectTypes:q.distinctObjectTypes,totalObjects:q.totalObjects},mediaId:v.mediaId};
}
export function presetPublicEndpoint(configured:unknown,hostname:string){
 // The Pages development environment alone may use the staging project.
 // Production must explicitly configure its own HTTPS project origin.
 const origin=typeof configured==='string'&&configured.trim()?configured.trim():hostname.toLowerCase()==='dreamwishwand.github.io'?'https://ptpdoxhrqopvczpclcij.supabase.co':null;
 if(!origin)return null;
 try{const u=new URL(origin);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?u.origin:null;}catch{return null;}
}
export function publicMediaUrl(origin:string,id:string|null){return id&&uuid(id)?origin+'/functions/v1/community-public-media?mediaId='+encodeURIComponent(id):null;}
async function request(origin:string,payload:object,fetcher:typeof fetch,signal?:AbortSignal){
 const response=await fetcher(origin+'/functions/v1/wand-presets-public-v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error',cache:'no-store',signal});
 if(!response.ok)throw Error('PUBLIC_PRESET_UNAVAILABLE');return response.json();
}
export async function listPublicPresets(origin:string,query:string,kind:PublicKind|null,offset=0,fetcher:typeof fetch=fetch,signal?:AbortSignal){
 if(query.length>100||kind!==null&&!PUBLIC_KINDS.includes(kind)||!number(offset,0,10000))throw Error('PUBLIC_FILTER');
 const v=await request(origin,{action:'list',query:query.trim(),kind,limit:30,offset},fetcher,signal);
 if(v?.contract!=='wand.public-preset-list@2'||!Array.isArray(v.entries)||v.entries.length>30||v.nextOffset!==null&&v.nextOffset!==offset+30)throw Error('PUBLIC_LIST');
 const entries=v.entries.map(parsePublicEntry) as PublicPresetEntry[];
 if(new Set(entries.map(e=>e.workId)).size!==entries.length)throw Error('PUBLIC_DUPLICATE');
 return {entries,nextOffset:v.nextOffset!==null&&v.nextOffset<=10000?v.nextOffset:null as number|null};
}
export async function downloadPublicPreset(origin:string,entry:PublicPresetEntry,base:string,fetcher:typeof fetch=fetch,signal?:AbortSignal){
 const row=await request(origin,{action:'download',workId:entry.workId,revisionId:entry.revisionId},fetcher,signal);
 if(row?.contract!=='wand.public-preset-download@2'||row.expiresIn!==60||typeof row.url!=='string')throw Error('PUBLIC_DOWNLOAD');
 const current=parsePublicEntry(row.entry);
 if(current.workId!==entry.workId||current.revisionId!==entry.revisionId||current.artifactId!==entry.artifactId||current.receipt.checksumSha256!==entry.receipt.checksumSha256)throw Error('PUBLIC_CHANGED');
 const url=new URL(row.url);if(url.origin!==origin||url.username||url.password||!url.pathname.startsWith('/storage/v1/object/sign/')||!url.searchParams.has('token'))throw Error('PUBLIC_DOWNLOAD_URL');
 const response=await fetcher(url.href,{credentials:'omit',redirect:'error',cache:'no-store',signal});
 if(!response.ok||!response.body)throw Error('PUBLIC_DOWNLOAD');
 const reader=response.body.getReader(),bytes=new Uint8Array(current.receipt.byteSize);let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(n+value.length>bytes.length){await reader.cancel();throw Error('PUBLIC_DOWNLOAD_SIZE');}bytes.set(value,n);n+=value.length;}}
 finally{reader.releaseLock();}
 if(n!==bytes.length)throw Error('PUBLIC_DOWNLOAD_SIZE');
 const file=new File([bytes],current.title+'.wandpreset',{type:current.receipt.contentType});
 const raw=await verifyPublicPreset(file,current.receipt,await loadShareCatalog(base,fetcher));
 return {file,raw,source:{workId:current.workId,revisionId:current.revisionId,creatorProfileId:current.creatorProfileId,creatorName:current.creatorName,title:current.title}};
}
