import type {SupportParentWitness} from './indoor-support.ts';
import type {MapExtent} from './map-camera.ts';
import type {SupportTree} from './subgrid-local.ts';
export interface SupportMapParent extends SupportParentWitness{mapX:number;mapY:number;mapW:number;mapH:number;count?:number|null;selectable:boolean}
export interface SupportMapChild{itemId:number;index:number;nested:boolean}
export type SupportMapContents=readonly SupportMapChild[]|null;
export function supportMapChildren(tree:SupportTree):SupportMapChild[]{return tree.objects.map((o,index)=>({itemId:o.itemId,index,nested:!!o.child}));}
export function supportMapWitnessKey(p:SupportParentWitness){return [p.localOrdinal,p.itemId,p.x,p.y].join(':');}
export function visibleSupportParents(parents:readonly SupportMapParent[],view:MapExtent){
 return parents.filter(p=>p.mapX+p.mapW>=view.x&&p.mapX<=view.x+view.w&&p.mapY+p.mapH>=view.y&&p.mapY<=view.y+view.h);
}
export function supportMapReceipts(value:unknown,parents:readonly SupportParentWitness[]):Map<string,SupportMapContents>{
 if(!value||typeof value!=='object'||(value as {kind?:unknown}).kind!=='support-map')throw Error('SUPPORT_MAP');
 const rows=(value as {results?:unknown}).results;if(!Array.isArray(rows)||rows.length!==parents.length)throw Error('SUPPORT_MAP');
 const out=new Map<string,SupportMapContents>();
 for(const p of parents){const found=rows.filter(r=>r?.localOrdinal===p.localOrdinal);if(found.length!==1)throw Error('SUPPORT_MAP_IDENTITY');const raw=found[0].children;
  if(raw!==null&&(!Array.isArray(raw)||raw.length>512||raw.some((o,i)=>!o||Object.keys(o).length!==3||!Number.isSafeInteger(o.itemId)||o.itemId<1||o.itemId>0xffffffff||o.index!==i||typeof o.nested!=='boolean')))throw Error('SUPPORT_MAP_CHILD');
  out.set(supportMapWitnessKey(p),raw);
 }return out;
}
export function supportMarkerHit(target:EventTarget|null):{ordinal:number;child:number|null}|null{
 if(!(target instanceof Element))return null;const el=target.closest('[data-support-map-parent]');if(!el)return null;
 const ordinal=Number(el.getAttribute('data-support-map-parent')),raw=el.getAttribute('data-support-map-child'),child=raw===null?null:Number(raw);
 return Number.isSafeInteger(ordinal)&&ordinal>0&&(child===null||Number.isSafeInteger(child)&&child>=0&&child<512)?{ordinal,child}:null;
}
export const supportMapWords={ja:['支持面の小物','小物の一覧（模式表示）'],en:['Items on support','Contents (schematic preview)'],fr:['Objets sur le support','Contenu (aperçu schématique)'],it:['Oggetti sul supporto','Contenuto (anteprima schematica)'],de:['Objekte auf der Auflage','Inhalt (schematische Vorschau)'],'es-ES':['Objetos en soporte','Contenido (vista esquemática)'],'zh-CN':['支撑面摆件','内容（示意预览）'],'pt-BR':['Objetos no apoio','Conteúdo (prévia esquemática)']} as const;
