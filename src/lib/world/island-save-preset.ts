import {islandPresetGrids,serializeIslandDesign,parseIslandDesign} from './island-design-preset.ts';
import {parseWholeArea,serializeWholeArea} from './whole-area-preset.ts';
import {biomeFurnitureSnapshot,biomeFurnitureReplacement,BIOME_CHANGE_LIMIT,type BiomeFurniturePlan} from './biome-furniture-preset.ts';
import {bindFloatingIslandGrid,type MainlandGrid} from './mainland-world-coordinates.ts';
import {projectMainlandSaved,type MainlandSavedObject} from './mainland-saved-objects.ts';
import type {SavedShapeMap} from './saved-shape-map.ts';
import type {TerrainScopeReceipt,TerrainRaster} from './terrain-binding.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import type {DesignPlacement,DesignTimeline,DesignItemGeometry} from './design-layout.ts';
export function islandSaveGrids(grid:PublicTerrainGridRef|null,all:readonly PublicTerrainGridRef[]):MainlandGrid[]{
 return islandPresetGrids(grid,all).map(bindFloatingIslandGrid).filter((g):g is MainlandGrid=>!!g);
}
export function islandSaveSnapshot(grids:readonly MainlandGrid[],sessions:readonly TerrainScopeReceipt[],maps:ReadonlyMap<string,SavedShapeMap>){
 if(!grids.length||grids.some(g=>g.layoutId!==grids[0].layoutId))return null;
 const layouts:Record<string,DesignTimeline>={},objects=new Map<string,readonly MainlandSavedObject[]>(),summaries:{key:string;editable:number;preserved:number}[]=[];
 const ordinals=new Set<number>();
 for(const g of grids){
  const receipts=sessions.filter(s=>s.receipt.viewKey===g.key),s=receipts[0];
  if(receipts.length!==1||!s.completeGridOrdinal||ordinals.has(s.completeGridOrdinal)||s.receipt.dataSampled||s.receipt.rowsWithoutCoordinates||s.verifiedGridOrdinals.length!==1||s.verifiedGridOrdinals[0]!==s.completeGridOrdinal)return null;
  ordinals.add(s.completeGridOrdinal);
  // Separate native coordinate planes. Never test collision across grids.
  const projected=projectMainlandSaved([g],sessions,maps,[]);
  const snapshot=biomeFurnitureSnapshot(g,projected.objects,projected.omitted,true);if(!snapshot)return null;
  objects.set(g.key,projected.objects);
  layouts[g.key]={snapshots:[snapshot.placements],cursor:0,nextId:snapshot.placements.length+1};
  summaries.push({key:g.key,editable:snapshot.editable.length,preserved:snapshot.protectedObjects.length});
 }
 try{
  const text=grids.length===1?serializeWholeArea(layouts[grids[0].key],grids[0],'floating-island'):serializeIslandDesign(grids,layouts);
  return {text,objects,summaries};
 }catch{return null;}
}
export function parseIslandSavePreset(text:string,grids:readonly MainlandGrid[]):Map<string,DesignPlacement[]>{
 if(grids.length===1&&JSON.parse(text)?.schema==='wand.preset.whole-area-design@1')return new Map([[grids[0].key,parseWholeArea(text,grids[0],'floating-island')]]);
 return parseIslandDesign(text,grids);
}
export function islandSaveReplacement(grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,snapshot:NonNullable<ReturnType<typeof islandSaveSnapshot>>,incoming:ReadonlyMap<string,readonly DesignPlacement[]>,defs:ReadonlyMap<string,ReadonlyMap<number,DesignItemGeometry>>,stock:ReadonlyMap<number,number>){
 const plan:BiomeFurniturePlan[]=[],reviews=new Map<string,NonNullable<ReturnType<typeof biomeFurnitureReplacement>>>(),balance=new Map(stock),required=new Map<number,number>();
 let changes=0;
 for(const g of grids){
  const objects=snapshot.objects.get(g.key),placements=incoming.get(g.key),geometry=defs.get(g.key);
  if(!objects||!placements||!geometry||!rasters.has(g.key))return null;
  const review=biomeFurnitureReplacement(g,[g],rasters,objects,0,placements,geometry,stock,true);if(!review)return null;
  reviews.set(g.key,review);plan.push(review.plan);
  changes+=review.plan.remove.length+review.plan.add.length;
  if(changes>BIOME_CHANGE_LIMIT)return null;
  for(const row of review.plan.remove){const id=Number(row.itemId);if(!balance.has(id))return null;balance.set(id,balance.get(id)!+1);}
  for(const row of review.plan.add){const id=Number(row.itemId);required.set(id,(required.get(id)??0)+1);}
 }
 const missing=[...required].filter(([id,n])=>(balance.get(id)??0)<n).map(([itemId,n])=>({itemId,quantity:n-(balance.get(itemId)??0)}));
 return {plan,reviews,missing,changed:changes>0};
}
export const islandSaveWords={
 ja:['浮島家具Preset','全体の家具配置を保存','浮島家具Presetを開く','浮島全体の通常家具のみを置換します。道・フェンス・支持家具などは保持します。','全Gridが解放済みで、セーブ構造と配置形状を確認できる必要があります。'],
 en:['Island furniture preset','Save island furniture layout','Open island furniture preset','Replace ordinary furniture across this island only. Roads, fences and support furniture remain.','Every grid must exist and its Save structure and geometry must be verified.'],
 fr:['Preset de meubles de l’île','Enregistrer tous les meubles','Ouvrir le preset de meubles','Seuls les meubles ordinaires de l’île sont remplacés. Chemins, clôtures et supports restent.','Toutes les grilles et leurs géométries doivent être vérifiées.'],
 it:['Preset mobili isola','Salva tutti i mobili','Apri preset mobili isola','Sostituisce solo mobili ordinari dell’isola. Sentieri, recinzioni e supporti restano.','Tutte le griglie e le geometrie devono essere verificate.'],
 de:['Insel-Möbelvorlage','Alle Möbel speichern','Insel-Möbelvorlage öffnen','Nur normale Möbel der Insel werden ersetzt. Wege, Zäune und Auflagen bleiben.','Alle Raster und Geometrien müssen geprüft sein.'],
 'es-ES':['Preset de muebles de la isla','Guardar todos los muebles','Abrir preset de muebles','Solo se sustituyen muebles normales de la isla. Caminos, vallas y soportes se conservan.','Todas las cuadrículas y geometrías deben estar verificadas.'],
 'zh-CN':['浮岛家具预设','保存全岛家具布局','打开浮岛家具预设','仅替换全岛普通家具，道路、围栏及支撑家具保持不变。','必须确认所有网格存在且存档结构及形状可验证。'],
 'pt-BR':['Preset de móveis da ilha','Salvar todos os móveis','Abrir preset de móveis','Somente móveis comuns da ilha são substituídos. Caminhos, cercas e suportes permanecem.','Todas as grades e geometrias devem ser verificadas.']
} as const;
