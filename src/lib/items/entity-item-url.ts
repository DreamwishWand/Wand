import {isWandLanguage,type WandLanguage} from '../ui/preferences.ts';
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
export function entityItemId(raw:unknown):number|null{
  if(typeof raw!=='string'||!ID.test(raw))return null;
  const id=Number(raw);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
/** Shared native-primary route. Locale-free href is the permanent resolver. */
export function itemEntityHref(base:string,id:number,locale?:WandLanguage):string{
  if((base!==''&&!BASE.test(base))||typeof id!=='number'||entityItemId(String(id))===null||
    (locale!==undefined&&!isWandLanguage(locale)))throw new TypeError('INVALID_ITEM_ENTITY_URL');
  return base+'/'+(locale?locale+'/':'')+id+'/';
}
export function itemPageCopy(locale:string){
  const rows:Record<string,readonly [string,string,string,string,string]>={
    ja:['アイテム個別ページ','戻る','アイテムが見つかりません','Expert Mode','基本属性'],
    en:['Item page','Back','Item not found','Expert Mode','Attributes'],
    fr:['Fiche objet','Retour','Objet introuvable','Mode expert','Attributs'],
    it:['Scheda oggetto','Indietro','Oggetto non trovato','Modalità esperto','Attributi'],
    de:['Objektseite','Zurück','Objekt nicht gefunden','Expertenmodus','Attribute'],
    'es-ES':['Ficha del objeto','Volver','Objeto no encontrado','Modo experto','Atributos'],
    'zh-CN':['物品详情','返回','未找到物品','专家模式','属性'],
    'pt-BR':['Página do item','Voltar','Item não encontrado','Modo especialista','Atributos']
  };
  const [page,back,missing,expert,attributes]=rows[locale]??rows.en;
  const extra:Record<string,readonly [string,string,string,string,string]>={
    ja:['原本の設置寸法','エネルギー回復量（原本設定）','同じシリーズ','材料として使用するレシピ','一部の関連情報を取得できませんでした'],
    en:['Native grid dimensions','Energy recovery (configured)','Same series','Used in recipes','Some related information is unavailable'],
    fr:['Dimensions de grille d’origine','Énergie restaurée (configurée)','Même série','Utilisé dans les recettes','Certaines données liées sont indisponibles'],
    it:['Dimensioni griglia originali','Energia recuperata (configurata)','Stessa serie','Usato nelle ricette','Alcune informazioni correlate non sono disponibili'],
    de:['Originale Rastermaße','Energiegewinn (konfiguriert)','Gleiche Serie','In Rezepten verwendet','Einige verknüpfte Informationen fehlen'],
    'es-ES':['Dimensiones de cuadrícula originales','Energía recuperada (configurada)','Misma serie','Usado en recetas','Algunos datos relacionados no están disponibles'],
    'zh-CN':['原始网格尺寸','能量恢复量（原始设定）','同系列','用作配方材料','部分关联信息不可用'],
    'pt-BR':['Dimensões originais da grade','Energia recuperada (configurada)','Mesma série','Usado em receitas','Alguns dados relacionados estão indisponíveis']
  };
  const [dimensions,energy,series,recipeUses,incomplete]=extra[locale]??extra.en;
  const entity:Record<string,readonly [string,string,string,string]>={
    ja:['本体','ドリームスタイル','マウントスキン','マウント装備'],
    en:['Base item','Dream Styles','Mount skins','Mount gear'],
    fr:['Élément de base','Styles de rêve','Apparences de monture','Équipement de monture'],
    it:['Elemento base','Stili da sogno','Aspetti cavalcatura','Equipaggiamento cavalcatura'],
    de:['Basisobjekt','Traumstile','Reittier-Skins','Reittierausrüstung'],
    'es-ES':['Elemento base','Estilos de ensueño','Aspectos de montura','Equipo de montura'],
    'zh-CN':['本体','梦幻装扮','坐骑外观','坐骑装备'],
    'pt-BR':['Item base','Estilos dos sonhos','Visuais de montaria','Equipamento de montaria']
  };
  const [baseEntity,dreamStyles,mountStyles,mountGear]=entity[locale]??entity.en;
  const context:Record<string,readonly [string,string,string,string,string,string,string]>={
    ja:['通常の設置区分（原本）','屋内','屋外','屋内・屋外','外接寸法。占有マスや設置可否を示すものではありません。','プレミアムショップの関連バンドル','原本のバンドル構成。販売実績や現在の販売可否は未確認。'],
    en:['Ordinary placement (source)','Indoor','Outdoor','Indoor & outdoor','Bounding dimensions only; not occupied cells or placement permission.','Related Premium Shop bundles','Source bundle composition; sale history and current availability are not verified.'],
    fr:['Placement ordinaire (source)','Intérieur','Extérieur','Intérieur et extérieur','Dimensions hors tout, sans garantie de cases occupées ou de placement.','Lots Premium Shop associés','Composition source ; historique de vente et disponibilité non vérifiés.'],
    it:['Posizionamento ordinario (fonte)','Interno','Esterno','Interno ed esterno','Solo ingombro, non celle occupate né permessi di posizionamento.','Pacchetti Premium Shop correlati','Composizione originale; vendite e disponibilità non verificate.'],
    de:['Übliche Platzierung (Quelle)','Innen','Außen','Innen und außen','Nur Außenmaße, keine belegten Felder oder Platzierungsfreigabe.','Zugehörige Premium-Shop-Pakete','Originale Paketbestandteile; Verkauf und Verfügbarkeit nicht verifiziert.'],
    'es-ES':['Colocación habitual (origen)','Interior','Exterior','Interior y exterior','Solo dimensiones exteriores, no ocupación ni permiso de colocación.','Lotes relacionados de la tienda prémium','Composición original; ventas y disponibilidad sin verificar.'],
    'zh-CN':['常规放置范围（原始数据）','室内','室外','室内及室外','仅外接尺寸，不代表占用格或允许放置。','相关高级商店礼包','原始礼包组成，销售记录及当前可购状态未经确认。'],
    'pt-BR':['Posicionamento habitual (fonte)','Interior','Exterior','Interior e exterior','Apenas dimensões externas, não células ocupadas nem permissão de posicionamento.','Pacotes relacionados da loja premium','Composição original; vendas e disponibilidade não verificadas.']
  };
  const [placement,indoor,outdoor,both,boundsOnly,bundleTitle,bundleNote]=context[locale]??context.en;
  return {page,back,missing,expert,attributes,dimensions,energy,series,recipeUses,incomplete,baseEntity,dreamStyles,mountStyles,mountGear,placement,indoor,outdoor,both,boundsOnly,bundleTitle,bundleNote};
}
