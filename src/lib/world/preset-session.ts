import {writable,get} from 'svelte/store';
import {presetHeader,validPresetName,PRESET_FILE_LIMIT,PRESET_SESSION_COUNT,PRESET_SESSION_LIMIT,type SessionPreset} from './preset-session-format.ts';
const session=writable<readonly SessionPreset[]>([]);
export const sessionPresets={subscribe:session.subscribe};
let serial=0;
/** Explicitly opened/generated files only, in memory. No persistence, upload,
 * account binding, Save file access or native slot mutation. */
export async function rememberPreset(file:File,knownRaw?:string):Promise<SessionPreset>{
 if(!file.size||file.size>PRESET_FILE_LIMIT)throw Error('PRESET_SIZE');
 const existing=get(session).find(e=>e.file===file);if(existing)return existing;
 const header=presetHeader(knownRaw??await file.text());
 const name=file.name.replace(/\.json$/i,'').slice(0,160);
 const current=get(session),again=current.find(e=>e.file===file);if(again)return again;
 if(current.length>=PRESET_SESSION_COUNT||current.reduce((n,e)=>n+e.file.size,0)+file.size>PRESET_SESSION_LIMIT)throw Error('PRESET_SESSION_LIMIT');
 const entry={...header,id:++serial,name:validPresetName(name)?name:'Preset',file};session.set([...current,entry]);return entry;
}
export function renameSessionPreset(id:number,name:string){if(!validPresetName(name))return false;session.update(rows=>rows.map(e=>e.id===id?{...e,name:name.trim()}:e));return true;}
export function removeSessionPreset(id:number){session.update(rows=>rows.filter(e=>e.id!==id));}
export function downloadPresetFile(file:File,name=file.name){
 const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function savePresetFile(raw:string,name:string){
 const file=new File([raw],name,{type:'application/json'});
 downloadPresetFile(file); // File export must work even if session capacity is exhausted.
 void rememberPreset(file,raw).catch(()=>{});
}
