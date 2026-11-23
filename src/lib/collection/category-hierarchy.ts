/** Wand's presentation hierarchy. Native type/subtype and Item IDs remain
 * unchanged; these groups are not game Collection membership. */
export const COLLECTION_TOP_CATEGORIES=[
  {id:'furniture',icon:'chair',keys:['Furniture:0','Furniture:3','Furniture:8','Furniture:9'],
    names:['家具','Furniture','Meubles','Mobili','Möbel','Muebles','家具','Móveis']},
  {id:'outdoor',icon:'plant',keys:['Furniture:1','Furniture:2','Furniture:6','Furniture:7'],
    names:['景観・屋外','Landscaping & outdoors','Paysage et extérieur','Paesaggio ed esterni','Landschaft & Außenbereich','Paisaje y exteriores','景观与户外','Paisagem e exterior']},
  {id:'interior',icon:'home',keys:['Trimming:0','Trimming:1'],
    names:['壁紙・床材','Wallpaper & flooring','Papiers peints et sols','Pareti e pavimenti','Tapeten & Böden','Papel pintado y suelos','壁纸与地板','Papéis de parede e pisos']},
  {id:'clothing',icon:'shirt',keys:[0,1,2,3,4,6,7,8,9,10,11,12,13,14,15].map(code=>'Clothing:'+code),
    names:['衣装','Clothing','Vêtements','Abbigliamento','Kleidung','Ropa','服装','Roupas']},
  {id:'appearance',icon:'character',keys:[5,16,17,18,19,20,21,22,23].map(code=>'Clothing:'+code),
    names:['外見','Appearance','Apparence','Aspetto','Aussehen','Apariencia','外观','Aparência']},
  {id:'food',icon:'cooking',keys:['ActivityItem:2','ActivityItem:11','ActivityItem:3'],
    names:['食材・料理','Ingredients & meals','Ingrédients et plats','Ingredienti e piatti','Zutaten & Gerichte','Ingredientes y platos','食材与料理','Ingredientes e refeições']},
  {id:'materials',icon:'plant',keys:['ActivityItem:4','ActivityItem:8','ActivityItem:10','ActivityItem:16','ActivityItem:17'],
    names:['採集・素材','Gathering & materials','Collecte et matériaux','Raccolta e materiali','Sammeln & Materialien','Recolección y materiales','采集与材料','Coleta e materiais']},
  {id:'consumables',icon:'sparkles',keys:['ActivityItem:15','ActivityItem:18'],
    names:['消耗品','Consumables','Consommables','Consumabili','Verbrauchsgegenstände','Consumibles','消耗品','Consumíveis']},
  {id:'quests',icon:'puzzle',keys:['ActivityItem:12','Furniture:5'],
    names:['クエスト関連','Quest items','Objets de quête','Oggetti di missione','Questgegenstände','Objetos de misión','任务物品','Itens de missão']},
  {id:'other',icon:'collection',keys:['ActivityItem:0','ActivityItem:13','ActivityItem:14','ActivityItem:19'],
    names:['その他','Other','Autres','Altro','Sonstige','Otros','其他','Outros']}
] as const;
export type CollectionTopCategory=typeof COLLECTION_TOP_CATEGORIES[number]['id'];
const locales=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const byKey=new Map<string,CollectionTopCategory>();
for(const group of COLLECTION_TOP_CATEGORIES)
  for(const key of group.keys)byKey.set(key,group.id);
export function collectionTopCategory(key:string):CollectionTopCategory{
  return byKey.get(key)??'other';
}
export function collectionTopCategoryLabel(locale:string,id:CollectionTopCategory):string{
  const group=COLLECTION_TOP_CATEGORIES.find(row=>row.id===id)!;
  return group.names[locales.indexOf(locale)]??group.names[1];
}
export function collectionTopCategoryRank(id:CollectionTopCategory):number{
  return COLLECTION_TOP_CATEGORIES.findIndex(row=>row.id===id);
}
export function collectionTopCategoryCards(
  rows:readonly {key:string;total:number;owned:number}[]
):readonly {id:CollectionTopCategory;icon:string;total:number;owned:number}[]{
  const counts=new Map<CollectionTopCategory,{total:number;owned:number}>();
  for(const row of rows){
    const id=collectionTopCategory(row.key);
    const count=counts.get(id)??{total:0,owned:0};
    count.total+=row.total;count.owned+=row.owned;counts.set(id,count);
  }
  return COLLECTION_TOP_CATEGORIES.flatMap(({id,icon})=>{
    const count=counts.get(id);
    return count?.total?[{id,icon,...count}]:[];
  });
}
