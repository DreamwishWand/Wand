/** Owner-approved 2026-10-04 Collection contract COL-UX-02/17,
 * reinstated 2026-11-24. The keys are presentation mappings, not proof of
 * native Collection membership. Unbound source types never become invented
 * root categories. Unbound roots remain disabled until item evidence exists. */
export const COLLECTION_TOP_CATEGORIES=[
  {id:"furniture",icon:"chair",keys:["Furniture:0","Furniture:3","Furniture:8","Furniture:9"],names:["家具","Furniture","Meubles","Mobili","Möbel","Muebles","家具","Móveis"]},
  {id:"landscaping",icon:"plant",keys:["Furniture:2"],names:["景観","Landscaping","Aménagement paysager","Paesaggistica","Landschaftsgestaltung","Paisajismo","景观","Paisagismo"]},
  {id:"roads-fences",icon:"plant",keys:["Furniture:1","Furniture:7"],names:["道・フェンス","Roads & Fences","Routes et clôtures","Strade e recinzioni","Wege & Zäune","Caminos y vallas","道路与围栏","Caminhos e cercas"]},
  {id:"interior",icon:"home",keys:["Trimming:0","Trimming:1"],names:["壁紙・床材","Wallpaper & Flooring","Papiers peints et sols","Pareti e pavimenti","Tapeten & Böden","Papel pintado y suelos","壁纸与地板","Papéis de parede e pisos"]},
  {id:"buildings",icon:"home",keys:[],names:["建物","Buildings","Bâtiments","Edifici","Gebäude","Edificios","建筑","Construções"]},
  {id:"environment",icon:"sparkles",keys:[],names:["環境エフェクト","Environment Effects","Effets environnementaux","Effetti ambientali","Umgebungseffekte","Efectos ambientales","环境效果","Efeitos ambientais"]},
  {id:"clothing",icon:"shirt",keys:["Clothing:0","Clothing:1","Clothing:2","Clothing:3","Clothing:4","Clothing:6","Clothing:7","Clothing:8","Clothing:9","Clothing:10","Clothing:11","Clothing:12","Clothing:13","Clothing:14","Clothing:15"],names:["衣装","Clothing","Vêtements","Abbigliamento","Kleidung","Ropa","服装","Roupas"]},
  {id:"appearance",icon:"character",keys:["Clothing:5","Clothing:16","Clothing:17","Clothing:18","Clothing:19","Clothing:20","Clothing:21","Clothing:22","Clothing:23"],names:["外見","Appearance","Apparence","Aspetto","Aussehen","Apariencia","外观","Aparência"]},
  {id:"touch-of-magic",icon:"sparkles",keys:[],names:["タッチ・オブ・マジック","Touch of Magic","Touche de magie","Tocco di magia","Hauch von Magie","Toque de magia","魔法触碰","Toque de magia"]},
  {id:"photo-mode",icon:"gallery",keys:[],names:["フォトモード","Photo Mode","Mode photo","Modalità foto","Fotomodus","Modo foto","拍照模式","Modo foto"]},
  {id:"tools",icon:"tool",keys:[],names:["道具","Tools","Outils","Strumenti","Werkzeuge","Herramientas","工具","Ferramentas"]},
  {id:"upgrades",icon:"sparkles",keys:[],names:["アップグレード","Upgrades","Améliorations","Potenziamenti","Verbesserungen","Mejoras","升级","Melhorias"]},
  {id:"characters",icon:"character",keys:[],names:["キャラクター","Characters","Personnages","Personaggi","Charaktere","Personajes","角色","Personagens"]},
  {id:"companions",icon:"paw",keys:[],names:["コンパニオン","Companions","Compagnons","Compagni","Begleiter","Compañeros","伙伴","Companheiros"]},
  // Steam 1.26.2 CollectionSubMenu.Sidekicks (code 20) is a distinct
  // native selector. Keep its player-facing place beside Companions.
  {id:"adventure-companions",icon:"butterfly",keys:[],names:["冒険の仲間","Adventure Companions","Compagnons d’aventure","Compagni d’avventura","Abenteuerbegleiter","Compañeros de aventura","冒险伙伴","Companheiros de aventura"]},
  {id:"critters",icon:"paw",keys:[],names:["動物","Critters","Bestioles","Animaletti","Tierchen","Animalitos","小动物","Criaturinhas"]},
  {id:"mounts",icon:"paw",keys:[],names:["マウント","Mounts","Montures","Cavalcature","Reittiere","Monturas","坐骑","Montarias"]},
  {id:"crafting",icon:"tool",keys:[],names:["クラフト","Crafting","Fabrication","Creazione","Herstellung","Fabricación","制作","Fabricação"]},
  {id:"meals",icon:"cooking",keys:["ActivityItem:3"],names:["料理","Meals","Plats","Piatti","Gerichte","Platos","餐食","Refeições"]},
  {id:"ingredients",icon:"plant",keys:["ActivityItem:2","ActivityItem:11"],names:["食材","Ingredients","Ingrédients","Ingredienti","Zutaten","Ingredientes","食材","Ingredientes"]},
  {id:"foraging",icon:"plant",keys:["ActivityItem:8"],names:["採集","Foraging","Cueillette","Raccolta","Sammeln","Recolección","采集","Coleta"]},
  {id:"fish",icon:"fish",keys:["ActivityItem:10"],names:["魚","Fish","Poissons","Pesci","Fische","Peces","鱼类","Peixes"]},
  {id:"gems",icon:"gem",keys:[],names:["宝石","Gems","Gemmes","Gemme","Edelsteine","Gemas","宝石","Gemas"]},
  {id:"timebending",icon:"sparkles",keys:[],names:["時間操作","Timebending","Courbure du temps","Manipolazione del tempo","Zeitbändigen","Control del tiempo","时间弯曲","Dobra do tempo"]},
  {id:"memories",icon:"gallery",keys:[],names:["メモリー","Memories","Souvenirs","Ricordi","Erinnerungen","Recuerdos","回忆","Memórias"]},
  {id:"board-game",icon:"collection",keys:[],names:["ボードゲーム","Board Game","Jeu de société","Gioco da tavolo","Brettspiel","Juego de mesa","桌游","Jogo de tabuleiro"]},
  {id:"snippets",icon:"sparkles",keys:[],names:["スニペット","Snippets","Fragments","Frammenti","Schnipsel","Fragmentos","碎片","Fragmentos"]},
  {id:"lorekeeper-tales",icon:"guide",keys:[],names:["ロアキーパーの物語","Lorekeeper Tales","Contes du gardien","Racconti del custode","Geschichten des Hüters","Cuentos del guardián","故事","Contos do guardião"]},
  {id:"quest-puzzles",icon:"puzzle",keys:[],names:["クエストパズル","Quest Puzzles","Énigmes de quête","Enigmi delle missioni","Quest-Rätsel","Puzles de misiones","任务谜题","Quebra-cabeças de missões"]},
  {id:"exhibition",icon:"gallery",keys:[],names:["展示","Exhibition","Exposition","Esposizione","Ausstellung","Exposición","展览","Exposição"]}
] as const;
export type CollectionTopCategory=typeof COLLECTION_TOP_CATEGORIES[number]['id'];
const locales=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const byKey=new Map<string,CollectionTopCategory>();
for(const group of COLLECTION_TOP_CATEGORIES)
  for(const key of group.keys)byKey.set(key,group.id);
