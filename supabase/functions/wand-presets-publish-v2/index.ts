import {withSupabase} from 'npm:@supabase/server';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {resolveRuntimeWepPresetArtifactBucket} from '../wand-presets-public-v2/bucket.ts';
import {inspectPublicPreset,verifyPublicPreset,type PublicPresetReceipt} from '../../../src/lib/presets/preset-publication.ts';
import {createPresetShareCatalog} from '../../../src/lib/presets/preset-public.ts';
import {readPresetText,PRESET_MAX_BYTES} from '../../../src/lib/presets/preset-file.ts';
import index from '../../../static/ddv/world/steam-1.26.2/index.json' with {type:'json'};
import rooms from '../../../static/ddv/world/steam-1.26.2/room-terrain.json' with {type:'json'};
import support from '../../../static/ddv/world/steam-1.26.2/support-terrain.json' with {type:'json'};
const catalog=createPresetShareCatalog(index,rooms,support);
const BUCKET=resolveRuntimeWepPresetArtifactBucket(),MAX=PRESET_MAX_BYTES;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const mime=(v:unknown)=>v==='application/json'||v==='application/gzip';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{...corsHeaders,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const hex=(a:ArrayBuffer)=>[...new Uint8Array(a)].map(n=>n.toString(16).padStart(2,'0')).join('');
async function body(req:Request){
 if(!req.body)throw Error('BODY');
 const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32000){await reader.cancel();throw Error('SIZE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}
 const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('BODY');return v;
}
const allowedKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
async function publishedKey(accountId:string,requestId:string){
 const h=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([accountId,requestId])))).slice(0,32);
 return 'published/'+accountId+'/'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-')+'.wandpreset';
}
async function getBlob(ctx:any,key:string):Promise<Blob|null>{
 const {data,error}=await ctx.supabaseAdmin.storage.from(BUCKET).download(key);
 if(error||!data)return null;
 if(data.size<1||data.size>MAX)throw Error('PRESET_SIZE');return data;
}
const handler=withSupabase({auth:'user'},async(req,ctx)=>{
 if(req.method!=='POST')return reply({error:'METHOD'},405);
 const subject=ctx.userClaims?.id,issuedAt=Number(ctx.jwtClaims?.iat??0);
 if(!validId(subject)||!Number.isSafeInteger(issuedAt)||issuedAt<1)return reply({error:'SESSION'},401);
 const {data:authorization,error:authError}=await ctx.supabaseAdmin.rpc('community_authorize_session',{p_auth_subject:subject,p_issued_at_epoch:issuedAt,p_max_age_seconds:null});
 const accountId=authorization?.accountId;
 if(authError||!validId(accountId))return reply({error:'SESSION_REVOKED_OR_INVALID'},401);
 let v:any;try{v=await body(req);}catch{return reply({error:'INVALID_REQUEST'},400);}
 const rate=async(bucket:string)=>{
  const {data,error}=await ctx.supabaseAdmin.rpc('community_consume_action_rate_limit',{p_auth_subject:subject,p_bucket:bucket});
  return !error&&data?.allowed===true;
 };
 if(v.action==='author-context'){
  if(!allowedKeys(v,['action']))return reply({error:'INVALID_REQUEST'},400);
  const [profiles,media,works]=await Promise.all([
   ctx.supabaseAdmin.from('creator_profiles').select('creator_profile_id,display_name,handle').eq('owner_account_id',accountId).eq('profile_visibility','public').eq('moderation_state','clear').limit(50),
   ctx.supabaseAdmin.from('media_assets').select('media_id,mime_type,width,height,created_at').eq('owner_account_id',accountId).eq('processing_state','ready').eq('moderation_state','clear').is('purged_at',null).in('mime_type',['image/jpeg','image/png','image/webp']).order('created_at',{ascending:false}).limit(100),
   ctx.supabaseAdmin.from('preset_artifacts').select('preset_artifact_id,preset_type,community_work_id,creator_profile_id,community_works!preset_artifacts_community_work_id_fkey(lifecycle_state,visibility,current_published_revision_id)').eq('owner_account_id',accountId).not('associated_gallery_work_id','is',null).order('updated_at',{ascending:false}).limit(100)
  ]);
  if(profiles.error||media.error||works.error)return reply({error:'AUTHOR_CONTEXT_UNAVAILABLE'},503);
  // Do not return account ID or media storage locations.
  const candidates=(works.data??[]).filter((v:any)=>v.community_works&&['published','unpublished'].includes(v.community_works.lifecycle_state)&&validId(v.community_works.current_published_revision_id));
  const revisions=candidates.map((v:any)=>v.community_works.current_published_revision_id);
  let result:any[]=[];
  if(revisions.length){
   const {data:rows,error}=await ctx.supabaseAdmin.from('preset_revision_publications').select('work_revision_id,preset_revisions!inner(preset_artifact_id,metadata,artifact_blobs!inner(schema_version)),community_work_revisions!inner(shared_metadata)').in('work_revision_id',revisions);
   if(error)return reply({error:'AUTHOR_CONTEXT_UNAVAILABLE'},503);
   result=candidates.flatMap((v:any)=>{
    const row=(rows??[]).find((x:any)=>x.work_revision_id===v.community_works.current_published_revision_id);
    if(!row)return [];
    const p=(row as any).preset_revisions,w=(row as any).community_work_revisions;
    if(p?.artifact_blobs?.schema_version!==2||p.preset_artifact_id!==v.preset_artifact_id||typeof w?.shared_metadata?.title!=='string')return [];
    return [{artifactId:v.preset_artifact_id,creatorProfileId:v.creator_profile_id,kind:p.metadata?.kind,title:w.shared_metadata.title,description:w.shared_metadata.description??'',state:v.community_works.lifecycle_state}];
   });
  }
  return reply({contract:'wand.preset-author-context@2',profiles:profiles.data,media:media.data,works:result});
 }
 if(v.action==='prepare'){
  if(!allowedKeys(v,['action','byteSize','contentType'])||!Number.isSafeInteger(v.byteSize)||v.byteSize<1||v.byteSize>MAX||!mime(v.contentType))return reply({error:'INVALID_SIZE'},400);
  if(!await rate('preset_artifact_prepare'))return reply({error:'RATE_LIMIT'},429);
  const key='staging/'+accountId+'/'+crypto.randomUUID()+'.wandpreset';
  const {data,error}=await ctx.supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(key);
  if(error||!data)return reply({error:'UPLOAD_PREPARE_FAILED'},503);
  return reply({contract:'wand.preset-upload@2',storageKey:key,contentType:v.contentType,signedUpload:data});
 }
 if(v.action==='publish'){
  const keys=['action','storageKey','creatorProfileId','title','description','mediaIds','idempotencyKey','presetArtifactId','ownWorkConfirmed'];
  if(!allowedKeys(v,keys)||v.ownWorkConfirmed!==true||!validId(v.creatorProfileId)||typeof v.title!=='string'||!v.title.trim()||v.title.length>240||v.description!=null&&(typeof v.description!=='string'||v.description.length>20000)||!validId(v.idempotencyKey)||v.presetArtifactId!=null&&!validId(v.presetArtifactId)||!Array.isArray(v.mediaIds)||v.mediaIds.length<1||v.mediaIds.length>10||v.mediaIds.some((m:unknown)=>!validId(m))||new Set(v.mediaIds).size!==v.mediaIds.length||typeof v.storageKey!=='string'||!v.storageKey.startsWith('staging/'+accountId+'/')||!UUID.test(v.storageKey.slice(('staging/'+accountId+'/').length,-'.wandpreset'.length))||!v.storageKey.endsWith('.wandpreset'))return reply({error:'INVALID_PUBLICATION'},400);
  if(!await rate('gallery_write'))return reply({error:'RATE_LIMIT'},429);
  const finalKey=await publishedKey(accountId,v.idempotencyKey);
  let prepared:{file:Blob;receipt:PublicPresetReceipt};
  try{
   const staging=await getBlob(ctx,v.storageKey);
   if(!staging)return reply({error:'UPLOAD_NOT_FOUND'},404);
   prepared={file:staging,receipt:await inspectPublicPreset(staging,catalog)};
   const existing=await getBlob(ctx,finalKey);
   if(existing){
    await verifyPublicPreset(existing,prepared.receipt,catalog);
   }else{
    const {error}=await ctx.supabaseAdmin.storage.from(BUCKET).upload(finalKey,prepared.file,{contentType:prepared.receipt.contentType,upsert:false,cacheControl:'0'});
    if(error){const other=await getBlob(ctx,finalKey);if(!other)throw Error('UPLOAD');await verifyPublicPreset(other,prepared.receipt,catalog);}
   }
  }catch{return reply({error:'PRESET_VALIDATION_OR_PROMOTION_FAILED'},400);}
  const p=prepared.receipt;
  const {data,error}=await ctx.supabaseAdmin.rpc('community_publish_wand_preset_v2',{
   p_auth_subject:subject,p_preset_type:p.kind==='island'?'floating_island':p.kind,p_existing_preset_artifact_id:v.presetArtifactId??null,
   p_creator_profile_id:v.creatorProfileId,p_title:v.title.trim(),p_description:v.description??null,p_artifact_storage_key:finalKey,
   p_schema_version:p.schemaVersion,p_content_type:p.contentType,p_byte_size:p.byteSize,p_checksum_sha256:p.checksumSha256,
   p_metadata:p,p_media_ids:v.mediaIds,p_idempotency_key:v.idempotencyKey
  });
  // Retain staging on failure. Do not delete finalKey on ambiguous failure:
  // a concurrent/idempotent request may already have registered the blob.
  if(error||!data)return reply({error:'PRESET_PUBLICATION_FAILED'},409);
  // Keep the staging bytes for retry recovery until the established
  // retention sweep; no client-issued delete can touch the published copy.
  return reply({contract:'wand.preset-published@2',publication:data,receipt:p});
 }
 if(v.action==='unpublish'||v.action==='delete'){
  if(!allowedKeys(v,['action','presetArtifactId','idempotencyKey'])||!validId(v.presetArtifactId)||!validId(v.idempotencyKey))return reply({error:'INVALID_LIFECYCLE'},400);
  if(!await rate('gallery_write'))return reply({error:'RATE_LIMIT'},429);
  const rpc=v.action==='unpublish'?'community_unpublish_wand_preset_v2':'community_delete_wand_preset_v2';
  const {data,error}=await ctx.supabaseAdmin.rpc(rpc,{p_auth_subject:subject,p_preset_artifact_id:v.presetArtifactId,p_idempotency_key:v.idempotencyKey});
  return error||!data?reply({error:'PRESET_LIFECYCLE_FAILED'},409):reply({contract:'wand.preset-lifecycle@2',publication:data});
 }
 return reply({error:'INVALID_ACTION'},400);
});
export default{fetch(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return handler(req);}};
