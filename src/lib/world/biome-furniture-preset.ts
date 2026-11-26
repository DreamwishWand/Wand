import {serializeWholeArea,wholeAreaKind} from './whole-area-preset.ts';
import {stockSourceEligible,type StockDestination} from './save-furniture-placement.ts';
import {groupAbsoluteCandidate,type GroupGeometry,type GroupPasteCandidate,type GroupPasteRow} from './group-placement.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {mainlandMapAnchor,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignPlacement,DesignItemGeometry} from './design-layout.ts';
import type {GroupPickupRow} from './group-pickup.ts';
export const BIOME_CHANGE_LIMIT=128;
export interface BiomeFurniturePlan{destination:StockDestination;remove:GroupPickupRow[];add:GroupPasteRow[]}
const eligible=(p:MainlandSavedObject)=>stockSourceEligible(p);
const key=(id:number,x:number,y:number,o:number)=>[id,x,y,o].join(':');
export function biomeFurnitureSnapshot(grid:MainlandGrid,objects:readonly MainlandSavedObject[],omitted:number){
 if(omitted||wholeAreaKind(grid,[grid])!=='biome')return null;
 const area=objects.filter(p=>p.area===grid.key);
 if(area.some(p=>!p.shape||p.factor!==grid.factor)||new Set(area.map(p=>p.object.localOrdinal)).size!==area.length)return null;
 const editable=area.filter(eligible),protectedObjects=area.filter(p=>!eligible(p));
 const placements=editable.map((p,i)=>({id:i+1,itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number])}));
 try{const text=serializeWholeArea({snapshots:[placements],cursor:0,nextId:placements.length+1},grid,'biome');return {editable,protectedObjects,placements,text};}catch{return null;}
}
export function biomeFurnitureReplacement(grid:MainlandGrid,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],omitted:number,incoming:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,stock:ReadonlyMap<number,number>){
 const snapshot=biomeFurnitureSnapshot(grid,objects,omitted);if(!snapshot)return null;
 if(incoming.some(p=>{const d=defs.get(p.itemId);return !d||d.layer!=='furniture'||nativeActionBlocked(d.editRestrictions,'select')||nativeActionBlocked(d.editRestrictions,'remove')||Math.floor(p.itemId/100000)!==400||!d.shapes[p.itemId+':'+p.orientation*4];}))return null;
 const existing=new Map<string,MainlandSavedObject[]>();
 for(const p of snapshot.editable){const k=key(Number(p.object.itemId),p.object.x,p.object.y,CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number]));const a=existing.get(k)??[];a.push(p);existing.set(k,a);}
 const added:DesignPlacement[]=[],retained:MainlandSavedObject[]=[];
 for(const p of incoming){const match=existing.get(key(p.itemId,p.x,p.y,p.orientation))?.shift();if(match)retained.push(match);else added.push(p);}
 const removed=[...existing.values()].flat();
 if(removed.length+added.length>BIOME_CHANGE_LIMIT)return null;
 const removedIds=new Set(removed.map(p=>p.object.localOrdinal));
 const remaining=objects.filter(p=>!removedIds.has(p.object.localOrdinal)),capacity=new Map(stock);
 for(const p of removed){const id=Number(p.object.itemId);if(!capacity.has(id))return null;capacity.set(id,capacity.get(id)!+1);}
 const required=new Map<number,number>();for(const p of added)required.set(p.itemId,(required.get(p.itemId)??0)+1);
 const missing=[...required].filter(([id,n])=>(capacity.get(id)??0)<n).map(([itemId,n])=>({itemId,quantity:n-(capacity.get(itemId)??0)}));
 const geometry:GroupGeometry=new Map([...defs].map(([id,d])=>[id,new Map([[grid.factor,d]])]));
 const positions=added.map(p=>({itemId:p.itemId,...mainlandMapAnchor(grid,p.x,p.y),orientation:p.orientation}));
 const q:GroupPasteCandidate|null=added.length?groupAbsoluteCandidate(positions,grids,rasters,geometry,required,remaining,omitted):{rows:[],ghosts:[]};
 if(!q||q.ghosts.some(p=>p.area!==grid.key))return null;
 const destination:StockDestination={layoutId:grid.layoutId,gridDataPath:grid.gridDataPath,factor:grid.factor,sizeX:grid.sizeX,sizeY:grid.sizeY};
 const remove=removed.map(p=>({localOrdinal:p.object.localOrdinal,itemId:p.object.itemId,expectedX:p.object.x,expectedY:p.object.y,expectedOrientation:p.object.orientation!})).sort((a,b)=>a.localOrdinal-b.localOrdinal);
 const plan:BiomeFurniturePlan={destination,remove,add:q.rows};
 return {plan,ghosts:q.ghosts,removed,retained,protectedObjects:snapshot.protectedObjects,missing,changed:remove.length+q.rows.length>0};
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