export function collectionTopCategory(key:string):CollectionTopCategory|null{
  return byKey.get(key)??null;
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
    if(id===null)continue;
    const count=counts.get(id)??{total:0,owned:0};
    count.total+=row.total;count.owned+=row.owned;counts.set(id,count);
  }
  return COLLECTION_TOP_CATEGORIES.map(({id,icon})=>({
    id,icon,...(counts.get(id)??{total:0,owned:0})
  }));
}

/** Item-level mapping of current native definitions into the Owner's taxonomy.
 * Source menu selectors are evidence, not verified runtime membership.
 * Prefer semantic native classes over broad Furniture/Clothing menu fallback. */
export function collectionSourceRoot(
  type:string,subtype:number,menus:readonly number[]
):CollectionTopCategory|null{
  if(type==='Character')return menus.includes(20)?'adventure-companions':'characters';
  if(type==='Companion')return (['companions','critters','snippets','mounts'] as const)[subtype]??null;
  if(type==='Skin')return (['characters','buildings','buildings','environment','mounts','buildings','buildings'] as const)[subtype]??null;
  if(type==='Building')return 'buildings';
  if(type==='Environment')return 'environment';
  if(type==='Makeup')return 'appearance';
  if(type==='AvatarFeature')return subtype===2?'photo-mode':subtype===0?'appearance':subtype===1?'environment':null;
  if(type==='TouchOfMagic')return 'touch-of-magic';
  if(type==='PhotoMode')return 'photo-mode';
  if(type==='Tool')return 'tools';
  if(type==='MountGear')return 'mounts';
  if(type==='Upgrade')return 'upgrades';
  if(type==='MemoryShard')return 'memories';
  if(type==='BoardGame')return 'board-game';
  const direct=collectionTopCategory(type+':'+subtype);
  if(type==='Furniture'||type==='Clothing'||type==='Trimming')return direct;
  const sourceMenus:readonly (readonly [number,CollectionTopCategory])[]=[
    [20,'adventure-companions'],[19,'exhibition'],[18,'quest-puzzles'],[14,'lorekeeper-tales'],
    [13,'snippets'],[12,'board-game'],[11,'timebending'],[9,'gems'],[8,'foraging'],
    [6,'memories'],[7,'characters'],[15,'companions'],[16,'mounts'],[17,'photo-mode'],
    [1,'fish'],[2,'meals'],[0,'ingredients'],[10,'crafting']
  ];
  // Quest-specific/internal types must have explicit positive source membership.
  const menu=sourceMenus.find(([code])=>menus.includes(code));
  if(menu)return menu[1];
  if(type==='ActivityItem'&&subtype===16)return 'gems';
  return direct;
}
