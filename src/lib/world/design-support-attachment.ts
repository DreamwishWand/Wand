/** Per-instance, local-only attachments. A design-only surface is never
 * promoted to a native support factor without a matching native witness. */
import {captureSupportScene,parseSupportScene,supportSceneRootCounts,mixedSceneFromClip,type SupportScene,type MixedScenePreset} from './support-scene.ts';
import {captureScene,type ScenePreset} from './scene-preset.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import type {RoomDesignTemplate} from './room-design.ts';
import {currentDesign,type DesignPlacement,type DesignClipItem,type DesignTimeline,type DesignItemGeometry} from './design-layout.ts';
export interface DesignSupportAttachment{scene:SupportScene;designOnly:boolean}
export function readDesignAttachment(value:unknown,itemId:number,roomRoot:boolean):DesignSupportAttachment|undefined{
 if(!value||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,'attachment'))return undefined;
 const a=(value as {attachment:unknown}).attachment;
 if(!roomRoot||!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==2||typeof (a as DesignSupportAttachment).designOnly!=='boolean')throw Error('DESIGN_SUPPORT');
 const scene=parseSupportScene(JSON.stringify((a as DesignSupportAttachment).scene)),designOnly=(a as DesignSupportAttachment).designOnly;
 if(scene.ownerItemId!==itemId||[...supportSceneRootCounts(scene).values()].reduce((x,y)=>x+y,0)>32||designOnly&&scene.tree.factor!==2)throw Error('DESIGN_SUPPORT_OWNER');
 return {scene,designOnly};
}
export function designAttachments(rows:readonly {attachment?:DesignSupportAttachment}[]):DesignSupportAttachment[]{
 const unique=new Map<string,DesignSupportAttachment>();for(const p of rows)if(p.attachment)unique.set(JSON.stringify(p.attachment),p.attachment);return [...unique.values()];
}
export function countAttachedDesign(rows:readonly {itemId:number;attachment?:DesignSupportAttachment}[]):Map<number,number>{
 const out=new Map<number,number>();for(const p of rows){const counts=p.attachment?supportSceneRootCounts(p.attachment.scene):new Map([[p.itemId,1]]);for(const [id,n] of counts)out.set(id,(out.get(id)??0)+n);}return out;
}
export function captureAttachedRoomScene(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,factor:1|2):ScenePreset|MixedScenePreset|null{
 const rows=currentDesign(t).filter(p=>ids.includes(p.id));if(!rows.length||rows.length!==new Set(ids).size||new Set(ids).size!==ids.length)return null;
 if(rows.some(p=>defs.get(p.itemId)?.supportPath&&!p.attachment||p.attachment?.designOnly))return null;
 if(!rows.some(p=>p.attachment))return captureScene(t,ids,defs,factor);
 if(factor!==2||rows.length>128)return null;
 const x=Math.min(...rows.map(p=>p.x)),y=Math.min(...rows.map(p=>p.y));
 try{return mixedSceneFromClip(rows.map(p=>({itemId:p.itemId,dx:p.x-x,dy:p.y-y,orientation:p.orientation})),rows.map(p=>p.attachment?.scene??null),'center');}catch{return null;}
}
export const attachedDesignWords={ja:['小物配置を取り込む','支持面の小物配置','小物を外す','支持面の実解像度が未確認です。設計ファイルに保存してください。','支持家具に対応するSceneを選択','小物付き家具は点対称のみ対応しています。','配置する家具を選択してください。'],en:['Import support arrangement','Items on support','Remove arrangement','Native support resolution is unverified. Save the design file.','Choose a matching support Scene','Decorated supports currently support point symmetry only.','Select placed furniture.'],fr:['Importer une disposition','Objets sur le support','Retirer la disposition','Résolution native non vérifiée. Enregistrez le projet.','Choisir une scène compatible','Seule la symétrie centrale est disponible pour les supports décorés.','Sélectionnez un meuble.'],it:['Importa disposizione','Oggetti sul supporto','Rimuovi disposizione','Risoluzione nativa non verificata. Salva il progetto.','Scegli una scena compatibile','Per i supporti decorati è disponibile solo la simmetria centrale.','Seleziona un mobile.'],de:['Anordnung importieren','Objekte auf der Auflage','Anordnung entfernen','Native Auflösung ungeprüft. Entwurf speichern.','Passende Szene wählen','Für dekorierte Auflagen wird nur Punktsymmetrie unterstützt.','Möbel auswählen.'],'es-ES':['Importar disposición','Objetos en soporte','Quitar disposición','Resolución nativa sin verificar. Guarda el diseño.','Elegir escena compatible','Los soportes decorados solo admiten simetría central.','Selecciona un mueble.'],'zh-CN':['导入小物布局','支撑面物品','移除布局','原生分辨率未验证，请保存设计文件。','选择匹配的场景','带摆件的家具仅支持中心对称。','选择已放置家具。'],'pt-BR':['Importar disposição','Itens no apoio','Remover disposição','Resolução nativa não verificada. Salve o projeto.','Escolher cena compatível','Apoios decorados aceitam apenas simetria central.','Selecione um móvel.']} as const;

