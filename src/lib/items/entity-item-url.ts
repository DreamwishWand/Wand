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
  if((base!==''&&!BASE.test(base))||entityItemId(String(id))===null||
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
  return {page,back,missing,expert,attributes};
}
