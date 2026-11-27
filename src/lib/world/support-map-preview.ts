import type {SupportParentWitness} from './indoor-support.ts';
import type {MapExtent} from './map-camera.ts';
import type {SupportTree} from './subgrid-local.ts';
export interface SupportMapParent extends SupportParentWitness{mapX:number;mapY:number;mapW:number;mapH:number;count?:number|null;selectable:boolean}
export interface SupportMapChild{itemId:number;index:number;nested:boolean;path:readonly number[]}
export type SupportMapContents=readonly SupportMapChild[]|null;
export function supportMapChildren(tree:SupportTree):SupportMapChild[]{return tree.objects.map((o,index)=>({itemId:o.itemId,index,nested:!!o.child,path:[index]}));}
export function supportMapDescendants(tree:SupportTree):SupportMapChild[]{
 const rows:SupportMapChild[]=[];
 function visit(t:SupportTree,parent:readonly number[]){for(const [index,o] of t.objects.entries()){const path=[...parent,index];rows.push({itemId:o.itemId,index,nested:!!o.child,path});if(o.child)visit(o.child,path);}}
 visit(tree,[]);return rows;
}
export function resolveSupportMapPath(root:SupportTree,path:readonly number[]){
 if(!path.length||path.length>9)return null;
 const stack=[root],owners:number[]=[],indices:number[]=[];let tree=root;
 for(const [i,index] of path.entries()){if(!Number.isSafeInteger(index)||index<0||!tree.objects[index])return null;const o=tree.objects[index];if(i===path.length-1)return {stack,owners,indices,selected:index};if(!o.child)return null;indices.push(index);owners.push(o.itemId);tree=o.child;stack.push(tree);}
 return null;
}
export function supportMapSearch(parents:readonly SupportMapParent[],cache:ReadonlyMap<string,SupportMapContents>,names:ReadonlyMap<number,string>,query:string){
 const norm=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim(),terms=norm(query).split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 return parents.flatMap(parent=>(cache.get(supportMapWitnessKey(parent))??[]).filter(c=>{const name=names.get(c.itemId);return !!name&&terms.every(term=>norm(name).includes(term));}).map(child=>({parent,child})));
}

export function supportMapWitnessKey(p:SupportParentWitness){return [p.localOrdinal,p.itemId,p.x,p.y].join(':');}
export function visibleSupportParents(parents:readonly SupportMapParent[],view:MapExtent){
 return parents.filter(p=>p.mapX+p.mapW>=view.x&&p.mapX<=view.x+view.w&&p.mapY+p.mapH>=view.y&&p.mapY<=view.y+view.h);
}
export function supportMapReceipts(value:unknown,parents:readonly SupportParentWitness[]):Map<string,SupportMapContents>{
 if(!value||typeof value!=='object'||(value as {kind?:unknown}).kind!=='support-map')throw Error('SUPPORT_MAP');
 const rows=(value as {results?:unknown}).results;if(!Array.isArray(rows)||rows.length!==parents.length)throw Error('SUPPORT_MAP');
 const out=new Map<string,SupportMapContents>();
 for(const p of parents){const found=rows.filter(r=>r?.localOrdinal===p.localOrdinal);if(found.length!==1)throw Error('SUPPORT_MAP_IDENTITY');const raw=found[0].children;
  if(raw!==null&&(!Array.isArray(raw)||raw.length>512||raw.some(o=>!o||Object.keys(o).length!==4||!Number.isSafeInteger(o.itemId)||o.itemId<1||o.itemId>0xffffffff||!Array.isArray(o.path)||o.path.length<1||o.path.length>9||o.path.some((i:unknown)=>typeof i!=='number'||!Number.isSafeInteger(i)||i<0||i>=512)||o.index!==o.path[o.path.length-1]||typeof o.nested!=='boolean')))throw Error('SUPPORT_MAP_CHILD');
  if(raw){const seen=new Map<string,boolean>();for(const c of raw){const key=c.path.join('.'),parent=c.path.slice(0,-1).join('.');if(seen.has(key)||parent&&!seen.get(parent))throw Error('SUPPORT_MAP_PATH');seen.set(key,c.nested);}}
  out.set(supportMapWitnessKey(p),raw);
 }return out;
}
export function supportMarkerHit(target:EventTarget|null):{ordinal:number;child:number|null}|null{
 if(!(target instanceof Element))return null;const el=target.closest('[data-support-map-parent]');if(!el)return null;
 const ordinal=Number(el.getAttribute('data-support-map-parent')),raw=el.getAttribute('data-support-map-child'),child=raw===null?null:Number(raw);
 return Number.isSafeInteger(ordinal)&&ordinal>0&&(child===null||Number.isSafeInteger(child)&&child>=0&&child<512)?{ordinal,child}:null;
}
export const supportMapWords={ja:['支持面の小物','小物の一覧（模式表示）'],en:['Items on support','Contents (schematic preview)'],fr:['Objets sur le support','Contenu (aperçu schématique)'],it:['Oggetti sul supporto','Contenuto (anteprima schematica)'],de:['Objekte auf der Auflage','Inhalt (schematische Vorschau)'],'es-ES':['Objetos en soporte','Contenido (vista esquemática)'],'zh-CN':['支撑面摆件','内容（示意预览）'],'pt-BR':['Objetos no apoio','Conteúdo (prévia esquemática)']} as const;

export const supportSearchWords={ja:['支持面の小物を検索中','一部の支持面を確認できません','小物'],en:['Searching support contents','Some supports could not be read','Contents'],fr:['Recherche des objets sur support','Certains supports sont indisponibles','Objets'],it:['Ricerca oggetti sui supporti','Alcuni supporti non sono leggibili','Oggetti'],de:['Objekte auf Auflagen suchen','Einige Auflagen sind nicht lesbar','Inhalt'],'es-ES':['Buscando objetos en soportes','No se pudieron leer algunos soportes','Objetos'],'zh-CN':['正在搜索支撑面摆件','部分支撑面无法读取','摆件'],'pt-BR':['Buscando objetos nos apoios','Alguns apoios não puderam ser lidos','Objetos']} as const;
