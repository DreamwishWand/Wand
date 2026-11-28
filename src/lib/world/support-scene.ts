import {reflectedDesignItem} from './design-symmetry.ts';
import {groupAbsoluteCandidate,groupPasteCandidate,type GroupGeometry,type GroupPasteCandidate,type GroupPasteRow,type WorldGroupPose,type WorldSymmetryAxis} from './group-placement.ts';
import type {MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {parseScene} from './scene-preset.ts';
import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
import {parseSupportTree,supportStockPlacement,type SupportTree,type SupportStockPlan} from './subgrid-local.ts';
import {isCardinal} from './saved-map-transform.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface SupportScene{schema:'wand.preset.support-scene@1';gameVersion:'1.26.2';ownerItemId:number;tree:SupportTree}
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const furniture=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&Math.floor(n/100000)===400;
export function parseSupportScene(raw:string):SupportScene{
 if(raw.length>262144)throw Error('SCENE_LIMIT');
 const v:unknown=JSON.parse(raw);
 if(!rec(v)||Object.keys(v).length!==4||v.schema!=='wand.preset.support-scene@1'||v.gameVersion!=='1.26.2'||!furniture(v.ownerItemId))throw Error('SCENE_INVALID');
 function strict(t:unknown,depth:number){
  if(depth>8||!rec(t)||Object.keys(t).length!==3||!Array.isArray(t.objects)||t.objects.length>512||!(t.factor===1||t.factor===2)||typeof t.sourcePath!=='string')throw Error('SCENE_TREE');
  for(const o of t.objects){
   if(!rec(o)||Object.keys(o).length!==5||!furniture(o.itemId)||!isCardinal(o.orientation)||!Number.isSafeInteger(o.x)||!Number.isSafeInteger(o.y)||o.child!==null&&!rec(o.child))throw Error('SCENE_OBJECT');
   if(o.child!==null)strict(o.child,depth+1);
  }
 }
 strict(v.tree,0);
 const tree=parseSupportTree({contract:'wand.world.subgrid-local@1',worldTransformVerified:false,tree:v.tree});
 function valid(t:SupportTree):boolean{return !!t.sourcePath&&t.objects.every(o=>!o.child||valid(o.child));}
 if(!valid(tree))throw Error('SCENE_PATH');
 return {schema:'wand.preset.support-scene@1',gameVersion:'1.26.2',ownerItemId:v.ownerItemId,tree};
}
export function captureSupportScene(ownerItemId:number,tree:SupportTree):SupportScene|null{
 try{return parseSupportScene(JSON.stringify({schema:'wand.preset.support-scene@1',gameVersion:'1.26.2',ownerItemId,tree}));}catch{return null;}
}
export function supportSceneCounts(tree:SupportTree):Map<number,number>{
 const out=new Map<number,number>();
 function visit(t:SupportTree){for(const o of t.objects){out.set(o.itemId,(out.get(o.itemId)??0)+1);if(o.child)visit(o.child);}}
 visit(tree);return out;
}
/** No rounding, root creation or deletion of existing furniture. Restore only
 * ordinary leaves to the exact same empty support type and native raster. */
export function supportScenePlan(scene:SupportScene,owner:number,target:SupportTree,shapes:Readonly<Record<string,SourceObjectShape>>,terrain:TerrainRaster|null,counts:ReadonlyMap<number,number>,allowed:ReadonlySet<number>):SupportStockPlan[]|null{
 if(owner!==scene.ownerItemId||target.factor!==scene.tree.factor||!target.sourcePath||target.sourcePath!==scene.tree.sourcePath||target.objects.length||!terrain||!scene.tree.objects.length||scene.tree.objects.length>32||scene.tree.objects.some(o=>o.child))return null;
 const staged:SupportTree={...target,objects:[]},stock=new Map(counts),out:SupportStockPlan[]=[];
 for(const o of scene.tree.objects){
  if(!allowed.has(o.itemId))return null;
  const plan=supportStockPlacement(staged,shapes,terrain,o.itemId,stock.get(o.itemId)??0,o.x,o.y,o.orientation);
  if(!plan)return null;out.push(plan);stock.set(o.itemId,plan.expectedStock-1);staged.objects.push({...o});
 }
 return out;
}
export const supportSceneWords={
 ja:['小物Scene','配置を保存','Sceneを開く','同じ種類の空の支持家具に配置','必要な小物','在庫不足・形状不一致・入れ子などにより配置できません。','読み込めませんでした。','戻る'],
 en:['Support Scene','Save arrangement','Open Scene','Restore on matching empty support','Required items','Insufficient stock, incompatible geometry or nested supports.','Unable to open Scene.','Back'],
 fr:['Scène de support','Enregistrer','Ouvrir la scène','Restaurer sur un support vide identique','Objets requis','Stock ou géométrie incompatible.','Lecture impossible.','Retour'],
 it:['Scena supporto','Salva disposizione','Apri scena','Ripristina su supporto vuoto identico','Oggetti richiesti','Scorte o geometria incompatibili.','Impossibile aprire.','Indietro'],
 de:['Auflagen-Szene','Anordnung speichern','Szene öffnen','Auf gleicher leerer Auflage platzieren','Benötigte Objekte','Bestand oder Geometrie inkompatibel.','Öffnen fehlgeschlagen.','Zurück'],
 'es-ES':['Escena de soporte','Guardar disposición','Abrir escena','Restaurar en soporte vacío idéntico','Objetos necesarios','Inventario o geometría incompatible.','No se puede abrir.','Volver'],
 'zh-CN':['支撑面场景','保存布局','打开场景','在相同空支撑面上恢复','所需物品','库存或形状不匹配，或存在嵌套支撑。','无法打开场景。','返回'],
 'pt-BR':['Cena de suporte','Salvar disposição','Abrir cena','Restaurar em suporte vazio idêntico','Itens necessários','Estoque ou geometria incompatível.','Não foi possível abrir.','Voltar']
} as const;

/** The portable file contains layout only. Each required support type must
 * have an exact native template in the currently selected hierarchy. */
export function supportSceneTemplateCompatible(scene:SupportScene,owner:number,source:SupportTree):boolean{
 if(owner!==scene.ownerItemId)return false;
 const templates=new Map<number,Set<string>>(),plain=new Set<number>();let total=1;
 const key=(t:SupportTree)=>t.factor+':'+t.sourcePath;
 function collect(id:number,t:SupportTree,depth:number):boolean{
  if(depth>8||!t.sourcePath)return false;
  const a=templates.get(id)??new Set<string>();a.add(key(t));templates.set(id,a);
  for(const o of t.objects){if(++total>32||!furniture(o.itemId)||!isCardinal(o.orientation))return false;if(o.child){if(!collect(o.itemId,o.child,depth+1))return false;}else plain.add(o.itemId);}
  return true;
 }
 if(!collect(owner,source,0))return false;
 total=1;
 function check(id:number,t:SupportTree,depth:number):boolean{
  if(depth>8||!templates.get(id)?.has(key(t)))return false;
  const anchors=new Set<string>();
  for(const o of t.objects){
   const a=o.x+':'+o.y;if(++total>32||o.x<0||o.y<0||anchors.has(a))return false;anchors.add(a);
   if(o.child){if(!check(o.itemId,o.child,depth+1))return false;}else if(!plain.has(o.itemId)||templates.has(o.itemId))return false;
  }return true;
 }
 return check(owner,scene.tree,0);
}
export function supportSceneRootCounts(scene:SupportScene){const counts=supportSceneCounts(scene.tree);counts.set(scene.ownerItemId,(counts.get(scene.ownerItemId)??0)+1);return counts;}
export const supportSceneCreateWords={
 ja:['支持家具ごとSceneを配置','同じ種類の既存家具を原本テンプレートとして使用します。','Sceneの新規配置に対応する原本構造・在庫がありません。'],
 en:['Place Scene with support furniture','Uses existing matching furniture as a native template.','Missing compatible template or stock for Scene creation.'],
 fr:['Placer la scène avec son support','Utilise un meuble identique comme modèle natif.','Modèle ou stock incompatible.'],
 it:['Posiziona scena con supporto','Usa un mobile identico come modello nativo.','Modello o scorte incompatibili.'],
 de:['Szene mit Möbel platzieren','Verwendet ein gleiches Möbel als Vorlage.','Vorlage oder Bestand fehlt.'],
 'es-ES':['Colocar escena con soporte','Usa un mueble idéntico como plantilla.','Falta una plantilla o inventario.'],
 'zh-CN':['连同支撑家具放置场景','使用现有同类家具作为原始模板。','缺少匹配模板或库存。'],
 'pt-BR':['Posicionar cena com suporte','Usa móvel idêntico como modelo nativo.','Modelo ou estoque indisponível.']
} as const;

/** A mixed Scene records root poses in a shared half-cell coordinate system.
 * Each root retains its own support hierarchy; no local Save IDs are stored. */
/** Distinguish the transaction limit from the verified native subtree limit. */
export const SCENE_FURNITURE_LIMIT=128;
export const SCENE_SUPPORT_TREE_LIMIT=32;
export function mixedSceneSizeValid(items:readonly MixedSceneItem[]){
 return items.length<=SCENE_FURNITURE_LIMIT&&items.every(p=>!p.support||[...supportSceneRootCounts(p.support).values()].reduce((a,b)=>a+b,0)<=SCENE_SUPPORT_TREE_LIMIT)&&[...mixedSceneCounts(items).values()].reduce((a,b)=>a+b,0)<=SCENE_FURNITURE_LIMIT;
}
export interface MixedSceneItem extends DesignClipItem{support:SupportScene|null}
export interface MixedScenePreset{schema:'wand.preset.mixed-scene@1';gameVersion:'1.26.2';factor:2;anchor:'corner'|'center';items:MixedSceneItem[]}
export function mixedSceneCounts(items:readonly MixedSceneItem[]):Map<number,number>{
 const out=new Map<number,number>();for(const p of items){const counts=p.support?supportSceneRootCounts(p.support):new Map([[p.itemId,1]]);for(const [id,n] of counts)out.set(id,(out.get(id)??0)+n);}return out;
}
export function parseMixedScene(raw:string):MixedScenePreset{
 if(raw.length>262144)throw Error('SCENE_LIMIT');
 const v:unknown=JSON.parse(raw);
 if(!rec(v)||Object.keys(v).length!==5||v.schema!=='wand.preset.mixed-scene@1'||v.gameVersion!=='1.26.2'||v.factor!==2||!(v.anchor==='corner'||v.anchor==='center')||!Array.isArray(v.items)||!v.items.length||v.items.length>SCENE_FURNITURE_LIMIT)throw Error('SCENE_INVALID');
 const flat=parseScene(JSON.stringify({schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor:2,anchor:v.anchor,items:v.items.map(p=>{
  if(!rec(p)||Object.keys(p).length!==5||!furniture(p.itemId)||!Object.prototype.hasOwnProperty.call(p,'support'))throw Error('SCENE_ITEM');
  const {support,...pose}=p;return pose;
 })}),2);
 const rows=v.items as Record<string,unknown>[];
 const items=flat.items.map((p,i)=>{
  const support=rows[i].support===null?null:parseSupportScene(JSON.stringify(rows[i].support));
  if(support&&support.ownerItemId!==p.itemId)throw Error('SCENE_OWNER');
  return {...p,support};
 });
 if(items.some(p=>p.support&&!Number.isInteger(p.orientation))||!items.some(p=>p.support)||!mixedSceneSizeValid(items))throw Error('SCENE_LIMIT');
 return {schema:'wand.preset.mixed-scene@1',gameVersion:'1.26.2',factor:2,anchor:v.anchor,items};
}
export function mixedSceneFromClip(clip:readonly DesignClipItem[],supports:readonly (SupportScene|null)[],anchor:'corner'|'center'='center'):MixedScenePreset{
 if(clip.length!==supports.length)throw Error('SCENE_LENGTH');
 return parseMixedScene(JSON.stringify({schema:'wand.preset.mixed-scene@1',gameVersion:'1.26.2',factor:2,anchor,items:clip.map((p,i)=>({...p,support:supports[i]}))}));
}


/** Root-local Scene arrangements survive a half-turn with their support.
 * A line reflection of populated supports is not a native rotation. */
export function reflectedMixedRoot(p:WorldGroupPose,support:SupportScene|null,geometry:DesignItemGeometry,factor:1|2,axis:WorldSymmetryAxis):WorldGroupPose|null{
 if(support&&support.ownerItemId!==p.itemId||axis.mode!=='point'&&support?.tree.objects.length)return null;
 const reflected=reflectedDesignItem({itemId:p.itemId,x:p.x*factor,y:-p.y*factor,orientation:p.orientation},geometry,{mode:axis.mode,x2:axis.x*2*factor,y2:-axis.y*2*factor});
 return reflected?{...reflected,x:reflected.x/factor,y:-reflected.y/factor}:null;
}
export type MixedScenePlacement=GroupPasteCandidate&{supportRows:(GroupPasteRow&{scene?:SupportScene})[]};
export function mixedPlacementCounts(q:MixedScenePlacement){
 return mixedSceneCounts(q.supportRows.map(r=>({itemId:Number(r.itemId),dx:0,dy:0,orientation:0,support:r.scene??null})));
}
/** Validate both halves together, preserving each root's independent tree.
 * Existing objects are never assumed to contain matching descendants. */
export function mixedScenePlacement(clip:readonly DesignClipItem[],doc:MixedScenePreset,point:{x:number;y:number},axis:WorldSymmetryAxis|null,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,objects:readonly MainlandSavedObject[],omitted:number,free=false):MixedScenePlacement|null{
 if(clip.length!==doc.items.length||clip.some((p,i)=>p.itemId!==doc.items[i].itemId))return null;
 if(free&&axis||clip.some((p,i)=>!Number.isInteger(p.orientation)&&(!free||!!doc.items[i].support)))return null;
 const verifiedSupport=new Set(doc.items.filter(p=>p.support&&doc.items.every(q=>q.itemId!==p.itemId||!!q.support)).map(p=>p.itemId));
 const base=groupPasteCandidate(clip,grids,rasters,defs,mixedSceneCounts(doc.items),objects,omitted,point.x,point.y,free,verifiedSupport);
 if(!base)return null;
 const sources=base.rows.map((r,i)=>({...r,...(doc.items[i].support?{scene:doc.items[i].support!}:{})}));
 if(!axis)return {...base,supportRows:sources};
 const roots=base.ghosts.map((g,i)=>({pose:{itemId:clip[i].itemId,x:g.x,y:g.y,orientation:clip[i].orientation},support:doc.items[i].support,factor:g.factor}));
 const combined:typeof roots=[],anchors=new Map<string,typeof roots[number]>();
 function append(root:typeof roots[number]){
  const p=root.pose,key=p.x+':'+p.y,old=anchors.get(key);
  if(old)return old.pose.itemId===p.itemId&&old.pose.orientation===p.orientation&&old.factor===root.factor&&JSON.stringify(old.support)===JSON.stringify(root.support);
  anchors.set(key,root);combined.push(root);return true;
 }
 for(const root of roots)if(!append(root))return null;
 for(const root of roots){
  const def=defs.get(root.pose.itemId)?.get(root.factor);
  const pose=def?reflectedMixedRoot(root.pose,root.support,def,root.factor,axis):null;
  if(!pose||!append({...root,pose}))return null;
 }
 const items=combined.map(({pose,support})=>({itemId:pose.itemId,orientation:pose.orientation,dx:0,dy:0,support}));
 if(!mixedSceneSizeValid(items))return null;
 const q=groupAbsoluteCandidate(combined.map(r=>r.pose),grids,rasters,defs,mixedSceneCounts(items),objects,omitted);
 if(!q||q.rows.some((r,i)=>r.destination.factor!==combined[i].factor))return null;
 return {...q,supportRows:q.rows.map((r,i)=>({...r,...(combined[i].support?{scene:combined[i].support!}:{})}))};
}
