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
  ja:'現在のコレクションに記録があります。セーブファイルから確認できる収集状況で既存の記録を上書きしますか？ 確認できない項目は変更しません。',
  en:'This collection already has records. Overwrite existing collection progress with verified save data? Unverified fields will remain unchanged.',
  fr:'Cette collection contient déjà des données. Remplacer la progression existante par les données vérifiées de la sauvegarde ? Les champs non vérifiés restent inchangés.',
  it:'La collezione contiene già dati. Sovrascrivere i progressi con i dati verificati del salvataggio? I campi non verificati restano invariati.',
  de:'Diese Sammlung enthält bereits Einträge. Vorhandenen Fortschritt mit verifizierten Spielstanddaten überschreiben? Nicht verifizierte Felder bleiben unverändert.',
  'es-ES':'Esta colección ya contiene registros. ¿Sobrescribir el progreso con los datos verificados de la partida? Los campos no verificados no cambiarán.',
  'zh-CN':'当前收藏已有记录。是否用存档中已验证的收藏进度覆盖现有记录？未验证的字段不会更改。',
  'pt-BR':'Esta coleção já contém registros. Sobrescrever o progresso com os dados verificados do salvamento? Os campos não verificados permanecerão inalterados.'
};
export function collectionOverwriteMessage(locale:string):string{
  return OVERWRITE[locale]??OVERWRITE.en;
}
