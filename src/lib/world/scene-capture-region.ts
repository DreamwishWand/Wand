import {mainlandSavedInRect,type MainlandSavedObject} from './mainland-saved-objects.ts';
import {captureAreaPoses} from './area-scene.ts';
import {captureFurnitureGroup} from './group-placement.ts';
import {SCENE_FURNITURE_LIMIT} from './support-scene.ts';
export interface CaptureRegion {x:number;y:number;w:number;h:number}
export interface CaptureOptions {roads:boolean;fences:boolean}
const network=(p:MainlandSavedObject)=>p.object.layer==='ground'?'road':p.object.layer==='fence'?'fence':null;
export function captureRegionBounds(items:readonly MainlandSavedObject[]):CaptureRegion|null{
 if(!items.length||items.some(p=>!p.shape||![p.x*2,p.y*2].every(Number.isSafeInteger)))return null;
 const x=Math.floor(Math.min(...items.map(p=>p.x))*2)/2,y=Math.floor(Math.min(...items.map(p=>p.y-p.shape!.height/p.factor))*2)/2;
 const right=Math.ceil(Math.max(...items.map(p=>p.x+p.shape!.width/p.factor))*2)/2,top=Math.ceil(Math.max(...items.map(p=>p.y))*2)/2;
 return {x,y,w:right-x,h:top-y};
}
export function validCaptureRegion(r:CaptureRegion,extent:CaptureRegion){
 return [r.x,r.y,r.w,r.h].every(n=>Number.isSafeInteger(n*2))&&r.w>=.5&&r.h>=.5&&r.x>=extent.x&&r.y>=extent.y&&r.x+r.w<=extent.x+extent.w&&r.y+r.h<=extent.y+extent.h;
}
export function resizeCaptureRegion(r:CaptureRegion,extent:CaptureRegion,edge:'move'|'nw'|'ne'|'sw'|'se',dx:number,dy:number):CaptureRegion{
 dx=Math.round(dx*2)/2;dy=Math.round(dy*2)/2;
 const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
 if(edge==='move')return {...r,x:clamp(r.x+dx,extent.x,extent.x+extent.w-r.w),y:clamp(r.y+dy,extent.y,extent.y+extent.h-r.h)};
 // SVG Y increases down on screen; region uses the same numeric SVG axes.
 let l=r.x,b=r.y,h=r.y+r.h,t=r.x+r.w;
 if(edge.endsWith('w'))l=clamp(l+dx,extent.x,t-.5);else t=clamp(t+dx,l+.5,extent.x+extent.w);
 if(edge.startsWith('n'))b=clamp(b+dy,extent.y,h-.5);else h=clamp(h+dy,b+.5,extent.y+extent.h);
 return {x:l,y:b,w:t-l,h:h-b};
}
export function captureRegionPlan(region:CaptureRegion,selected:readonly MainlandSavedObject[],all:readonly MainlandSavedObject[],options:CaptureOptions,omitted=0,free=false){
 const selectedIds=new Set(selected.map(p=>p.object.localOrdinal));
 const relevant=all.filter(p=>{const kind=network(p);return kind==='road'?options.roads:kind==='fence'?options.fences:selectedIds.has(p.object.localOrdinal);});
 const intersects=mainlandSavedInRect(relevant,region,{x:region.x+region.w,y:region.y+region.h});
 const complete=(p:MainlandSavedObject)=>!!p.shape&&p.shape.runs.every(r=>p.x+r.x/p.factor>=region.x&&p.x+(r.x+r.width)/p.factor<=region.x+region.w&&p.y-(r.y+1)/p.factor>=region.y&&p.y-r.y/p.factor<=region.y+region.h);
 const items=intersects.filter(complete),partial=intersects.filter(p=>!complete(p));
 const ids=new Set(items.map(p=>p.object.localOrdinal));
 const roads=items.filter(p=>network(p)==='road'),fences=items.filter(p=>network(p)==='fence');
 // Mode is read by the existing WASM capture. Until then conservatively
 // include diagonal neighbors too, rather than silently sever a network.
 const outside=all.filter(p=>!ids.has(p.object.localOrdinal)&&((options.roads&&network(p)==='road'&&roads.some(q=>q.area===p.area&&q.object.localGridOrdinal===p.object.localGridOrdinal&&q.object.itemId===p.object.itemId&&Math.abs(q.x-p.x)<=2&&Math.abs(q.y-p.y)<=2))||(options.fences&&network(p)==='fence'&&fences.some(q=>q.area===p.area&&q.object.localGridOrdinal===p.object.localGridOrdinal&&Math.abs(q.x-p.x)<=8&&Math.abs(q.y-p.y)<=8))));
 const supported=!!captureFurnitureGroup(items,false,free)||!!captureAreaPoses(items)||!!captureFurnitureGroup(items,true)&&(!items.some(p=>p.object.subgrid)||items.length<=SCENE_FURNITURE_LIMIT);
 return {items,partial,outside,roads:roads.length,fences:fences.length,furniture:items.length-roads.length-fences.length,valid:supported&&!partial.length&&!outside.length&&(!(roads.length||fences.length)||omitted===0)};
}
export const captureRegionWords={
 ja:['取り込み範囲','道を含める','フェンスを含める','家具','道','フェンス','範囲をまたぐ物があります。範囲を広げるか、対象レイヤーを除外してください。','範囲内の形状または接続を確認できません。','保存','取消','中央をドラッグして移動・四隅で拡縮'],
 en:['Capture region','Include roads','Include fences','Furniture','Roads','Fences','Objects cross the region. Enlarge it or exclude the layer.','Shapes or connections cannot be verified.','Save','Cancel','Drag inside to move, corners to resize'],
 fr:['Zone de capture','Inclure les chemins','Inclure les clôtures','Meubles','Chemins','Clôtures','Des objets dépassent. Agrandissez la zone ou excluez le calque.','Formes ou connexions non vérifiées.','Enregistrer','Annuler','Glisser au centre ou aux coins'],
 it:['Area di acquisizione','Includi sentieri','Includi recinzioni','Mobili','Sentieri','Recinzioni','Oggetti oltre il bordo. Amplia l’area o escludi il livello.','Forme o connessioni non verificabili.','Salva','Annulla','Trascina al centro o agli angoli'],
 de:['Aufnahmebereich','Wege einschließen','Zäune einschließen','Möbel','Wege','Zäune','Objekte überschreiten den Bereich. Vergrößern oder Ebene ausschließen.','Formen oder Verbindungen nicht überprüfbar.','Speichern','Abbrechen','Innen ziehen, Ecken zum Skalieren'],
 'es-ES':['Área de captura','Incluir caminos','Incluir vallas','Muebles','Caminos','Vallas','Hay objetos fuera del área. Amplíala o excluye la capa.','Formas o conexiones no verificadas.','Guardar','Cancelar','Arrastra dentro o desde las esquinas'],
 'zh-CN':['捕获范围','包含道路','包含围栏','家具','道路','围栏','物品跨越范围。扩大范围或排除图层。','无法确认形状或连接。','保存','取消','拖动内部移动，拖动四角缩放'],
 'pt-BR':['Área de captura','Incluir caminhos','Incluir cercas','Móveis','Caminhos','Cercas','Objetos ultrapassam a área. Amplie ou exclua a camada.','Formas ou conexões não verificadas.','Salvar','Cancelar','Arraste o interior ou os cantos']
} as const;
