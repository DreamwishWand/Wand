/** Per-instance, local-only attachments. A design-only surface is never
 * promoted to a native support factor without a matching native witness. */
import {parseSupportScene,supportSceneRootCounts,mixedSceneFromClip,type SupportScene,type MixedScenePreset} from './support-scene.ts';
import {captureScene,type ScenePreset} from './scene-preset.ts';
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
export const attachedDesignWords={ja:['小物配置を取り込む','支持面の小物配置','小物を外す','支持面の実解像度が未確認です。設計ファイルに保存してください。','支持家具に対応するSceneを選択','小物付き家具の対称操作は現在非対応です。','配置する家具を選択してください。'],en:['Import support arrangement','Items on support','Remove arrangement','Native support resolution is unverified. Save the design file.','Choose a matching support Scene','Symmetry of decorated supports is not yet supported.','Select placed furniture.'],fr:['Importer une disposition','Objets sur le support','Retirer la disposition','Résolution native non vérifiée. Enregistrez le projet.','Choisir une scène compatible','Symétrie des supports décorés non disponible.','Sélectionnez un meuble.'],it:['Importa disposizione','Oggetti sul supporto','Rimuovi disposizione','Risoluzione nativa non verificata. Salva il progetto.','Scegli una scena compatibile','Simmetria dei supporti decorati non disponibile.','Seleziona un mobile.'],de:['Anordnung importieren','Objekte auf der Auflage','Anordnung entfernen','Native Auflösung ungeprüft. Entwurf speichern.','Passende Szene wählen','Symmetrie dekorierter Auflagen noch nicht unterstützt.','Möbel auswählen.'],'es-ES':['Importar disposición','Objetos en soporte','Quitar disposición','Resolución nativa sin verificar. Guarda el diseño.','Elegir escena compatible','Simetría de soportes decorados no disponible.','Selecciona un mueble.'],'zh-CN':['导入小物布局','支撑面物品','移除布局','原生分辨率未验证，请保存设计文件。','选择匹配的场景','暂不支持带摆件家具的对称操作。','选择已放置家具。'],'pt-BR':['Importar disposição','Itens no apoio','Remover disposição','Resolução nativa não verificada. Salve o projeto.','Escolher cena compatível','Simetria de apoios decorados não disponível.','Selecione um móvel.']} as const;
