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
export function captureIslandDecoration(grids:readonly MainlandGrid[],snapshot:Snapshot,networks:ReadonlyMap<string,readonly NetworkPose[]>,supports?:SupportAreaTrees){
 if(!grids.length||grids.some(g=>g.layoutId!==grids[0].layoutId)||networks.size!==grids.length)return null;
 const areas:unknown[]=[],summaries:{key:string;furnitureCount:number;networkCount:number;protectedCount:number}[]=[];
 for(const g of grids){
  const objects=snapshot.objects.get(g.key),rows=networks.get(g.key);
  if(!objects||!rows)return null;
  const capture=captureBiomeDecoration(g,objects,0,rows,true,supports);if(!capture)return null;
  areas.push(JSON.parse(capture.text));summaries.push({key:g.key,furnitureCount:capture.furnitureCount,networkCount:capture.networkCount,protectedCount:capture.protectedCount});
 }
 try{
  const text=JSON.stringify({schema:'wand.preset.floating-island-decoration@1',gameVersion:'1.26.2',layoutId:grids[0].layoutId,areas});
  parseIslandDecoration(text,grids);return {text,summaries};
 }catch{return null;}
}
export function parseIslandDecoration(text:string,grids:readonly MainlandGrid[]):Map<string,Incoming>{
 if(!grids.length||text.length>ISLAND_DECORATION_FILE_LIMIT)throw Error('ISLAND_DECORATION_LIMIT');
 const v=JSON.parse(text);
 if(!v||Object.keys(v).length!==4||v.schema!=='wand.preset.floating-island-decoration@1'||v.gameVersion!=='1.26.2'||v.layoutId!==grids[0].layoutId||!Array.isArray(v.areas)||v.areas.length!==grids.length)throw Error('ISLAND_DECORATION_CONTEXT');
 const out=new Map<string,Incoming>();
 for(const area of v.areas){
  const identity=area?.furniture?.design?.grid;
  const g=grids.find(g=>g.layoutId===v.layoutId&&g.key===identity?.key);
  if(!g||out.has(g.key))throw Error('ISLAND_DECORATION_GRID');
  out.set(g.key,parseBiomeDecoration(JSON.stringify(area),g,true));
 }
 return out;
}
export function reviewIslandDecoration(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,snapshot:Snapshot,before:ReadonlyMap<string,readonly NetworkPose[]>,incoming:ReadonlyMap<string,Incoming>,defs:ReadonlyMap<string,ReadonlyMap<number,DesignItemGeometry>>,stock:ReadonlyMap<number,number>,supports?:SupportAreaTrees){
 if(!grids.length||incoming.size!==grids.length||before.size!==grids.length)return null;
 const plan:Review['plan'][]=[],reviews=new Map<string,Review>(),balance=new Map(stock),required=new Map<number,number>();
 let changes=0,changed=false;
 for(const g of grids){
  const objects=snapshot.objects.get(g.key),old=before.get(g.key),next=incoming.get(g.key),geometry=defs.get(g.key);
  if(!objects||!old||!next||!geometry)return null;
  const q=reviewBiomeDecoration(g,[g],rasters,objects,0,old,next,geometry,stock,true,supports);if(!q)return null;
  plan.push(q.plan);reviews.set(g.key,q);changed||=q.changed;
  changes+=q.furniture.changeCount;
  if(changes>BIOME_CHANGE_LIMIT)return null;
  for(const [id,n] of q.furniture.returned){if(!balance.has(id))return null;balance.set(id,balance.get(id)!+n);}
  for(const [id,n] of q.furniture.required)required.set(id,(required.get(id)??0)+n);
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
