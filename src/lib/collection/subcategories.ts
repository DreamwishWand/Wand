import type {CollectionDb01Index} from './db01-native-facets.ts';
import type {CollectionTopCategory} from './category-hierarchy.ts';
import type {WorldBrowseScope} from './world-browse-index.ts';

export interface CollectionSubcategory {
  readonly key:string;readonly nativeType:string;readonly nativeName:string|null;
  readonly ids:readonly number[];readonly total:number;
}
/** Use the original furniture-kind tags for default furniture. Multiple
 * native tags may overlap; root membership is still counted exactly once.
 * Other types retain their native subtype, with no invented classification. */
export function collectionSubcategories(
  source:CollectionDb01Index,root:CollectionTopCategory,scope?:WorldBrowseScope
):readonly CollectionSubcategory[]{
  const groups=new Map<string,{key:string;nativeType:string;nativeName:string|null;ids:number[]}>();
  const add=(key:string,type:string,name:string|null,id:number)=>{
    const group=groups.get(key)??{key,nativeType:type,nativeName:name,ids:[]};
    group.ids.push(id);groups.set(key,group);
  };
  for(const id of source.itemsByRoot?.get(root)??[]){
    if(scope&&!scope.itemIdSet.has(id))continue;
    const type=source.nativeSubtypeByItem.get(id);if(!type)continue;
    const key=type.nativeType+':'+type.code;
    if(root==='furniture'&&key==='Furniture:0'){
      const kinds=new Set((source.byItem.get(id)??[]).filter(([facet])=>facet==='furnitureKind').map(([,tag])=>tag));
      if(kinds.size)for(const kind of kinds)add('furniture-kind:'+kind,'Furniture',kind,id);
      else add('furniture-kind:__unset__','Furniture',null,id);
    }else add(key,type.nativeType,type.nativeName,id);
  }
  return [...groups.values()].map(group=>({...group,total:group.ids.length})).sort((a,b)=>{
    const unset=(s:string)=>s.endsWith(':__unset__')?1:0;
    return unset(a.key)-unset(b.key)||a.key.localeCompare(b.key,'en',{numeric:true});
  });
}
const GROUPED_ROOTS=new Set<CollectionTopCategory>([
  'furniture','clothing','appearance','roads-fences','interior','buildings','environment',
  'characters','mounts','touch-of-magic','photo-mode','tools','upgrades'
]);
export function collectionUsesSubcategories(root:CollectionTopCategory,groups:readonly CollectionSubcategory[]):boolean{
  return GROUPED_ROOTS.has(root)&&groups.length>1;
}
const UNSET:Readonly<Record<string,string>>={ja:'種類未設定',en:'Type not specified',fr:'Type non spécifié',it:'Tipo non specificato',de:'Typ nicht angegeben','es-ES':'Tipo sin especificar','zh-CN':'未指定类型','pt-BR':'Tipo não especificado'};
export function collectionFurnitureKindLabel(locale:string,key:string):string|null{
  if(!key.startsWith('furniture-kind:'))return null;
  const tag=key.slice('furniture-kind:'.length);
  if(tag==='__unset__')return UNSET[locale]??UNSET.en;
  return tag.replace(/^(?:F_|C_)/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
}
