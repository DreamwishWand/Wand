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
 if(!valid(tree)||!tree.objects.length)throw Error('SCENE_PATH');
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
