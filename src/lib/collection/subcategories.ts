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
// UI fallback for the 27 observed original furniture-kind keys; original
// localized Tag names take precedence whenever the source contains them.
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const KIND_LABELS:Readonly<Record<string,readonly string[]>>={
  "Essential": [
    "必需品",
    "Essentials",
    "Essentiels",
    "Essenziali",
    "Grundausstattung",
    "Esenciales",
    "必需品",
    "Essenciais"
  ],
  "Storage": [
    "収納",
    "Storage",
    "Rangement",
    "Contenitori",
    "Aufbewahrung",
    "Almacenamiento",
    "储物",
    "Armazenamento"
  ],
  "Decor": [
    "装飾",
    "Decor",
    "Décoration",
    "Decorazioni",
    "Dekoration",
    "Decoración",
    "装饰",
    "Decoração"
  ],
  "Misc": [
    "その他の家具",
    "Miscellaneous",
    "Divers",
    "Varie",
    "Sonstiges",
    "Varios",
    "杂项",
    "Diversos"
  ],
  "Seating": [
    "座席",
    "Seating",
    "Sièges",
    "Sedute",
    "Sitzmöbel",
    "Asientos",
    "座椅",
    "Assentos"
  ],
  "Wall": [
    "壁面家具",
    "Wall furniture",
    "Meubles muraux",
    "Mobili da parete",
    "Wandmöbel",
    "Muebles de pared",
    "墙面家具",
    "Móveis de parede"
  ],
  "Appliance": [
    "家電",
    "Appliances",
    "Électroménager",
    "Elettrodomestici",
    "Haushaltsgeräte",
    "Electrodomésticos",
    "家电",
    "Eletrodomésticos"
  ],
  "Lighting": [
    "照明",
    "Lighting",
    "Éclairage",
    "Illuminazione",
    "Beleuchtung",
    "Iluminación",
    "照明",
    "Iluminação"
  ],
  "Table": [
    "テーブル",
    "Tables",
    "Tables",
    "Tavoli",
    "Tische",
    "Mesas",
    "桌子",
    "Mesas"
  ],
  "Art": [
    "アート",
    "Art",
    "Art",
    "Arte",
    "Kunst",
    "Arte",
    "艺术",
    "Arte"
  ],
  "Bed": [
    "ベッド",
    "Beds",
    "Lits",
    "Letti",
    "Betten",
    "Camas",
    "床",
    "Camas"
  ],
  "Rug": [
    "ラグ",
    "Rugs",
    "Tapis",
    "Tappeti",
    "Teppiche",
    "Alfombras",
    "地毯",
    "Tapetes"
  ],
  "Utility": [
    "機能家具",
    "Utility",
    "Utilitaires",
    "Utilità",
    "Nutzmöbel",
    "Utilidad",
    "功能家具",
    "Utilidades"
  ],
  "Foliage": [
    "植物",
    "Foliage",
    "Végétation",
    "Vegetazione",
    "Pflanzen",
    "Vegetación",
    "植物",
    "Vegetação"
  ],
  "Electronic": [
    "電子機器",
    "Electronics",
    "Électronique",
    "Elettronica",
    "Elektronik",
    "Electrónica",
    "电子设备",
    "Eletrônicos"
  ],
  "Trimming": [
    "内装材",
    "Trimming",
    "Revêtements",
    "Rivestimenti",
    "Verkleidungen",
    "Revestimientos",
    "饰面",
    "Revestimentos"
  ],
  "Window": [
    "窓",
    "Windows",
    "Fenêtres",
    "Finestre",
    "Fenster",
    "Ventanas",
    "窗户",
    "Janelas"
  ],
  "CeilingDecoration": [
    "天井装飾",
    "Ceiling decorations",
    "Décorations de plafond",
    "Decorazioni da soffitto",
    "Deckendekoration",
    "Decoración de techo",
    "天花板装饰",
    "Decoração de teto"
  ],
  "Landscaping": [
    "景観",
    "Landscaping",
    "Paysage",
    "Paesaggio",
    "Landschaft",
    "Paisajismo",
    "景观",
    "Paisagismo"
  ],
  "Pathing": [
    "道",
    "Paths",
    "Chemins",
    "Sentieri",
    "Wege",
    "Caminos",
    "道路",
    "Caminhos"
  ],
  "Rocks": [
    "岩",
    "Rocks",
    "Rochers",
    "Rocce",
    "Felsen",
    "Rocas",
    "岩石",
    "Rochas"
  ],
  "Trees": [
    "木",
    "Trees",
    "Arbres",
    "Alberi",
    "Bäume",
    "Árboles",
    "树木",
    "Árvores"
  ],
  "Ride": [
    "乗り物",
    "Rides",
    "Manèges",
    "Attrazioni",
    "Fahrgeschäfte",
    "Atracciones",
    "游乐设施",
    "Atrações"
  ],
  "Underbrush": [
    "下草",
    "Underbrush",
    "Sous-bois",
    "Sottobosco",
    "Unterholz",
    "Maleza",
    "灌木丛",
    "Vegetação rasteira"
  ],
  "Fencing": [
    "フェンス",
    "Fences",
    "Clôtures",
    "Recinzioni",
    "Zäune",
    "Vallas",
    "围栏",
    "Cercas"
  ],
  "Door": [
    "ドア",
    "Doors",
    "Portes",
    "Porte",
    "Türen",
    "Puertas",
    "门",
    "Portas"
  ],
  "Floor": [
    "床",
    "Floor",
    "Sol",
    "Pavimento",
    "Boden",
    "Suelo",
    "地面",
    "Piso"
  ]
};
const UNSET:Readonly<Record<string,string>>={ja:'種類未設定',en:'Type not specified',fr:'Type non spécifié',it:'Tipo non specificato',de:'Typ nicht angegeben','es-ES':'Tipo sin especificar','zh-CN':'未指定类型','pt-BR':'Tipo não especificado'};
export function collectionFurnitureKindLabel(locale:string,key:string,source?:CollectionDb01Index|null):string|null{
  if(!key.startsWith('furniture-kind:'))return null;
  const tag=key.slice('furniture-kind:'.length);
  if(tag==='__unset__')return UNSET[locale]??UNSET.en;
  const names=source?.furnitureKindLabels?.get(tag);
  return names?.[locale]??KIND_LABELS[tag]?.[LOCALES.indexOf(locale)]??names?.en??KIND_LABELS[tag]?.[1]??tag.replace(/^(?:F_|C_)/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
}
