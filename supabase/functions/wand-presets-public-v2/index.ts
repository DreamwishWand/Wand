import {withSupabase} from 'npm:@supabase/server';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {resolveRuntimeWepPresetArtifactBucket} from './bucket.ts';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds=new Set(['scene','support','region','biome','island','world','room','floor','building','design','network']);
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{...corsHeaders,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function body(req:Request){
 if(!req.body)throw Error('BODY');
 const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error('SIZE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
const publicFetch=withSupabase({auth:'none'},async(req,ctx)=>{
 if(req.method!=='POST')return reply({error:'METHOD'},405);
 let v:any;try{v=await body(req);}catch{return reply({error:'INVALID_REQUEST'},400);}
 if(!v||typeof v!=='object'||Array.isArray(v))return reply({error:'INVALID_REQUEST'},400);
 const list=v.action==='list',download=v.action==='download';
 if(!list&&!download)return reply({error:'INVALID_ACTION'},400);
 const allowed=list?['action','query','kind','limit','offset']:['action','workId','revisionId'];
 if(Object.keys(v).some(k=>!allowed.includes(k)))return reply({error:'INVALID_REQUEST'},400);
 const query=v.query??null,kind=v.kind??null,limit=v.limit??30,offset=v.offset??0;
 if(list&&(query!==null&&(typeof query!=='string'||query.length>100)||kind!==null&&!kinds.has(kind)||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000))return reply({error:'INVALID_FILTER'},400);
 if(download&&(!UUID.test(v.workId??'')||!UUID.test(v.revisionId??'')))return reply({error:'INVALID_ID'},400);
 const {data,error}=await ctx.supabaseAdmin.rpc('community_query_wand_presets_v2',{p_query:list?query:null,p_kind:list?kind:null,p_limit:list?limit:1,p_offset:list?offset:0,p_work_id:download?v.workId:null,p_revision_id:download?v.revisionId:null});
 if(error||!Array.isArray(data))return reply({error:'PRESET_QUERY_FAILED'},503);
 const safe=(row:any)=>({workId:row.workId,revisionId:row.revisionId,artifactId:row.artifactId,title:row.title,creatorProfileId:row.creatorProfileId,creatorName:row.creatorName,publishedAt:row.publishedAt,receipt:row.receipt,mediaId:row.mediaId});
 if(list)return reply({contract:'wand.public-preset-list@2',entries:data.map(safe),nextOffset:data.length===limit?offset+limit:null});
 const row=data[0];if(!row||typeof row.storageKey!=='string')return reply({error:'PRESET_UNAVAILABLE'},404);
 const bucket=resolveRuntimeWepPresetArtifactBucket();
 const signed=await ctx.supabaseAdmin.storage.from(bucket).createSignedUrl(row.storageKey,60);
 if(signed.error||!signed.data?.signedUrl)return reply({error:'PRESET_UNAVAILABLE'},404);
 return reply({contract:'wand.public-preset-download@2',entry:safe(row),url:signed.data.signedUrl,expiresIn:60});
});
export default{fetch(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return publicFetch(req);}};
