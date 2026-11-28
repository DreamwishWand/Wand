/** Strict read-only projection of exact saved ordinary furniture stock.
 * A missing ID is unknown here, not an inferred zero or variation mapping. */
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function parseFurnitureStock(value:unknown):Map<number,number>{
 if(!record(value)||value.contract!=='wand.db05.furniture-catalog-stock@1'||value.exactStoredCounts!==true||value.canonicalVariationVerified!==false||value.writerAuthorized!==false||!Array.isArray(value.rows)||value.rows.length>20000)throw Error('FURNITURE_STOCK_INVALID');
 const counts=new Map<number,number>();
 for(const row of value.rows){
  if(!record(row)||Object.keys(row).length!==2||typeof row.itemId!=='number'||!Number.isSafeInteger(row.itemId)||Math.floor(row.itemId/100000)!==400||typeof row.amount!=='number'||!Number.isSafeInteger(row.amount)||row.amount<0||row.amount>2147483647||counts.has(row.itemId))throw Error('FURNITURE_STOCK_ROW_INVALID');
  counts.set(row.itemId,row.amount);
 }
 return counts;
}
export const furnitureStockWords={
 ja:['未配置在庫','在庫ありのみ','在庫を読み込み中…','在庫を取得できませんでした。','通常家具のセーブ内の数量。未確認のバリエーションは含みません。'],
 en:['Unplaced stock','In stock only','Loading stock…','Stock unavailable.','Exact saved counts for ordinary furniture; unverified variants are excluded.'],
 fr:['Stock non placé','En stock uniquement','Chargement du stock…','Stock indisponible.','Quantités enregistrées des meubles ordinaires, hors variantes non vérifiées.'],
 it:['Scorte non posizionate','Solo disponibili','Caricamento scorte…','Scorte non disponibili.','Quantità salvate dei mobili normali, escluse varianti non verificate.'],
 de:['Nicht platzierter Bestand','Nur vorrätig','Bestand wird geladen…','Bestand nicht verfügbar.','Gespeicherte Anzahl gewöhnlicher Möbel, ohne ungeprüfte Varianten.'],
 'es-ES':['Inventario sin colocar','Solo disponibles','Cargando inventario…','Inventario no disponible.','Cantidades guardadas de muebles normales, sin variantes no verificadas.'],
 'zh-CN':['未放置库存','仅显示有库存的物品','正在读取库存…','无法读取库存。','普通家具的存档数量，不含未确认的变体。'],
 'pt-BR':['Estoque não colocado','Somente disponíveis','Carregando estoque…','Estoque indisponível.','Quantidades salvas de móveis comuns, sem variantes não verificadas.']
} as const;

/** The local WASM guard supplies the candidate set alongside exact counts.
 * Do not recompute eligibility from display categories in the UI. */
export function parseLocalPlainStock(value:unknown):Set<number>{return parseLocalStockIds(value,'localPlainItemIds');}
export function parseLocalStorageStock(value:unknown):Set<number>{return parseLocalStockIds(value,'localStorageItemIds');}
export function parseLocalRestorableStorageStock(value:unknown):Set<number>{return parseLocalStockIds(value,'localRestorableStorageItemIds');}
function parseLocalStockIds(value:unknown,field:string):Set<number>{
 const counts=parseFurnitureStock(value);
 if(!record(value)||!Array.isArray(value[field])||value[field].length>counts.size)throw Error('FURNITURE_PLAIN_STOCK_INVALID');
 const ids=new Set<number>();
 for(const id of value[field]){
  if(typeof id!=='number'||!counts.has(id)||ids.has(id))throw Error('FURNITURE_PLAIN_STOCK_ID_INVALID');
  ids.add(id);
 }
 return ids;
}
