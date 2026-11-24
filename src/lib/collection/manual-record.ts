import type {CollectionEntry,CollectionItem,CollectionState} from './runtime.ts';

/** The local checklist defaults to missing; absence is not save evidence. */
export function collectionHasRecordedProgress(state:CollectionState):boolean{
  const entries=state.workspaces.find(row=>row.id===state.active)?.entries??{};
  // Legacy records have no per-field provenance. Treat existing imported or
  // manual progress alike to avoid silent overwrites of older manual entries.
  return Object.values(entries).some(entry=>entry.status!==undefined||
    entry.quantity!==undefined||entry.discovered!==undefined);
}
export function collectionHasQuantity(item:Pick<CollectionItem,'stateSemantic'|'family'>):boolean{
  return ['QUANTITY_STOCK','OWNERSHIP_STOCK_AND_DISCOVERY'].includes(item.stateSemantic)||
    ['Furniture','Landscaping','Roads & Fences','Trimming','Wallpaper & Flooring',
      'ActivityItem','Source Activity Items','Source Crop','Source Meal','Source Seed',
      'Source Flower','Source Fish','Source Ingredient','Source Consumable',
      'Source Mineral','Source Crafting Material'].includes(item.family);
}
export function collectionQuantityPatch(value:string):Pick<CollectionEntry,'quantity'>|null{
  if(!/^\d+$/.test(value.trim()))return null;
  const quantity=Number(value);
  if(!Number.isSafeInteger(quantity)||quantity<0||quantity>999999)return null;
  return {quantity};
}
const OVERWRITE:Readonly<Record<string,string>>={
  "ja": "セーブファイルの情報で既存の手動入力データを上書きしますか？",
  "en": "Overwrite manual records with save data?",
  "fr": "Remplacer les données manuelles par la sauvegarde ?",
  "it": "Sovrascrivere i dati manuali con il salvataggio?",
  "de": "Manuelle Einträge mit Spielstanddaten überschreiben?",
  "es-ES": "¿Sobrescribir los datos manuales con la partida guardada?",
  "zh-CN": "使用存档数据覆盖手动记录？",
  "pt-BR": "Sobrescrever os registros manuais com os dados do salvamento?"
};
export function collectionOverwriteMessage(locale:string):string{
  return OVERWRITE[locale]??OVERWRITE.en;
}