export interface EmbeddedSupportDesign{start:DesignTimeline;definitions:ReadonlyMap<number,DesignItemGeometry>;onChange:(next:DesignTimeline,definitions:ReadonlyMap<number,DesignItemGeometry>,finish:number)=>void;room?:true;finish?:number;onBusy?:(busy:boolean)=>void}
/** A leaf-only attachment can be edited with the same root-placement engine.
 * Nested arrangements are retained by the parent and not flattened. */
export function supportEditTimeline(a:DesignSupportAttachment|undefined,template:RoomDesignTemplate):DesignTimeline|null{
 if(template.kind!=='support'||!template.ownerItemId)return null;
 if(!a)return {snapshots:[[]],cursor:0,nextId:1};
 if(a.scene.ownerItemId!==template.ownerItemId||a.scene.tree.sourcePath!==template.grid.gridDataPath||a.scene.tree.factor!==template.grid.factor||a.scene.tree.objects.length>31||a.scene.tree.objects.some(o=>!!o.child))return null;
 const rows:DesignPlacement[]=[];
 for(const o of a.scene.tree.objects){const orientation=CARDINAL_ORIENTATIONS.indexOf(o.orientation as typeof CARDINAL_ORIENTATIONS[number]);if(orientation<0)return null;rows.push({id:rows.length+1,itemId:o.itemId,x:o.x,y:o.y,orientation});}
 return {snapshots:[rows],cursor:0,nextId:rows.length+1};
}
export function supportEditAttachment(t:DesignTimeline,template:RoomDesignTemplate,initial:DesignSupportAttachment|undefined):DesignSupportAttachment|null{
 const start=supportEditTimeline(initial,template),rows=currentDesign(t);
 if(!start||!template.ownerItemId||rows.length>31||rows.some(p=>p.attachment||!CARDINAL_ORIENTATIONS[p.orientation]))return null;
 const scene=captureSupportScene(template.ownerItemId,{factor:template.grid.factor,sourcePath:template.grid.gridDataPath,objects:rows.map(p=>({itemId:p.itemId,x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation],child:null}))});
 return scene?{scene,designOnly:initial?.designOnly??true}:null;
}
export const supportDirectWords={ja:['小物を編集','支持面に適用','戻る','編集中の小物配置を破棄しますか？','入れ子の支持面は保持しますが直接編集は未対応です。','支持面を読み込めません。','最大31個の小物を配置できます。'],en:['Edit items on support','Apply arrangement','Back','Discard the current arrangement edits?','Nested supports are preserved but cannot be edited here.','Unable to open support surface.','Up to 31 items on this support.'],fr:['Modifier les objets','Appliquer','Retour','Abandonner les modifications ?','Les supports imbriqués sont conservés mais non modifiables ici.','Support indisponible.','31 objets maximum.'],it:['Modifica oggetti','Applica','Indietro','Annullare le modifiche?','I supporti annidati vengono conservati ma non sono modificabili qui.','Supporto non disponibile.','Massimo 31 oggetti.'],de:['Objekte bearbeiten','Anordnung anwenden','Zurück','Änderungen verwerfen?','Verschachtelte Auflagen bleiben erhalten, sind hier aber nicht editierbar.','Auflage nicht verfügbar.','Maximal 31 Objekte.'],'es-ES':['Editar objetos','Aplicar disposición','Volver','¿Descartar los cambios?','Los soportes anidados se conservan pero no se editan aquí.','Soporte no disponible.','Hasta 31 objetos.'],'zh-CN':['编辑摆件','应用布局','返回','丢弃当前编辑？','保留嵌套支撑面，但暂不能在此编辑。','无法打开支撑面。','最多31个摆件。'],'pt-BR':['Editar objetos','Aplicar disposição','Voltar','Descartar alterações?','Apoios aninhados são preservados, mas não editáveis aqui.','Apoio indisponível.','Até 31 objetos.']} as const;
