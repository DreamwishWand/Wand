import {biomeFurnitureSnapshot,biomeFurnitureReplacement,type SupportAreaTrees} from './biome-furniture-preset.ts';
import {landscapeRows,reviewLandscape,landscapePoseKey,landscapeObjectPose,type LandscapePose} from './landscape-decoration-preset.ts';
import {housePoseRows} from './player-house-backup.ts';
import {parseSupportScene,supportSceneRootCounts} from './support-scene.ts';
import {parseWholeArea} from './whole-area-preset.ts';
import {serializeBiomeNetwork,parseBiomeNetwork,networkKey,reviewBiomeNetwork,type NetworkPose} from './biome-network-preset.ts';
import {CARDINAL_ORIENTATIONS,worldOrientationCode} from './saved-map-transform.ts';
import {stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {parseReplayStep} from './checkpoint-journal.ts';
import type {MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {DesignPlacement,DesignItemGeometry} from './design-layout.ts';
export const BIOME_DECORATION_FILE_LIMIT=1_500_000;
export function captureBiomeDecoration(grid:MainlandGrid,objects:readonly MainlandSavedObject[],omitted:number,networks:readonly NetworkPose[],island=false,supports?:SupportAreaTrees,world=false,landscape?:readonly LandscapePose[]){
 const furniture=biomeFurnitureSnapshot(grid,objects,omitted,island,supports,world);if(!furniture)return null;
 const existing=objects.filter(p=>p.area===grid.key&&['ground','fence'].includes(p.object.layer));
 if(existing.length!==networks.length||networks.some(p=>existing.filter(o=>Number(o.object.itemId)===p.itemId&&o.object.x===p.x&&o.object.y===p.y&&o.object.orientation===CARDINAL_ORIENTATIONS[p.orientation]).length!==1))return null;
 try{
  const text=JSON.stringify({schema:world?'wand.preset.world-grid-decoration@1':island?'wand.preset.island-grid-decoration@1':'wand.preset.biome-decoration@1',gameVersion:'1.26.2',furniture:JSON.parse(furniture.text),network:JSON.parse(serializeBiomeNetwork(grid,networks)),...(supports?{supports:furniture.supports}:{}),...(landscape!==undefined?{landscape:landscapeRows(landscape,grid)}:{})});
  parseBiomeDecoration(text,grid,island,world);return {text,furnitureCount:furniture.editable.length,networkCount:networks.length,landscapeCount:landscape?.length??0,protectedCount:furniture.protectedObjects.length-networks.length-(landscape?.length??0)};
 }catch{return null;}
}
export function parseBiomeDecoration(text:string,grid:MainlandGrid,island=false,world=false){
 if(text.length>BIOME_DECORATION_FILE_LIMIT)throw Error('DECORATION_LIMIT');
 const doc=JSON.parse(text);
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).some(k=>!['schema','gameVersion','furniture','network','supports','landscape','houses'].includes(k))||doc.schema!==(world?'wand.preset.world-grid-decoration@1':island?'wand.preset.island-grid-decoration@1':'wand.preset.biome-decoration@1')||doc.gameVersion!=='1.26.2')throw Error('DECORATION_CONTEXT');
 if(doc.houses!==undefined&&!world)throw Error('HOUSE_LAYOUT_SCOPE');
 const furniture=parseWholeArea(JSON.stringify(doc.furniture),grid,world?'world-grid':island?'floating-island':'biome'),network=parseBiomeNetwork(JSON.stringify(doc.network),grid);
 let supports:Map<number,ReturnType<typeof parseSupportScene>>|undefined;
 if(Object.prototype.hasOwnProperty.call(doc,'supports')){
  if(!Array.isArray(doc.supports)||doc.supports.length>furniture.length)throw Error('SUPPORT_CONTEXT');supports=new Map();
  for(const row of doc.supports){if(!row||Object.keys(row).length!==2||!Number.isSafeInteger(row.placementId)||supports.has(row.placementId))throw Error('SUPPORT_CONTEXT');const p=furniture.find(p=>p.id===row.placementId),scene=parseSupportScene(JSON.stringify(row.scene));if(!p||!Number.isInteger(p.orientation)||p.itemId!==scene.ownerItemId||[...supportSceneRootCounts(scene).values()].reduce((a,b)=>a+b,0)>32)throw Error('SUPPORT_OWNER');supports.set(row.placementId,scene);}
 }
 return {furniture,network,supports,...(doc.houses!==undefined?{houses:housePoseRows(doc.houses,grid)}:{}),...(doc.landscape!==undefined?{landscape:landscapeRows(doc.landscape,grid)}:{})};
}
function ghostObject(g:StockCandidate,ordinal:number):MainlandSavedObject{
 if(g.plan.action!=='place')throw Error('GHOST_POSE');
 return {area:g.area,x:g.x,y:g.y,factor:g.factor,shape:g.shape,object:{localOrdinal:ordinal,localGridOrdinal:1,itemId:g.plan.itemId,x:g.plan.x,y:g.plan.y,orientation:g.plan.orientation,orientationCode:worldOrientationCode(g.plan.orientation),shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}};
}
export function reviewBiomeDecoration(grid:MainlandGrid,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],omitted:number,before:readonly NetworkPose[],incoming:{furniture:readonly DesignPlacement[];network:readonly NetworkPose[];supports?:SupportAreaTrees;landscape?:readonly LandscapePose[]},defs:ReadonlyMap<number,DesignItemGeometry>,stock:ReadonlyMap<number,number>,island=false,currentSupports?:SupportAreaTrees,world=false,currentLandscape?:readonly LandscapePose[],free=false){
 if(incoming.supports&&!currentSupports||incoming.landscape!==undefined&&!currentLandscape)return null;
 const supportContext=incoming.supports&&currentSupports?{before:currentSupports,after:incoming.supports}:undefined;
 if(!captureBiomeDecoration(grid,objects,omitted,before,island,supportContext?.before,world))return null;
 const desired=new Set(incoming.network.map(networkKey)),deletedNetworkOrdinals=new Set<number>();
 for(const row of before){
  if(desired.has(networkKey(row)))continue;
  const p=objects.find(o=>o.area===grid.key&&Number(o.object.itemId)===row.itemId&&o.object.x===row.x&&o.object.y===row.y&&o.object.orientation===CARDINAL_ORIENTATIONS[row.orientation]);
  if(!p)return null;deletedNetworkOrdinals.add(p.object.localOrdinal);
 }
 // Furniture may occupy a removed fence but never a retained fence.
 const landscapeOld=new Set((currentLandscape??[]).map(landscapePoseKey)),landscapeNext=new Set((incoming.landscape??[]).map(landscapePoseKey));
 const landscapeRemoved=incoming.landscape===undefined?[]:objects.filter(o=>o.area===grid.key&&landscapeOld.has(landscapePoseKey(landscapeObjectPose(o)))&&!landscapeNext.has(landscapePoseKey(landscapeObjectPose(o))));
 const furniture=biomeFurnitureReplacement(grid,grids,rasters,objects.filter(o=>!deletedNetworkOrdinals.has(o.object.localOrdinal)&&!landscapeRemoved.includes(o)),omitted,incoming.furniture,defs,stock,island,supportContext,world,free);
 if(!furniture)return null;
 const removedFurniture=new Set(furniture.removed.map(o=>o.object.localOrdinal));
 const finalFurniture=objects.filter(o=>!removedFurniture.has(o.object.localOrdinal)&&!landscapeRemoved.includes(o));
 const addedFurniture=furniture.ghosts.flatMap((g,i)=>furniture.plan.add[i].freePlacement?[]:[ghostObject(g,1_000_000+i)]);
 // Keep the original networks for exact before/after matching, but inspect
 // fence collision against final furniture, not the furniture being removed.
 const landscape=incoming.landscape!==undefined?reviewLandscape(grid,grids,rasters,[...objects.filter(o=>!removedFurniture.has(o.object.localOrdinal)&&!deletedNetworkOrdinals.has(o.object.localOrdinal)),...addedFurniture],currentLandscape!,incoming.landscape,defs):null;
 if(incoming.landscape!==undefined&&!landscape)return null;
 const network=reviewBiomeNetwork(grid,rasters,[...finalFurniture,...addedFurniture,...(landscape?.ghosts??[]).map((g,i)=>ghostObject(g,2_000_000+i))],omitted,before,incoming.network,defs);
 if(!network)return null;
 for(const [i,g] of furniture.ghosts.entries()){if(furniture.plan.add[i].freePlacement)continue;const feedback=stockFootprintFeedback(g,objects.filter(o=>!removedFurniture.has(o.object.localOrdinal)&&!deletedNetworkOrdinals.has(o.object.localOrdinal)&&!landscapeRemoved.includes(o)),omitted);if(feedback.unknown||feedback.overlaps)return null;}
 const plan={furniture:furniture.plan,network:network.plan,...(landscape?.changed?{landscape:landscape.plan}:{})};
 try{parseReplayStep({command:'biome-decoration-export',plan});}catch{return null;}
 return {plan,furniture,network,landscape,ghosts:[...furniture.ghosts,...network.ghosts,...(landscape?.ghosts??[])],removed:[...furniture.removed,...network.removed,...(landscape?.removed??[])],missing:furniture.missing,changed:furniture.changed||network.changed||!!landscape?.changed,protectedCount:objects.filter(o=>o.area===grid.key&&!['ground','fence'].includes(o.object.layer)&&!furniture.retained.includes(o)&&!removedFurniture.has(o.object.localOrdinal)&&!(currentLandscape??[]).some(p=>landscapePoseKey(p)===landscapePoseKey(landscapeObjectPose(o)))).length};
}
export const biomeDecorationWords={
 ja:['Biome装飾Preset','装飾を一括保存','装飾Presetを開く','通常家具・道・フェンスを一括置換します。支持家具・建物・進行関連物は保持します。','家具','道・フェンス','家具も含める'],
 en:['Biome decoration preset','Save decoration','Open decoration preset','Replace ordinary furniture, roads and fences together. Support furniture, buildings and progression objects remain.','Furniture','Roads and fences','Include furniture'],
 fr:['Preset de décoration du biome','Enregistrer la décoration','Ouvrir le preset','Remplace ensemble meubles ordinaires, chemins et clôtures. Les supports, bâtiments et objets de progression restent.','Meubles','Chemins et clôtures','Inclure les meubles'],
 it:['Preset decorazione bioma','Salva decorazione','Apri preset','Sostituisce mobili ordinari, sentieri e recinzioni. Supporti, edifici e oggetti di progressione restano.','Mobili','Sentieri e recinzioni','Includi mobili'],
 de:['Biom-Dekorationsvorlage','Dekoration speichern','Vorlage öffnen','Ersetzt normale Möbel, Wege und Zäune. Auflagen, Gebäude und Fortschrittsobjekte bleiben erhalten.','Möbel','Wege und Zäune','Möbel einschließen'],
 'es-ES':['Preset de decoración del bioma','Guardar decoración','Abrir preset','Sustituye muebles normales, caminos y vallas. Conserva soportes, edificios y objetos de progreso.','Muebles','Caminos y vallas','Incluir muebles'],
 'zh-CN':['生态区装饰预设','保存装饰','打开装饰预设','一并替换普通家具、道路和围栏，保留支撑家具、建筑和进度相关物品。','家具','道路和围栏','包含家具'],
 'pt-BR':['Preset de decoração do bioma','Salvar decoração','Abrir preset','Substitui móveis comuns, caminhos e cercas. Suportes, edifícios e objetos de progresso são preservados.','Móveis','Caminhos e cercas','Incluir móveis']
} as const;
