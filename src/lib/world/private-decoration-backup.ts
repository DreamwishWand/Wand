import {compactPresetFile,readPresetText,PRESET_MAX_BYTES} from '../presets/preset-file.ts';
const SCHEMA='wand.private.decoration@1';
export const privateDecorationWords={
 ja:['収納内容を含めて保存','非公開バックアップを開く','個人用ファイル。共有プリセットに登録されません。'],
 en:['Save with storage contents','Open private backup','Private file, not registered as a shared preset.'],
 fr:['Enregistrer avec le contenu','Ouvrir une sauvegarde privée','Fichier privé, sans partage.'],
 it:['Salva con il contenuto','Apri backup privato','File privato, non condiviso.'],
 de:['Mit Lagerinhalt sichern','Private Sicherung öffnen','Private Datei, keine Freigabe.'],
 'es-ES':['Guardar con contenido','Abrir copia privada','Archivo privado, sin compartir.'],
 'zh-CN':['包含储物内容保存','打开私人备份','私人文件，不注册为共享预设。'],
 'pt-BR':['Salvar com conteúdo','Abrir backup privado','Arquivo privado, sem compartilhamento.']
} as const;
export async function readDecorationFile(file:File,limit:number){
 const raw=await readPresetText(file,PRESET_MAX_BYTES),v=JSON.parse(raw);
 if(v?.schema!==SCHEMA){if(raw.length>limit)throw Error('decoration limit');return {text:raw,storage:null};}
 if(Object.keys(v).length!==3||!v.decoration||typeof v.decoration!=='object'||!v.storage||v.storage.schema!=='wand.private.storage-contents@2'||!Array.isArray(v.storage.rows)||v.storage.skipped!==0)throw Error('private backup');
 const text=JSON.stringify(v.decoration),storage=JSON.stringify(v.storage);
 if(text.length>limit||storage.length>4*1024*1024)throw Error('private backup limit');
 return {text,storage};
}
export async function savePrivateDecoration(file:File,scope:string,decoration:string,name:string,valid:()=>boolean){
 const storage=await new Promise<string>((resolve,reject)=>{
  const w=new Worker(new URL('./private-storage-backup.worker.ts',import.meta.url),{type:'module'});
  const done=(d:any)=>{clearTimeout(timer);w.terminate();if(d?.kind==='backup'&&typeof d.raw==='string')resolve(d.raw);else reject(Error('storage capture'));};
  const timer=setTimeout(()=>done(null),120000);
  w.onmessage=e=>done(e.data);w.onerror=()=>done(null);w.onmessageerror=()=>done(null);w.postMessage({command:'backup',file,scope});
 });
 if(!valid())throw Error('stale source');
 const contents=JSON.parse(storage);
 // Never produce a combined backup claiming completeness if contents were excluded.
 if(contents.skipped!==0)throw Error('unsupported storage');
 const packed=await compactPresetFile(JSON.stringify({schema:SCHEMA,decoration:JSON.parse(decoration),storage:contents}),name);
 if(!valid())throw Error('stale source');
 const url=URL.createObjectURL(packed),a=document.createElement('a');a.href=url;a.download=packed.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function outdoorPrivateScope(grids:readonly {layoutId:string;gridDataPath:string;factor:number;sizeX:number;sizeY:number}[]){
 return JSON.stringify({kind:'outdoor',destinations:grids.map(({layoutId,gridDataPath,factor,sizeX,sizeY})=>({layoutId,gridDataPath,factor,sizeX,sizeY}))});
}

/** Unpublished Save used only to calculate the actual decoration delta.
 * No checkpoint, download URL or preset history is created here. */
export async function stagePrivateDecoration(file:File,storage:string,scope:string,valid:()=>boolean):Promise<{file:File;storage:string}>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./private-storage-backup.worker.ts',import.meta.url),{type:'module'});
  let finished=false;
  const done=(d:any)=>{
   if(finished){d?.bytes?.fill(0);return;}finished=true;clearTimeout(timer);worker.terminate();
   try{
    if(!valid()||d?.kind!=='staged-decoration'||typeof d.storage!=='string')throw Error('private stage');
    const parsed=JSON.parse(d.storage);if(parsed.schema!=='wand.private.storage-contents@2'||parsed.skipped!==0||!Array.isArray(parsed.rows)||d.storage.length>4*1024*1024)throw Error('private stage receipt');
    if(d.bytes===undefined){resolve({file,storage:d.storage});return;}
    const bytes=d.bytes,receipt=d.receipt;
    if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>32*1024*1024||receipt?.contract!=='wand.db05.experimental-copy@1'||receipt.copyBytes!==bytes.byteLength||receipt.originalUnchanged!==true||receipt.independentReopenVerified!==true||receipt.experimentalCopyOnly!==true||receipt.productionWriterAuthorized!==false)throw Error('private stage copy');
    resolve({file:new File([bytes.slice().buffer as ArrayBuffer],file.name,{type:file.type}),storage:d.storage});
   }catch(e){reject(e);}finally{d?.bytes?.fill(0);}
  };
  const timer=setTimeout(()=>done(null),120000);
  worker.onmessage=e=>done(e.data);worker.onerror=()=>done(null);worker.onmessageerror=()=>done(null);
  try{worker.postMessage({command:'stage-decoration',file,backup:new File([storage],'private-storage.json',{type:'application/json'}),scope,allowExperimentalCopy:true});}catch{done(null);}
 });
}

/** Re-resolve native ordinals after a private storage relocation. Geometry is
 * fetched by the existing map worker; never reuse pre-stage ordinal receipts. */
export function projectPrivateDecorationTerrain(file:File,grids:readonly {key:string;layoutId:string;gridDataPath:string;gridIdNative:number;sizeX:number;sizeY:number;factor:number}[],valid:()=>boolean):Promise<import('./terrain-binding.ts').TerrainScopeReceipt[]>{
 return new Promise((resolve,reject)=>{
  const own=new Worker(new URL('./world-terrain-session.worker.ts',import.meta.url),{type:'module'});
  let ended=false;
  const done=(d:any)=>{if(ended)return;ended=true;clearTimeout(timer);own.terminate();if(valid()&&d?.kind==='terrain-session'&&d.requestId===1&&Array.isArray(d.results)&&d.results.length===grids.length)resolve(d.results);else reject(Error('staged terrain'));};
  const timer=setTimeout(()=>done(null),120000);
  own.onmessage=e=>done(e.data);own.onerror=()=>done(null);own.onmessageerror=()=>done(null);
  try{own.postMessage({command:'terrain-session',requestId:1,file,filename:file.name,scopes:grids.map(g=>({viewKey:g.key,nativeGridId:g.gridIdNative,sourceRefs:[{layoutId:g.layoutId,gridDataPath:g.gridDataPath,nativeGridId:g.gridIdNative,nativeSizeX:g.sizeX,nativeSizeY:g.sizeY,tessellationFactor:g.factor}]}))});}catch{done(null);}
 });
}
