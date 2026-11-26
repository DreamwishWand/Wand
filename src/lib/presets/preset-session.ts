import {compactPresetFile,readPresetText} from './preset-file.ts';
import {writable,get} from 'svelte/store';
import {presetHeader,validPresetName,PRESET_FILE_LIMIT,PRESET_SESSION_COUNT,PRESET_SESSION_LIMIT,type SessionPreset,type PublicPresetSource} from './preset-session-format.ts';
const session=writable<readonly SessionPreset[]>([]);
export const sessionPresets={subscribe:session.subscribe};
let serial=0;
const remembered=new WeakMap<File,number>();
/** Explicitly opened/generated files only, in memory. No persistence, upload,
 * account binding, Save file access or native slot mutation. */
export async function rememberPreset(file:File,knownRaw?:string,publicSource?:PublicPresetSource):Promise<SessionPreset>{
 if(!file.size||file.size>PRESET_FILE_LIMIT)throw Error('PRESET_SIZE');
 const existing=get(session).find(e=>e.file===file||e.id===remembered.get(file));if(existing)return existing;
 const raw=knownRaw??await readPresetText(file,PRESET_FILE_LIMIT),header=presetHeader(raw);
 const decoded=new File([raw],file.name.replace(/(?:\.wandpreset|\.json\.gz|\.gz)$/i,'.json'),{type:'application/json'});
 if(decoded.size>PRESET_FILE_LIMIT)throw Error('PRESET_SIZE');
 const name=file.name.replace(/(?:\.wandpreset|\.json\.gz|\.json|\.gz)$/i,'').slice(0,160);
 const current=get(session),again=current.find(e=>e.file===file||e.id===remembered.get(file));if(again)return again;
 if(current.length>=PRESET_SESSION_COUNT||current.reduce((n,e)=>n+e.file.size,0)+decoded.size>PRESET_SESSION_LIMIT)throw Error('PRESET_SESSION_LIMIT');
 const entry={...header,id:++serial,name:validPresetName(name)?name:'Preset',file:decoded,...(publicSource?{publicSource}:{})};remembered.set(file,entry.id);remembered.set(decoded,entry.id);session.set([...current,entry]);return entry;
}
export function renameSessionPreset(id:number,name:string){if(!validPresetName(name))return false;session.update(rows=>rows.map(e=>e.id===id?{...e,name:name.trim()}:e));return true;}
export function removeSessionPreset(id:number){session.update(rows=>rows.filter(e=>e.id!==id));}
export async function downloadPresetFile(file:File,name=file.name){
 const packed=await compactPresetFile(await readPresetText(file),name);
 const url=URL.createObjectURL(packed),a=document.createElement('a');a.href=url;a.download=packed.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function savePresetFile(raw:string,name:string){
 const file=new File([raw],name,{type:'application/json'});
 void downloadPresetFile(file).catch(()=>{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}); // Export works even if session capacity is exhausted.
 void rememberPreset(file,raw).catch(()=>{});
}
