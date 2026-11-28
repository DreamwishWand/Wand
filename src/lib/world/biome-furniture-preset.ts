import {serializeWholeArea,wholeAreaKind} from './whole-area-preset.ts';
import {nativeUnderwaterDesignGrid} from './native-calibration-grids.ts';
import {stockSourceEligible,type StockDestination} from './save-furniture-placement.ts';
import {groupAbsoluteCandidate,type GroupGeometry,type GroupPasteCandidate,type GroupPasteRow} from './group-placement.ts';
import {worldOrientationCode,isCardinal} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {mainlandMapAnchor,bindFloatingIslandGrid,bindMainlandGrid,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignPlacement,DesignItemGeometry} from './design-layout.ts';
import {groupPickupPlan,emptyStoragePickupEligible,type GroupPickupRow} from './group-pickup.ts';
import {supportSceneRootCounts,type SupportScene} from './support-scene.ts';
export const BIOME_CHANGE_LIMIT=2048;
export interface BiomeFurniturePlan{destination:StockDestination;remove:GroupPickupRow[];add:(GroupPasteRow&{scene?:SupportScene})[]}
export const storageAreaEligible=(p:MainlandSavedObject)=>p.object.storageRestorable===true&&emptyStoragePickupEligible(p);
export const areaFurnitureEligible=(p:MainlandSavedObject,diagonal:boolean)=>{if(p.object.storage||p.object.storageKnown)return storageAreaEligible(p);const ordinary:boolean=stockSourceEligible(p);return ordinary||diagonal&&!isCardinal(p.object.orientation)&&!p.object.surfaceCapable&&stockSourceEligible(p,true)&&!nativeActionBlocked(p.object.editRestrictions,'select')&&!nativeActionBlocked(p.object.editRestrictions,'remove');};
export const privateStoragePoseEligible=(p:MainlandSavedObject)=>!!p.shape&&p.object.storage===true&&p.object.layer==='furniture'&&Math.floor(Number(p.object.itemId)/100000)===400&&!p.object.subgrid&&isCardinal(p.object.orientation);
const key=(id:number,x:number,y:number,o:number)=>[id,x,y,o].join(':');
export function supportAreaEligible(p:MainlandSavedObject,free=false){return !!p.object.subgrid&&!!groupPickupPlan([p],free);}
export type SupportAreaTrees=ReadonlyMap<number,SupportScene>;
export function biomeFurnitureSnapshot(grid:MainlandGrid,objects:readonly MainlandSavedObject[],omitted:number,island=false,supports?:SupportAreaTrees,world=false,privateContents=false,localPlain?:ReadonlySet<number>){
 if(omitted||(localPlain?!nativeUnderwaterDesignGrid(grid):world?!bindMainlandGrid(grid):island?!bindFloatingIslandGrid(grid):wholeAreaKind(grid,[grid])!=='biome'))return null;
 const area=objects.filter(p=>p.area===grid.key);
 if(area.some(p=>!p.shape||p.factor!==grid.factor)||new Set(area.map(p=>p.object.localOrdinal)).size!==area.length)return null;
 const diagonal=!island&&grid.factor===1&&!!bindMainlandGrid(grid);
 // A private local backup must represent every known storage root. Do not
 // silently export contents whose placement cannot be reconstructed.
 if(localPlain&&privateContents&&area.some(p=>(p.object.storage||p.object.storageKnown)&&(!privateStoragePoseEligible(p)||!localPlain.has(Number(p.object.itemId)))))return null;
 const editable=area.filter(p=>localPlain?(localPlain.has(Number(p.object.itemId))&&(p.object.storage||p.object.storageKnown?storageAreaEligible(p)||privateContents&&privateStoragePoseEligible(p):stockSourceEligible(p,true)&&isCardinal(p.object.orientation)&&!p.object.subgrid)||!!supports?.has(p.object.localOrdinal)&&supportAreaEligible(p,true)):areaFurnitureEligible(p,diagonal)||privateContents&&privateStoragePoseEligible(p)||supports&&supportAreaEligible(p)&&supports.has(p.object.localOrdinal)),protectedObjects=area.filter(p=>!editable.includes(p));
 if(supports&&!localPlain&&area.some(p=>supportAreaEligible(p)&&!supports.has(p.object.localOrdinal)))return null;
 const placements=editable.map((p,i)=>({id:i+1,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:(worldOrientationCode(p.object.orientation)??-4)/4}));
 try{const text=serializeWholeArea({snapshots:[placements],cursor:0,nextId:placements.length+1},grid,localPlain||world?'world-grid':island?'floating-island':'biome');return {editable,protectedObjects,placements,text,supports:editable.flatMap((p,i)=>{const scene=supports?.get(p.object.localOrdinal);return scene?[{placementId:placements[i].id,scene}]:[];})};}catch{return null;}
}
export function biomeFurnitureReplacement(grid:MainlandGrid,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],omitted:number,incoming:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,stock:ReadonlyMap<number,number>,island=false,supports?:{before:SupportAreaTrees;after:SupportAreaTrees},world=false,free=false,localPlain?:ReadonlySet<number>){
 const snapshot=biomeFurnitureSnapshot(grid,objects,omitted,island,supports?.before,world,false,localPlain);if(!snapshot)return null;
 if(incoming.some(p=>{const d=defs.get(p.itemId);if(localPlain){const scene=supports?.after.get(p.id);return (!scene&&!localPlain.has(p.itemId))||!Number.isInteger(p.orientation)||!d||!['furniture','surface'].includes(d.layer)||(!!scene?d.supportPath!==scene.tree.sourcePath:!!d.supportPath||d.surfaceCapable&&d.layer!=='surface')||Math.floor(p.itemId/100000)!==400||!d.shapes[p.itemId+':'+p.orientation*4];}return !Number.isInteger(p.orientation)&&(island||grid.factor!==1||!bindMainlandGrid(grid)||d?.surfaceCapable||d?.supportPath||supports?.after.has(p.id))||!d||d.layer!=='furniture'||nativeActionBlocked(d.editRestrictions,'select')||nativeActionBlocked(d.editRestrictions,'remove')||Math.floor(p.itemId/100000)!==400||!d.shapes[p.itemId+':'+p.orientation*4];}))return null;
 const sceneKey=(scene:SupportScene|undefined)=>{
  if(!scene)return '';
  // Stable semantic identity independent of JSON key ordering and the order
  // of native object IDs in a support surface.
  const canonical=(t:SupportScene['tree']):unknown=>[t.sourcePath,t.factor,t.objects.map(o=>[o.itemId,o.x,o.y,o.orientation,o.child?canonical(o.child):null]).map(row=>JSON.stringify(row)).sort()];
  return JSON.stringify(canonical(scene.tree));
 };
 const existing=new Map<string,MainlandSavedObject[]>();
 for(const p of snapshot.editable){const k=key(Number(p.object.itemId),p.object.x,p.object.y,(worldOrientationCode(p.object.orientation)??-4)/4)+':'+sceneKey(supports?.before.get(p.object.localOrdinal));const a=existing.get(k)??[];a.push(p);existing.set(k,a);}
 const protectedStorage=new Map<string,MainlandSavedObject[]>();
 for(const p of snapshot.protectedObjects){if(!p.object.storage&&!p.object.storageKnown)continue;const k=key(Number(p.object.itemId),p.object.x,p.object.y,(worldOrientationCode(p.object.orientation)??-4)/4);const bucket=protectedStorage.get(k)??[];bucket.push(p);protectedStorage.set(k,bucket);}
 const added:DesignPlacement[]=[],retained:MainlandSavedObject[]=[];
 for(const p of incoming){const scene=supports?.after.get(p.id),k=key(p.itemId,p.x,p.y,p.orientation);const match=existing.get(k+':'+sceneKey(scene))?.shift()??(!scene?protectedStorage.get(k)?.shift():undefined);if(match)retained.push(match);else added.push(p);}
 const removed=[...existing.values()].flat();
 if(removed.length+added.length>BIOME_CHANGE_LIMIT)return null;
 const removedIds=new Set(removed.map(p=>p.object.localOrdinal)),remaining=objects.filter(p=>!removedIds.has(p.object.localOrdinal)),capacity=new Map(stock),returned=new Map<number,number>(),required=new Map<number,number>();
 const count=(id:number,scene:SupportScene|undefined)=>scene?supportSceneRootCounts(scene):new Map([[id,1]]);
 for(const p of removed){for(const [id,n] of count(Number(p.object.itemId),supports?.before.get(p.object.localOrdinal))){if(!capacity.has(id))return null;capacity.set(id,capacity.get(id)!+n);returned.set(id,(returned.get(id)??0)+n);}}
 for(const p of added)for(const [id,n] of count(p.itemId,supports?.after.get(p.id)))required.set(id,(required.get(id)??0)+n);
 const changeCount=[...returned.values(),...required.values()].reduce((a,b)=>a+b,0);if(changeCount>BIOME_CHANGE_LIMIT)return null;
 const missing=[...required].filter(([id,n])=>(capacity.get(id)??0)<n).map(([itemId,n])=>({itemId,quantity:n-(capacity.get(itemId)??0)}));
 const geometry:GroupGeometry=new Map([...defs].map(([id,d])=>[id,new Map([[grid.factor,d]])]));
 const positions=added.map(p=>({itemId:p.itemId,...mainlandMapAnchor(grid,p.x,p.y),orientation:p.orientation}));
 const freeIndices=new Set(added.flatMap((p,i)=>{const d=defs.get(p.itemId);return localPlain||free&&!island&&d&&!d.surfaceCapable&&!d.supportPath&&!supports?.after.has(p.id)?[i]:[];}));
 const ordinary=positions.filter((_,i)=>freeIndices.has(i)),strict=positions.filter((_,i)=>!freeIndices.has(i));
 const loose=ordinary.length?groupAbsoluteCandidate(ordinary,[grid],rasters,geometry,required,remaining,omitted,BIOME_CHANGE_LIMIT,true,true,new Set(added.filter(p=>supports?.after.has(p.id)).map(p=>p.itemId))):{rows:[],ghosts:[]};
 if(!loose)return null;
 const fixed=strict.length?groupAbsoluteCandidate(strict,grids,rasters,geometry,required,remaining,omitted,BIOME_CHANGE_LIMIT,false,!island&&grid.factor===1):{rows:[],ghosts:[]};
 if(!fixed)return null;
 let a=0,b=0;
 const q:GroupPasteCandidate={rows:[],ghosts:[]};
 for(let i=0;i<positions.length;i++){
  if(freeIndices.has(i)){q.rows.push({...loose.rows[a],freePlacement:true});q.ghosts.push(loose.ghosts[a++]);}
  else{q.rows.push(fixed.rows[b]);q.ghosts.push(fixed.ghosts[b++]);}
 }
 if(!q||q.ghosts.some(p=>p.area!==grid.key))return null;
 const destination:StockDestination={layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,factor:grid.factor,sizeX:grid.sizeX,sizeY:grid.sizeY};
 const remove=removed.map(p=>({localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation!,...(supports?.before.has(p.object.localOrdinal)?{includeSupport:true as const}:{}),...(storageAreaEligible(p)?{includeStorage:true as const}:{})})).sort((a,b)=>a.localOrdinal-b.localOrdinal);
 const plan:BiomeFurniturePlan={destination,remove,add:q.rows.map((row,i)=>{const scene=supports?.after.get(added[i].id);return scene?{...row,scene}:row;})};
 return {plan,ghosts:q.ghosts,removed,retained,protectedObjects:snapshot.protectedObjects,returned,required,changeCount,missing,changed:remove.length+q.rows.length>0};
}
export const biomeFurnitureWords={
 ja:['Biome家具Preset','対象Biome','家具配置を保存','家具Presetを開く','維持','回収','追加','対象外・保持','在庫不足','編集コピーを検証','取消','現在の対象Biomeの通常家具だけを置換します。道・フェンス・支持家具などは保持します。','配置または対象範囲を確認できません。','変更なし','配置を確認中…','家具配置の取り込み対象'],
 en:['Biome furniture preset','Biome','Save furniture layout','Open furniture preset','Retained','Return','Add','Excluded / preserved','Missing stock','Validate edited copy','Cancel','Only ordinary furniture in this biome is replaced. Roads, fences and support furniture remain.','Placement or scope could not be verified.','No changes','Checking layout…','Furniture layout contents'],
 fr:['Preset de meubles du biome','Biome','Enregistrer les meubles','Ouvrir le preset','Conservés','Ranger','Ajouter','Exclus / conservés','Stock manquant','Vérifier la copie','Annuler','Seuls les meubles ordinaires du biome sont remplacés. Chemins, clôtures et supports restent.','Zone ou placement non vérifié.','Aucun changement','Vérification…','Contenu du plan'],
 it:['Preset mobili del bioma','Bioma','Salva mobili','Apri preset mobili','Mantenuti','Riponi','Aggiungi','Esclusi / mantenuti','Scorte mancanti','Verifica copia','Annulla','Sostituisce solo mobili ordinari. Sentieri, recinzioni e supporti restano.','Area o posizione non verificata.','Nessuna modifica','Verifica…','Contenuto del progetto'],
 de:['Biom-Möbelvorlage','Biom','Möbel speichern','Möbelvorlage öffnen','Behalten','Zurücklegen','Hinzufügen','Ausgeschlossen / behalten','Fehlender Bestand','Kopie prüfen','Abbrechen','Nur normale Möbel werden ersetzt. Wege, Zäune und Auflagen bleiben erhalten.','Bereich oder Platzierung nicht geprüft.','Keine Änderung','Prüfung…','Inhalt der Vorlage'],
 'es-ES':['Preset de muebles del bioma','Bioma','Guardar muebles','Abrir preset','Conservados','Recoger','Añadir','Excluidos / conservados','Falta de stock','Validar copia','Cancelar','Solo se sustituyen muebles normales. Caminos, vallas y soportes se conservan.','Zona o posición sin verificar.','Sin cambios','Comprobando…','Contenido del diseño'],
 'zh-CN':['生态区家具预设','生态区','保存家具布局','打开家具预设','保留','收回','添加','排除并保留','库存不足','验证编辑副本','取消','仅替换此生态区的普通家具，道路、围栏及支撑家具保持不变。','无法验证范围或位置。','无变化','检查布局…','家具布局内容'],
 'pt-BR':['Preset de móveis do bioma','Bioma','Salvar móveis','Abrir preset','Mantidos','Recolher','Adicionar','Excluídos / mantidos','Estoque insuficiente','Validar cópia','Cancelar','Somente móveis comuns são substituídos. Caminhos, cercas e suportes permanecem.','Área ou posição não verificada.','Sem alterações','Verificando…','Conteúdo do projeto']
} as const;
