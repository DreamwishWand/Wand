import {designClipboard,DESIGN_LIMIT,DESIGN_FILE_LIMIT,type DesignTimeline,type DesignClipItem,type DesignItemGeometry} from './design-layout.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
export interface ScenePreset{schema:'wand.preset.scene@1';gameVersion:'1.26.2';factor:1|2;anchor:'corner'|'center';items:DesignClipItem[]}
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function sceneBounds(items:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>){
 if(!items.length||items.length>DESIGN_LIMIT)return null;let width=0,height=0;
 for(const p of items){const g=defs.get(p.itemId),s=g?.shapes[p.itemId+':'+p.orientation*4];if(!g||!s||!int(p.dx,0,131072)||!int(p.dy,0,131072)||!int(p.orientation,0,3)||!s.cellCount||!['furniture','landscape'].includes(g.layer)||nativeActionBlocked(g.editRestrictions,'select')||exclusiveAnchorClass(String(p.itemId)))return null;width=Math.max(width,p.dx+s.width);height=Math.max(height,p.dy+s.height);}return {width,height};
}
export function sceneOrigin(p:{x:number;y:number},anchor:ScenePreset['anchor'],items:readonly DesignClipItem[],defs:ReadonlyMap<number,DesignItemGeometry>){const b=sceneBounds(items,defs);return !b?null:anchor==='center'?{x:p.x-Math.floor((b.width-1)/2),y:p.y-Math.floor((b.height-1)/2)}:p;}
export function captureScene(t:DesignTimeline,ids:readonly number[],defs:ReadonlyMap<number,DesignItemGeometry>,factor:1|2):ScenePreset|null{if(!ids.length||ids.length>DESIGN_LIMIT||new Set(ids).size!==ids.length)return null;const items=designClipboard(t,ids);return items.length===ids.length&&!items.some(p=>p.attachment)&&sceneBounds(items,defs)?{schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor,anchor:'center',items}:null;}
export function parseScene(text:string,factor:1|2):ScenePreset{
 if(text.length>DESIGN_FILE_LIMIT)throw Error('SCENE_LIMIT');const v:unknown=JSON.parse(text);
 if(!rec(v)||Object.keys(v).length!==5||v.schema!=='wand.preset.scene@1'||v.gameVersion!=='1.26.2'||v.factor!==factor||(v.anchor!=='corner'&&v.anchor!=='center')||!Array.isArray(v.items)||!v.items.length||v.items.length>DESIGN_LIMIT)throw Error('SCENE_INVALID');
 const items:DesignClipItem[]=v.items.map(p=>{if(!rec(p)||Object.keys(p).length!==4||!int(p.itemId,1,0xffffffff)||!int(p.dx,0,131072)||!int(p.dy,0,131072)||!int(p.orientation,0,3)||exclusiveAnchorClass(String(p.itemId)))throw Error('SCENE_ITEM_INVALID');return {itemId:p.itemId,dx:p.dx,dy:p.dy,orientation:p.orientation};});
 if(Math.min(...items.map(p=>p.dx))!==0||Math.min(...items.map(p=>p.dy))!==0)throw Error('SCENE_ORIGIN');return {schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor,anchor:v.anchor,items};
}
/** The existing Wand Scene format is shared with Save editing. Convert
 * physical relative coordinates exactly; never round a half-cell offset. */
export function convertSceneFactor(scene:ScenePreset,factor:1|2):ScenePreset|null{
 if(scene.factor===factor)return scene;
 const scale=factor/scene.factor;
 const items=scene.items.map(p=>({...p,dx:p.dx*scale,dy:p.dy*scale}));
 if(items.some(p=>!int(p.dx,0,131072)||!int(p.dy,0,131072)))return null;
 return {...scene,factor,items};
}
export function parseSceneAnyFactor(text:string):ScenePreset{
 // Both supported factors use the same strict parser and size limits.
 try{return parseScene(text,1);}catch{return parseScene(text,2);}
}
export function sceneFromClip(items:readonly DesignClipItem[],factor:1|2,anchor:ScenePreset['anchor']='center'):ScenePreset{
 return parseScene(JSON.stringify({schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor,anchor,items}),factor);
}
export const sceneWords={ja:['Sceneを保存','Sceneを配置','中心','角','取消','未対応のSceneです。道・フェンス・支持面は現在非対応。','配置基準を選択'],en:['Save Scene','Place Scene','Center','Corner','Cancel','Unsupported Scene. Roads, fences and support surfaces are not supported yet.','Choose an anchor'],fr:['Enregistrer la scène','Placer la scène','Centre','Coin','Annuler','Scène incompatible.','Choisir le point'],it:['Salva scena','Posiziona scena','Centro','Angolo','Annulla','Scena non supportata.','Scegli il punto'],de:['Szene speichern','Szene platzieren','Mitte','Ecke','Abbrechen','Szene nicht unterstützt.','Anker wählen'],'es-ES':['Guardar escena','Colocar escena','Centro','Esquina','Cancelar','Escena no compatible.','Elegir ancla'],'zh-CN':['保存场景','放置场景','中心','角落','取消','不支持此场景。','选择锚点'],'pt-BR':['Salvar cena','Posicionar cena','Centro','Canto','Cancelar','Cena incompatível.','Escolher âncora']} as const;

export function sceneItemCounts(items:readonly DesignClipItem[]){const counts=new Map<number,number>();for(const p of items)counts.set(p.itemId,(counts.get(p.itemId)??0)+1);return counts;}
