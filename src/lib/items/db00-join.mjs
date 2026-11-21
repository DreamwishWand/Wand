/** Private DB-01 -> DB-00 source-exact candidate patch. No auto-publishing. */
import { PATCH_SCHEMA, validateItem, validateTarget } from '../game-db/model.mjs';
import { ITEM_LOCALES, getLocalizedName } from './records.mjs';

export const DB01_DB00_JOIN_CONTRACT = 'wand.db01.db00-private-source-join@1';

/** Requires a verified, version-matched DB-00 target. Does NOT infer inventory,
 *  collection status, DLC ownership, item placement, or up-to-date game taxonomy.
 */
export function createDb01Db00Patch(catalog, target) {
  if (!catalog || catalog.source?.privateOnly !== true ||
      catalog.source.publicationAuthorized !== false ||
      catalog.source.dataSha256Verified !== true ||
      typeof catalog.currentNativeItems !== 'function') {
    throw new TypeError('DB01_PRIVATE_CATALOG_REQUIRED');
  }
  validateTarget(target);
  if (target.platform !== catalog.source.platform ||
      target.gameVersion !== catalog.source.gameVersion ||
      target.sourceSha256 !== catalog.source.sourceManifestSha256 ||
      target.buildId !== null) {
    throw new TypeError('DB01_DB00_EXACT_SOURCE_TARGET_REQUIRED');
  }
  const sourceRef = 'db01-src01-steam-native';
  const records = catalog.currentNativeItems().map((row) => {
    const names = {};
    for (const locale of ITEM_LOCALES) {
      const name = getLocalizedName(row, locale);
      if (name !== null) names[locale] = name;
    }
    return validateItem({
      id:String(row.itemId), names,
      nameStatus:Object.keys(names).length ? 'verified' : 'unverified',
      category:null, subcategory:null, nativeCategory:row.nativeCategory,
      worlds:[], universes:[], contentIds:[], releaseIds:[], relations:[],
      sourceRefs:[sourceRef],
    });
  });
  const patch = {
    schema:PATCH_SCHEMA, target:{...target},
    items:records, releases:[],
    sources:[{id:sourceRef,sha256:catalog.source.sourceManifestSha256,visibility:'private'}],
  };
  return Object.freeze({contract:DB01_DB00_JOIN_CONTRACT,patch,
    currentItemDefinitions:records.length,
    excludedUnclassifiedDefinitions:catalog.source.unclassifiedDefinitions,
    sourceCompatible:true, catalogCoverageComplete:false,
    historicalMetadataCopied:false, saveWritingAuthorized:false,
    currentNameCoverageOnly:true, publishable:false});
}