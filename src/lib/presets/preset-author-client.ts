import {preparePublicPreset} from './preset-publication.ts';
import {loadShareCatalog} from './preset-share-file.ts';
import type {SessionPreset} from './preset-session-format.ts';
/** Receives the current access token from the shared Wand Account client.
 * Never retains credentials, creates its own login, or transmits a Save. */
export interface PresetAuthorTransport{origin:string;accessToken:()=>Promise<string>;fetcher?:typeof fetch}
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function request(t:PresetAuthorTransport,payload:object,endpoint='wand-presets-publish-v2'){
 const u=new URL(t.origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('PRESET_ENDPOINT');
 const token=await t.accessToken();if(!token)throw Error('PRESET_AUTH_REQUIRED');
 const r=await (t.fetcher??fetch)(u.origin+'/functions/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error',cache:'no-store'});
 if(!r.ok)throw Error('PRESET_AUTHOR_REQUEST');return r;
}
async function call(t:PresetAuthorTransport,payload:object){return (await request(t,payload)).json();}
export async function authorContext(t:PresetAuthorTransport){
 const data=await call(t,{action:'author-context'});if(data?.contract!=='wand.preset-author-context@2'||!Array.isArray(data.profiles)||!Array.isArray(data.media)||!Array.isArray(data.works))throw Error('PRESET_AUTHOR_CONTEXT');return data;
}
export interface PublicationDraft{title:string;description:string;creatorProfileId:string;mediaIds:string[];ownWorkConfirmed:boolean;presetArtifactId?:string;idempotencyKey:string}
export function assertPublicationDraft(v:PublicationDraft){
 if(!v.ownWorkConfirmed||!v.title.trim()||v.title.length>240||v.description.length>20000||!id.test(v.creatorProfileId)||!id.test(v.idempotencyKey)||v.presetArtifactId!==undefined&&!id.test(v.presetArtifactId)||v.mediaIds.length<1||v.mediaIds.length>10||v.mediaIds.some(m=>!id.test(m))||new Set(v.mediaIds).size!==v.mediaIds.length)throw Error('PRESET_DRAFT');
}
export async function publishPreset(t:PresetAuthorTransport,entry:SessionPreset,draft:PublicationDraft,base:string){
 assertPublicationDraft(draft);
 // Imported works retain creator credit in-session and are not offered
 // as a user's original upload. Raw private native data is never sent.
 if(entry.domain!=='wand'||entry.privateBackup||entry.publicSource)throw Error('PRESET_NOT_OWN_WORK');
 const packed=await preparePublicPreset(entry.file,entry.name,await loadShareCatalog(base,t.fetcher??fetch));
 const prepared=await call(t,{action:'prepare',byteSize:packed.file.size,contentType:packed.receipt.contentType});
 if(prepared?.contract!=='wand.preset-upload@2'||prepared.contentType!==packed.receipt.contentType||typeof prepared.storageKey!=='string'||typeof prepared.signedUpload?.signedUrl!=='string')throw Error('PRESET_UPLOAD_PREPARE');
 const url=new URL(prepared.signedUpload.signedUrl),origin=new URL(t.origin).origin;
 if(url.origin!==origin||url.username||url.password||!url.pathname.startsWith('/storage/v1/object/upload/sign/')||!url.searchParams.has('token'))throw Error('PRESET_UPLOAD_URL');
 const form=new FormData();form.append('cacheControl','0');form.append('',packed.file);
 const upload=await (t.fetcher??fetch)(url.href,{method:'PUT',headers:{'x-upsert':'false'},body:form,redirect:'error',credentials:'omit'});
 if(!upload.ok)throw Error('PRESET_UPLOAD_FAILED');
 const published=await call(t,{action:'publish',storageKey:prepared.storageKey,...draft});
 if(published?.contract!=='wand.preset-published@2'||published.receipt?.checksumSha256!==packed.receipt.checksumSha256)throw Error('PRESET_PUBLISH_RESPONSE');return published;
}
export async function retirePreset(t:PresetAuthorTransport,action:'unpublish'|'delete',presetArtifactId:string,idempotencyKey:string){
 if(!id.test(presetArtifactId)||!id.test(idempotencyKey))throw Error('PRESET_LIFECYCLE');
 const result=await call(t,{action,presetArtifactId,idempotencyKey});
 if(result?.contract!=='wand.preset-lifecycle@2')throw Error('PRESET_LIFECYCLE_RESPONSE');return result.publication;
}

export type AuthorImage={media_id:string;mime_type:string;width:number;height:number;created_at:string};
export async function loadAuthorImage(t:PresetAuthorTransport,mediaId:string):Promise<Blob>{
 if(!id.test(mediaId))throw Error('MEDIA_ID');
 const metadata=await (await request(t,{action:'read',mediaId},'community-media')).json(),m=metadata?.media;
 if(m?.mediaId!==mediaId||!['image/jpeg','image/png','image/webp'].includes(m.mimeType)||!Number.isSafeInteger(m.byteSize)||m.byteSize<1||m.byteSize>20971520||!(/^[0-9a-fA-F]{64}$/).test(m.checksumSha256))throw Error('MEDIA_RECEIPT');
 let response:Response;
 if(m.transport==='authenticated_edge_binary_post')response=await request(t,{action:'galleryReadBytes',mediaId},'community-media');
 else{
  const url=new URL(m.signedUrl);
  if(url.origin!==new URL(t.origin).origin||url.username||url.password||!url.pathname.startsWith('/storage/v1/object/sign/')||!url.searchParams.has('token'))throw Error('MEDIA_URL');
  response=await(t.fetcher??fetch)(url.href,{credentials:'omit',redirect:'error',cache:'no-store'});
 }
 if(!response.ok||!response.body)throw Error('MEDIA_DOWNLOAD');
 const reader=response.body.getReader(),bytes=new Uint8Array(m.byteSize);let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(n+value.length>bytes.length){await reader.cancel();throw Error('MEDIA_SIZE');}bytes.set(value,n);n+=value.length;}}
 finally{reader.releaseLock();}
 if(n!==bytes.length)throw Error('MEDIA_SIZE');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==m.checksumSha256.toLowerCase())throw Error('MEDIA_CHECKSUM');
 return new Blob([bytes],{type:m.mimeType});
}
export async function uploadAuthorImage(t:PresetAuthorTransport,file:File,ownWorkConfirmed:boolean){
 if(!ownWorkConfirmed||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>20971520)throw Error('MEDIA_INVALID');
 const p=await (await request(t,{action:'galleryPrepare',mimeType:file.type,byteSize:file.size},'community-media')).json();
 if(p?.ok!==true||typeof p.storageKey!=='string'||typeof p.signedUpload?.signedUrl!=='string')throw Error('MEDIA_PREPARE');
 const url=new URL(p.signedUpload.signedUrl);
 if(url.origin!==new URL(t.origin).origin||url.username||url.password||!url.pathname.startsWith('/storage/v1/object/upload/sign/')||!url.searchParams.has('token'))throw Error('MEDIA_UPLOAD_URL');
 const form=new FormData();form.append('cacheControl','0');form.append('',file);
 const response=await(t.fetcher??fetch)(url.href,{method:'PUT',headers:{'x-upsert':'false'},body:form,credentials:'omit',redirect:'error'});
 if(!response.ok)throw Error('MEDIA_UPLOAD');
 const result=await(await request(t,{action:'galleryFinalize',storageKey:p.storageKey},'community-media')).json();
 if(result?.ok!==true||!id.test(result.data?.mediaId??''))throw Error('MEDIA_FINALIZE');
 return result.data.mediaId as string;
}
