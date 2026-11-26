/** Explicitly copy representable Save placements into an independent design.
 * Only source Item IDs, coordinates and orientations cross this boundary.
 * Do not serialize native Save IDs, state, stock, player or quest data.
 */
import {composeMainlandDesignFrame,mainlandFrameOffset,resolveMainlandDesign,mainlandItemsValid,serializeMainlandDesign} from './mainland-design-frame.ts';
import {emptyDesign,currentDesign,restoreDesign,DESIGN_LIMIT,type DesignPlacement,type DesignItemGeometry,type DesignTimeline} from './design-layout.ts';
import {isCardinal,CARDINAL_ORIENTATIONS,exclusiveAnchorClass} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {SavedShapeMap} from './saved-shape-map.ts';
export interface SaveDesignCapture{readonly scope:string;readonly text:string;readonly count:number;readonly omitted:number}
export function captureSaveDesign(grids:readonly PublicTerrainGridRef[],rasters:ReadonlyMap<string,TerrainRaster>,maps:ReadonlyMap<string,SavedShapeMap>,objects:readonly MainlandSavedObject[],omitted=0):SaveDesignCapture|null{
 if(!Number.isSafeInteger(omitted)||omitted<0||objects.length>20000)return null;
 try{
  const frame=composeMainlandDesignFrame(grids,rasters),defs=new Map<number,DesignItemGeometry>(),placements:DesignPlacement[]=[],seen=new Set<number>(),exclusive=new Set<string>();
  for(const p of objects){
   const o=p.object,id=Number(o.itemId),g=frame.grids.find(q=>q.key===p.area),map=maps.get(p.area);
   if(seen.has(o.localOrdinal))return null;
   seen.add(o.localOrdinal);
   if(!g||!map||p.factor!==g.factor||!Number.isSafeInteger(id)||id<1||id>0xffffffff||o.subgrid||o.nativeType==='Building'||!['furniture','landscape','ground','fence'].includes(o.layer)||
     !p.shape||!isCardinal(o.orientation)||nativeActionBlocked(o.editRestrictions,'select')||
     map.layoutId!==g.layoutId||map.gridDataPath!==g.gridDataPath||map.sourceGridFactor!==g.factor){omitted++;continue;}
   // A mixed ground/surface capability is not itself a support relation.
   // Top-level source-bound furniture and landscape are representable; SubGrid parents
   // and surface-only layers are already excluded above.
   const orientation=CARDINAL_ORIENTATIONS.indexOf(o.orientation),key=id+':'+orientation*4,shape=map.shapes[key];
   if(!shape||shape!==p.shape){omitted++;continue;}
   const existing=defs.get(id),shapes=Object.fromEntries([0,4,8,12].map(code=>id+':'+code).filter(key=>map.shapes[key]).map(key=>[key,map.shapes[key]]));
   if(existing&&(existing.layer!==o.layer||existing.surfaceCapable!==o.surfaceCapable||Object.entries(shapes).some(([k,s])=>existing.shapes[k]&&(existing.shapes[k].path!==s.path||existing.shapes[k].width!==s.width||existing.shapes[k].height!==s.height))))return null;
   const def:DesignItemGeometry={itemId:id,name:o.name,layer:o.layer,surfaceCapable:o.surfaceCapable,editRestrictions:o.editRestrictions,shapes:{...existing?.shapes,...shapes}};
   const offset=mainlandFrameOffset(frame,g),placement={id:placements.length+1,itemId:id,x:o.x+offset.x,y:o.y+offset.y,orientation};
   const target=resolveMainlandDesign(frame,placement.x,placement.y,shape);
   if(!target||target.grid.key!==g.key||target.x!==o.x||target.y!==o.y||!mainlandItemsValid(frame,[placement],new Map([[id,def]]))){omitted++;continue;}
   const kind=exclusiveAnchorClass(String(id)),anchor=kind+':'+placement.x+':'+placement.y;
   if(kind&&exclusive.has(anchor)){omitted++;continue;}
   if(placements.length>=DESIGN_LIMIT)return null;
   if(kind)exclusive.add(anchor);
   defs.set(id,def);placements.push(placement);
  }
  if(!placements.length)return null;
  const draft=restoreDesign(emptyDesign(),placements,defs,frame.raster.sizeX,frame.raster.sizeY);
  if(!draft)return null;
  return {scope:frame.scope,text:serializeMainlandDesign(frame,draft,defs),count:placements.length,omitted};
 }catch{return null;}
}
/** Non-destructive merge with multiset identity: preserve genuine duplicate
 * objects in the captured layout but don't add an already imported pose twice.
 * The current design is kept, one Undo restores it, and IDs are local only.
 */
export function mergeSaveDesign(t:DesignTimeline,incoming:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,width:number,height:number):DesignTimeline|null{
 const old=currentDesign(t),counts=new Map<string,number>(),key=(p:DesignPlacement)=>[p.itemId,p.x,p.y,p.orientation].join(':');
 for(const p of old){const k=key(p);counts.set(k,(counts.get(k)??0)+1);}
 const added:DesignPlacement[]=[];let id=t.nextId;
 for(const p of incoming){
  const k=key(p),n=counts.get(k)??0;
  if(n){counts.set(k,n-1);continue;}
  if(old.length+added.length>=DESIGN_LIMIT||!Number.isSafeInteger(id+1))return null;
  added.push({...p,id:id++});
 }
 return added.length?restoreDesign(t,[...old,...added],defs,width,height):t;
}
export const captureWords={
 ja:['配置を装飾設計へコピー','選択を装飾設計へコピー','装飾設計に追加','対象外','取り消す','コピーできる家具がありません。','セーブからコピーした配置','現在の設計に追加します。セーブ原本は変更しません。'],
 en:['Copy layout to design','Copy selection to design','Add to design','Omitted','Cancel','No supported placements to copy.','Layout copied from Save','Adds to the current design without changing the original Save.'],
 fr:['Copier vers le plan','Copier la sélection','Ajouter au plan','Exclus','Annuler','Aucun objet compatible.','Disposition copiée','Ajoute au plan sans modifier la sauvegarde originale.'],
 it:['Copia nel progetto','Copia selezione','Aggiungi al progetto','Esclusi','Annulla','Nessun oggetto compatibile.','Disposizione copiata','Aggiunge al progetto senza modificare il salvataggio.'],
 de:['Anordnung in Entwurf kopieren','Auswahl kopieren','Zum Entwurf hinzufügen','Ausgelassen','Abbrechen','Keine unterstützten Objekte.','Kopierte Anordnung','Ergänzt den Entwurf ohne Änderung des Spielstands.'],
 'es-ES':['Copiar al diseño','Copiar selección','Añadir al diseño','Omitidos','Cancelar','No hay objetos compatibles.','Disposición copiada','Añade al diseño sin modificar la partida original.'],
 'zh-CN':['复制布局到设计','复制所选布局','添加到设计','已略过','取消','没有可复制的物品。','从存档复制的布局','添加到当前设计，不修改原始存档。'],
 'pt-BR':['Copiar layout ao projeto','Copiar seleção','Adicionar ao projeto','Omitidos','Cancelar','Nenhum objeto compatível.','Layout copiado','Adiciona ao projeto sem alterar o save original.']
} as const;
