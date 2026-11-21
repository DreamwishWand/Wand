/** TypeScript DB-01 → DB-00 bridge. Explicitly private, never auto-publishes or writes saves. */
import { PATCH_SCHEMA, validateItem, validateTarget } from '../game-db/model.mjs';
import { DB01_LOCALES, type Db01CatalogClient } from './index.ts';

export const DB01_DB00_JOIN_CONTRACT = 'wand.db01.db00-private-source-join@1' as const;
export interface Db00SourceTarget {
  platform: string;
  gameVersion: string;
  buildId: null;
  sourceSha256: string;
}
export async function createDb01Db00Patch(catalog: Db01CatalogClient, target: Db00SourceTarget) {
  if (!catalog?.source?.privateOnly || typeof catalog.getCategory !== 'function')
    throw new TypeError('DB01_PRIVATE_CATALOG_REQUIRED');
  validateTarget(target);
  if (target.platform !== catalog.source.platform ||
      target.gameVersion !== catalog.source.gameVersion ||
      target.sourceSha256 !== catalog.source.nativeSourceManifestSha256 ||
      target.buildId !== null) throw new TypeError('DB01_DB00_EXACT_SOURCE_TARGET_REQUIRED');
  const nativeCategories = ['ActivityItem', 'Furniture', 'Clothing', 'Trimming'] as const;
  const batches = await Promise.all(nativeCategories.map(category => catalog.getCategory(category)));
  const records = batches.flat().map(row => {
    if (row.catalogDomain !== 'item') throw new TypeError('DB01_UNCLASSIFIED_PATCH_BLOCKED');
    const names: Record<string,string> = {};
    for (const locale of DB01_LOCALES) {
      if (row.names[locale] !== null) names[locale] = row.names[locale];
    }
    return validateItem({
      id:String(row.itemId), names, nameStatus:Object.keys(names).length ? 'verified' : 'unverified',
      category:null, subcategory:null, nativeCategory:row.nativeCategory,
      worlds:[],universes:[],contentIds:[],releaseIds:[],relations:[],
      sourceRefs:['db01-src01-steam-native'],
    });
  });
  if (records.length !== catalog.source.currentNativeItemDefinitions)
    throw new TypeError('DB01_NATIVE_ITEM_COUNT_MISMATCH');
  const patch = {
    schema:PATCH_SCHEMA,
    target:{...target},
    items:records, releases:[],
    sources:[{id:'db01-src01-steam-native',sha256:catalog.source.nativeSourceManifestSha256,visibility:'private'}],
  };
  return Object.freeze({
    contract:DB01_DB00_JOIN_CONTRACT,patch,
    currentItemDefinitions:records.length,
    excludedUnclassifiedDefinitions:catalog.source.definitions-records.length,
    sourceCompatible:true,catalogCoverageComplete:false,
    historicalMetadataCopied:false,saveWritingAuthorized:false,
    currentNameCoverageOnly:true,publishable:false,
  });
}