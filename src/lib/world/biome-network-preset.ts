import {parseSceneNetwork,networkSceneShape,type SceneNetwork} from './area-scene.ts';
import {serializeDesign,parseDesign,type DesignItemGeometry} from './design-layout.ts';
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {parseReplayStep} from './checkpoint-journal.ts';
export interface NetworkPose{itemId:number;x:number;y:number;orientation:number;network:SceneNetwork}
export const networkKey=(p:NetworkPose)=>[p.itemId,p.x,p.y,p.orientation,p.network.kind,p.network.diagonal,p.network.kind==='fence'?p.network.base:0].join(':');
export function networkRows(value:unknown,grid:MainlandGrid):NetworkPose[]{
 if(!Array.isArray(value)||value.length>4608)throw Error('NETWORK_LIMIT');
 const anchors=new Set<string>();let roads=0,fences=0;
 return value.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==5||!Number.isSafeInteger(p.itemId)||p.itemId<1||p.itemId>0xffffffff||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=grid.sizeX*grid.factor||p.y>=grid.sizeY*grid.factor||![2,3].includes(p.orientation))throw Error('NETWORK_POSE');
  const network=parseSceneNetwork(p.network,p.itemId,p.orientation),pitch=(network.kind==='road'?2:1)*grid.factor;
  const key=network.kind+':'+p.x+':'+p.y;
  if(anchors.has(key)||p.x%pitch||p.y%pitch||network.kind==='road'&&++roads>4096||network.kind==='fence'&&++fences>512)throw Error('NETWORK_ANCHOR');
  anchors.add(key);return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation,network};
 });
}
export function serializeBiomeNetwork(grid:MainlandGrid,rows:readonly NetworkPose[]){
 const identity=JSON.parse(serializeDesign({snapshots:[[]],cursor:0,nextId:1},grid)).grid;
 return JSON.stringify({schema:'wand.preset.biome-network@1',gameVersion:'1.26.2',grid:identity,rows:networkRows(rows,grid)});
}
export function parseBiomeNetwork(text:string,grid:MainlandGrid){
 if(text.length>1_000_000)throw Error('NETWORK_LIMIT');
 const doc=JSON.parse(text);
 if(!doc||Object.keys(doc).length!==4||doc.schema!=='wand.preset.biome-network@1'||doc.gameVersion!=='1.26.2'||!doc.grid||Object.keys(doc.grid).length!==7)throw Error('NETWORK_CONTEXT');
 parseDesign(JSON.stringify({schema:'wand.world-design@1',grid:doc.grid,placements:[]}),grid);
 return networkRows(doc.rows,grid);
}
export function reviewBiomeNetwork(grid:MainlandGrid,rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],omitted:number,before:readonly NetworkPose[],after:readonly NetworkPose[],defs:ReadonlyMap<number,DesignItemGeometry>){
 const r=rasters.get(grid.key);if(omitted||!r)return null;
 const area=objects.filter(p=>p.area===grid.key);
 const existing=area.filter(p=>['ground','fence'].includes(p.object.layer)),furniture=area.filter(p=>!['ground','fence'].includes(p.object.layer));
 if(existing.length!==before.length||existing.some(p=>!p.shape||nativeActionBlocked(p.object.editRestrictions,'select')))return null;
 const old=new Set(before.map(networkKey)),next=new Set(after.map(networkKey));
 const removed=before.filter(p=>!next.has(networkKey(p))),added=after.filter(p=>!old.has(networkKey(p)));
 const removedObjects:MainlandSavedObject[]=[],ghosts:StockCandidate[]=[];
 for(const p of before){
  const match=existing.filter(o=>Number(o.object.itemId)===p.itemId&&o.object.x===p.x&&o.object.y===p.y&&o.object.orientation===CARDINAL_ORIENTATIONS[p.orientation]);
  if(match.length!==1)return null;
  if(!next.has(networkKey(p))){if(nativeActionBlocked(match[0].object.editRestrictions,'remove'))return null;removedObjects.push(match[0]);}
 }
 const destination={layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,factor:grid.factor,sizeX:grid.sizeX,sizeY:grid.sizeY};
 for(const p of added){
  const def=defs.get(p.itemId),shape=networkSceneShape({...p,dx:0,dy:0,support:null},def,grid.factor);
  if(!shape||nativeActionBlocked(def?.editRestrictions,'select')||terrainWarnings({raster:r,factor:grid.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  for(const run of shape.runs)for(let j=0;j<run.width;j++){const a=mainlandMapAnchor(grid,p.x+run.x+j+.5,p.y+run.y+.5);if(mainlandTerrainHits([grid],rasters,a.x,a.y).length!==1)return null;}
  const ghost:StockCandidate={area:grid.key,...mainlandMapAnchor(grid,p.x,p.y),factor:grid.factor,shape,plan:{action:'place',itemId:String(p.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation]},destination};
  if(p.network.kind==='fence'){const feedback=stockFootprintFeedback(ghost,furniture,0);if(feedback.overlaps||feedback.unknown)return null;}
  ghosts.push(ghost);
 }
 const plan={destination,before,after};
 try{parseReplayStep({command:'biome-network-export',plan});}catch{return null;}
 return {plan,removed:removedObjects,ghosts,retained:before.length-removed.length,changed:!!(removed.length+added.length)};
}
export const networkPresetWords={
 ja:['道・フェンスPreset','ネットワークを保存','ネットワークPresetを開く','対象Biomeの道・フェンスだけを置換します。家具・在庫は変更しません。'],
 en:['Road and fence preset','Save networks','Open network preset','Replace only roads and fences in this biome. Furniture and inventory remain unchanged.'],
 fr:['Preset chemins et clôtures','Enregistrer les réseaux','Ouvrir le preset','Seuls les chemins et clôtures sont remplacés.'],
 it:['Preset sentieri e recinzioni','Salva reti','Apri preset','Sostituisce solo sentieri e recinzioni.'],
 de:['Wege- und Zaunvorlage','Netze speichern','Netzvorlage öffnen','Nur Wege und Zäune werden ersetzt.'],
 'es-ES':['Preset de caminos y vallas','Guardar redes','Abrir preset','Solo se sustituyen caminos y vallas.'],
 'zh-CN':['道路和围栏预设','保存网络','打开网络预设','仅替换该生态区道路和围栏，家具和库存不变。'],
 'pt-BR':['Preset de caminhos e cercas','Salvar redes','Abrir preset','Substitui apenas caminhos e cercas.']
} as const;
