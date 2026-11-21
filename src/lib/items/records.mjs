/** Shared, provenance-aware read helpers for DB-01 private/current item records. */
export const ITEM_LOCALES = Object.freeze(['en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR']);

export function indexItemRecords(records) {
  const index = new Map();
  for (const row of records) {
    if (!Number.isSafeInteger(row?.itemId) || row.itemId <= 0 || index.has(row.itemId)) {
      throw new Error(`Invalid or duplicate Item ID: ${row?.itemId}`);
    }
    if (row.verification?.currentVersionObserved !== true || !row.source?.platform ||
        !row.source?.gameVersion || !row.source?.file || !row.source?.sha256) {
      throw new Error(`Missing current source evidence for Item ID: ${row.itemId}`);
    }
    index.set(row.itemId, row);
  }
  return index;
}

export function getLocalizedName(item, locale, { fallback = null } = {}) {
  if (!ITEM_LOCALES.includes(locale)) throw new RangeError(`Unknown locale: ${locale}`);
  const value = item?.names?.[locale];
  if (typeof value === 'string' && value.trim() &&
      item.verification?.names?.[locale] === 'exact_locdb_join') return value;
  if (fallback && ITEM_LOCALES.includes(fallback)) {
    const other = item?.names?.[fallback];
    if (typeof other === 'string' && other.trim() &&
        item.verification?.names?.[fallback] === 'exact_locdb_join') return other;
  }
  return null;
}

export function getVerifiedIconGuid(item) {
  return item?.verification?.iconGuid === 'native_wire_verified' &&
    /^guid:[0-9a-f]{32}$/.test(item?.image?.iconGuid ?? '')
    ? item.image.iconGuid : null;
}

export function isNativeItem(item) {
  return item?.catalogDomain === 'item' && item?.verification?.currentVersionObserved === true;
}

export function getHistoricalCollectionMetadata(item) {
  return item?.historicalReference ?? null;
}