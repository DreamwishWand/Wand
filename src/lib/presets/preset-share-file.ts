import {createPresetShareCatalog,validateShareablePreset} from './preset-public.ts';
import {PUBLIC_TERRAIN_ROOT} from '../world/public-terrain-projection.ts';
import {readPresetText,compactPresetFile} from './preset-file.ts';
let cached:{base:string;value:Promise<ReturnType<typeof createPresetShareCatalog>>}|null=null;
export function loadShareCatalog(base:string,fetcher:typeof fetch=fetch){
 if(cached?.base===base)return cached.value;
 const value=Promise.all(['index.json','room-terrain.json','support-terrain.json'].map(async name=>{
  const r=await fetcher(base+'/'+PUBLIC_TERRAIN_ROOT+'/'+name,{credentials:'same-origin'});if(!r.ok||r.redirected)throw Error('PRESET_CATALOG');return r.json();
 })).then(([index,rooms,support])=>createPresetShareCatalog(index,rooms,support));
 cached={base,value};void value.catch(()=>{if(cached?.value===value)cached=null;});return value;
}
export async function createShareFile(file:File,name:string,base:string){
 const raw=await readPresetText(file),catalog=await loadShareCatalog(base);
 return compactPresetFile(validateShareablePreset(raw,catalog),name);
}
