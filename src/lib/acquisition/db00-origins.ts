/**
 * DB-02 -> DB-00 consumer. Join without changing DB-00's owned schema/runtime.
 * DB-03 rewards outside the published ItemList subset are retained separately.
 */
import type {ItemOrigin, OriginDatabase} from './origins.ts';

export const DB02_DB00_ORIGIN_JOIN_SCHEMA = 'wand.db02.db00-origin-join@1' as const;

export interface Db00PublishedItem {
  readonly id: string;
  readonly names: Readonly<Record<string,string>>;
  readonly category: string | null;
}
export interface Db00PublishedSnapshot {
  readonly kind: 'db_snapshot';
  readonly id: string;
  readonly target: { readonly platform: string; readonly gameVersion: string; readonly sourceSha256: string };
  readonly coverage: { readonly scope: string; readonly complete: boolean };
  readonly items: readonly Db00PublishedItem[];
}
export interface Db00OriginJoin {
  readonly schema: typeof DB02_DB00_ORIGIN_JOIN_SCHEMA;
  readonly sourceVersion: '1.26.2';
  readonly originCoverageComplete: false;
  lookup(itemId: string | number): {
    readonly itemId: string;
    readonly catalogItem: Db00PublishedItem | null;
    readonly catalogClassification: 'published_db00_item' | 'outside_published_db00_item_scope';
    readonly origins: readonly ItemOrigin[];
    readonly originCoverageComplete: false;
    readonly availabilityVerified: false;
  };
  getCoverage(): {
    readonly db00Items: number;
    readonly linkedDb00Items: number;
    readonly linkedOutsideDb00Items: number;
    readonly sourceLinkedItemIds: number;
    readonly originCoverageComplete: false;
  };
}

const VALID_ID=/^[1-9][0-9]{0,15}$/;
function id(raw: number | string): string {
  const s=typeof raw==='number' && Number.isSafeInteger(raw)?String(raw):raw;
  if(typeof s!=='string'||!VALID_ID.test(s)||!Number.isSafeInteger(Number(s)))
    throw new TypeError('DB02_DB00_INVALID_ITEM_ID');
  return s;
}

/**
 * Pass a verified result of DB-00's existing loadCurrentGameDatabase().
 * Public ItemList coverage does not imply coverage of Currency, Companion,
 * Touch of Magic, Building, Tool or PhotoMode reward definitions.
 */
export function joinDb02OriginsWithDb00(
  db00: Db00PublishedSnapshot,
  origins: OriginDatabase
): Db00OriginJoin {
  if (!db00 || db00.kind !== 'db_snapshot' ||
    db00.id !== 'steam-1.26.2-native-itemlist-v1' ||
    db00.target?.sourceSha256 !== '496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b' ||
    db00.target?.platform !== 'Steam' ||
    db00.target.gameVersion !== '1.26.2' ||
    db00.coverage?.scope !== 'steam-v1.26.2-native-itemlist' ||
    db00.coverage.complete !== true || !Array.isArray(db00.items) ||
    !origins || origins.schema !== 'wand.db02.item-origins@1' ||
    origins.originCoverageComplete !== false)
    throw new TypeError('DB02_DB00_EXACT_SOURCE_SCOPE_REQUIRED');
  const byId=new Map<string,Db00PublishedItem>();
  for (const item of db00.items){
    const key=id(item?.id);
    if(byId.has(key))throw new TypeError('DB02_DB00_DUPLICATE_ITEM_ID');
    byId.set(key,item);
  }
  const observed=new Set<string>();
  let within=0, outside=0;
  // The caller can reuse DB-00's already-loaded snapshot rather than
  // downloading its item corpus again; count only exact joined identities.
  for (const key of byId.keys()){
    if(origins.getItem(key).origins.length){within++;observed.add(key);}
  }
  const summary=Object.freeze({
    db00Items:byId.size, linkedDb00Items:within,
    linkedOutsideDb00Items:origins.getCoverage().linkedItemIds-within,
    sourceLinkedItemIds:origins.getCoverage().linkedItemIds,
    originCoverageComplete:false as const
  });
  if (summary.linkedOutsideDb00Items < 0)
    throw new TypeError('DB02_DB00_INVALID_COVERAGE');
  return Object.freeze({
    schema:DB02_DB00_ORIGIN_JOIN_SCHEMA,
    sourceVersion:'1.26.2' as const,
    originCoverageComplete:false as const,
    lookup(rawId:string|number){
      const key=id(rawId);
      return Object.freeze({
        itemId:key,
        catalogItem:byId.get(key)??null,
        catalogClassification:byId.has(key) ?
          'published_db00_item' as const : 'outside_published_db00_item_scope' as const,
        origins:origins.getItem(key).origins,
        originCoverageComplete:false as const,
        availabilityVerified:false as const
      });
    },
    getCoverage(){return summary;}
  });
}
