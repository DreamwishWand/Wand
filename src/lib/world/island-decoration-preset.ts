import type {LandscapePose} from './landscape-decoration-preset.ts';
import {worldDecorationScope} from './island-save-preset.ts';
import {mainlandTerrainHits} from './mainland-world-coordinates.ts';
import {stockFootprintFeedback} from './save-furniture-placement.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {captureBiomeDecoration,parseBiomeDecoration,reviewBiomeDecoration} from './biome-decoration-preset.ts';
import {BIOME_CHANGE_LIMIT,type SupportAreaTrees} from './biome-furniture-preset.ts';
import {parseReplayStep} from './checkpoint-journal.ts';
import type {islandSaveSnapshot} from './island-save-preset.ts';
import type {NetworkPose} from './biome-network-preset.ts';
import type {MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {DesignItemGeometry} from './design-layout.ts';
type Snapshot=NonNullable<ReturnType<typeof islandSaveSnapshot>>;
type Incoming=ReturnType<typeof parseBiomeDecoration>;
type Review=NonNullable<ReturnType<typeof reviewBiomeDecoration>>;
export const ISLAND_DECORATION_FILE_LIMIT=3_000_000;
export const WORLD_DECORATION_FILE_LIMIT=12_000_000;
export function captureIslandDecoration(grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,supports?:SupportAreaTrees,world=false,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>){
 const scope=world?worldDecorationScope(grids):grids[0]?.layoutId;
 if(!grids.length||!scope||!world&&grids.some(g=>g.layoutId!==scope)||networks.size!==grids.length||snapshot.objects.size!==grids.length)return null;
 const areas:unknown[]=[],summaries:{key:string;furnitureCount:number;networkCount:number;landscapeCount:number;protectedCount:number}[]=[];
 for(const g of grids){
  const objects=snapshot.objects.get(g.key),rows=networks.get(g.key);
  if(!objects||!rows)return null;
  const capture=captureBiomeDecoration(g,objects,0,rows,!world,supports,world,landscapes?.get(g.key));if(!capture)return null;
  areas.push(JSON.parse(capture.text));summaries.push({key:g.key,furnitureCount:capture.furnitureCount,networkCount:capture.networkCount,landscapeCount:capture.landscapeCount,protectedCount:capture.protectedCount});
 }
 try{
  const text=JSON.stringify({schema:world?'wand.preset.world-decoration@1':'wand.preset.floating-island-decoration@1',gameVersion:'1.26.2',...(world?{scope}:{layoutId:scope}),areas});
  parseIslandDecoration(text,grids,world);return {text,summaries};
 }catch{return null;}
}
export function parseIslandDecoration(text:string,grids:readonly MainlandGrid[],world=false):Map<string,Incoming>{
 const scope=world?worldDecorationScope(grids):grids[0]?.layoutId;
 if(!grids.length||!scope||text.length>(world?WORLD_DECORATION_FILE_LIMIT:ISLAND_DECORATION_FILE_LIMIT))throw Error('ISLAND_DECORATION_LIMIT');
 const v=JSON.parse(text);
 if(!v||Object.keys(v).length!==4||v.schema!==(world?'wand.preset.world-decoration@1':'wand.preset.floating-island-decoration@1')||v.gameVersion!=='1.26.2'||(world?v.scope:v.layoutId)!==scope||!Array.isArray(v.areas)||v.areas.length!==grids.length)throw Error('ISLAND_DECORATION_CONTEXT');
 const out=new Map<string,Incoming>();
 for(const area of v.areas){
  const identity=area?.furniture?.design?.grid;
  const g=grids.find(g=>(world||g.layoutId===v.layoutId)&&g.key===identity?.key);
  if(!g||out.has(g.key))throw Error('ISLAND_DECORATION_GRID');
  out.set(g.key,parseBiomeDecoration(JSON.stringify(area),g,!world,world));
 }
 return out;
}
export function reviewIslandDecoration(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,snapshot:Snapshot,before:ReadonlyMap<string,readonly NetworkPose[]>,incoming:ReadonlyMap<string,Incoming>,defs:ReadonlyMap<string,ReadonlyMap<number,DesignItemGeometry>>,stock:ReadonlyMap<number,number>,supports?:SupportAreaTrees,world=false,landscapes?:ReadonlyMap<string,readonly LandscapePose[]>,free=false){
 if(!grids.length||world&&!worldDecorationScope(grids)||incoming.size!==grids.length||before.size!==grids.length)return null;
 const plan:Review['plan'][]=[],reviews=new Map<string,Review>(),balance=new Map(stock),required=new Map<number,number>();
 let changes=0,changed=false;
 for(const g of grids){
  const objects=snapshot.objects.get(g.key),old=before.get(g.key),next=incoming.get(g.key),geometry=defs.get(g.key);
  if(!objects||!old||!next||!geometry)return null;
  if(world&&(!supports||!next.supports))return null;
  const q=reviewBiomeDecoration(g,world?grids:[g],rasters,objects,0,old,next,geometry,stock,!world,supports,world,landscapes?.get(g.key),free);if(!q)return null;
  plan.push(q.plan);reviews.set(g.key,q);changed||=q.changed;
  changes+=q.furniture.changeCount;
  if(changes>BIOME_CHANGE_LIMIT)return null;
  for(const [id,n] of q.furniture.returned){if(!balance.has(id))return null;balance.set(id,balance.get(id)!+n);}
  for(const [id,n] of q.furniture.required)required.set(id,(required.get(id)??0)+n);
 }
 if(world){
  const removed=new Set([...reviews.values()].flatMap(q=>q.removed.map(p=>p.object.localOrdinal))),ghosts=[...reviews.values()].flatMap(q=>q.ghosts),final=[...snapshot.objects.values()].flat().filter(p=>!removed.has(p.object.localOrdinal));
  const freeGhosts=new Set([...reviews.values()].flatMap(q=>q.furniture.ghosts.filter((_,i)=>q.furniture.plan.add[i].freePlacement)));
  for(const [i,g] of ghosts.entries()){
   if(freeGhosts.has(g))continue;
   if(g.plan.action!=='place')return null;
   for(const run of g.shape.runs)for(let x=0;x<run.width;x++){const hits=mainlandTerrainHits(grids,rasters,g.x+(run.x+x+.5)/g.factor,g.y-(run.y+.5)/g.factor);if(hits.length!==1||hits[0].key!==g.area)return null;}
   if(Math.floor(Number(g.plan.itemId)/100000)===401)continue;
   const others:MainlandSavedObject[]=final.filter(p=>p.area!==g.area);
   for(const [j,h] of ghosts.entries())if(i!==j&&h.area!==g.area&&h.plan.action==='place'&&Math.floor(Number(h.plan.itemId)/100000)!==401)others.push({area:h.area,x:h.x,y:h.y,factor:h.factor,shape:h.shape,object:{localOrdinal:1_000_000+j,localGridOrdinal:1,itemId:h.plan.itemId,x:h.plan.x,y:h.plan.y,orientation:h.plan.orientation,orientationCode:null,shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}});
   const feedback=stockFootprintFeedback(g,others);if(feedback.overlaps||feedback.unknown)return null;
  }
 }
 const missing=[...required].filter(([id,n])=>(balance.get(id)??0)<n).map(([itemId,n])=>({itemId,quantity:n-(balance.get(itemId)??0)}));
 try{parseReplayStep({command:'island-decoration-export',plan});}catch{return null;}
 return {plan,reviews,missing,changed};
}
export const islandDecorationWords={
 ja:['浮島装飾Preset','道・フェンスも含める','浮島の装飾を一括保存','浮島装飾Presetを開く','全Gridの通常家具・道・フェンスを一括置換します。支持家具などは保持します。'],
 en:['Island decoration preset','Include roads and fences','Save island decoration','Open island decoration preset','Replace ordinary furniture, roads and fences on every grid together. Support furniture remains.'],
 fr:['Preset de décoration de l’île','Inclure chemins et clôtures','Enregistrer la décoration','Ouvrir le preset','Remplace meubles ordinaires, chemins et clôtures de toutes les grilles. Les supports restent.'],
 it:['Preset decorazione isola','Includi sentieri e recinzioni','Salva decorazione','Apri preset decorazione','Sostituisce mobili ordinari, sentieri e recinzioni di tutte le griglie. I supporti restano.'],
 de:['Insel-Dekorationsvorlage','Wege und Zäune einschließen','Inseldesign speichern','Dekorationsvorlage öffnen','Ersetzt normale Möbel, Wege und Zäune aller Raster. Auflagen bleiben erhalten.'],
 'es-ES':['Preset de decoración de la isla','Incluir caminos y vallas','Guardar decoración','Abrir preset de decoración','Sustituye muebles normales, caminos y vallas de todas las cuadrículas. Conserva soportes.'],
 'zh-CN':['浮岛装饰预设','包含道路和围栏','保存全岛装饰','打开浮岛装饰预设','一并替换全部网格的普通家具、道路和围栏，保留支撑家具。'],
 'pt-BR':['Preset de decoração da ilha','Incluir caminhos e cercas','Salvar decoração da ilha','Abrir preset de decoração','Substitui móveis comuns, caminhos e cercas de todas as grades. Suportes permanecem.']
} as const;

export const worldDecorationWords={
 ja:['ワールド装飾バックアップ','ワールド全体を保存','ワールドをリストア','確認済みの家具・支持面・道・フェンスを全エリアで置換。保護対象は維持します。'],
 en:['World decoration backup','Save whole world','Restore world','Restore verified furniture, supports, roads and fences. Protected objects remain.'],
 fr:['Sauvegarde du monde','Enregistrer le monde','Restaurer le monde','Restaure les meubles, supports, chemins et clôtures vérifiés.'],
 it:['Backup del mondo','Salva mondo','Ripristina mondo','Ripristina mobili, supporti, sentieri e recinzioni verificati.'],
 de:['Weltsicherung','Welt speichern','Welt wiederherstellen','Geprüfte Möbel, Auflagen, Wege und Zäune wiederherstellen.'],
 'es-ES':['Copia del mundo','Guardar mundo','Restaurar mundo','Restaura muebles, soportes, caminos y vallas verificados.'],
 'zh-CN':['世界装饰备份','保存整个世界','恢复世界','恢复已验证的家具、支撑面、道路和围栏。保留受保护物品。'],
 'pt-BR':['Backup do mundo','Salvar mundo','Restaurar mundo','Restaura móveis, apoios, caminhos e cercas verificados.']
} as const;
