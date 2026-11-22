/** TypeScript DB-01 → DB-00 bridge. Explicitly private, never auto-publishes or writes saves. */
import { PATCH_SCHEMA, validateItem, validateTarget } from '../game-db/model.mjs';
import { DB01_LOCALES, type Db01CatalogClient } from './index.ts';
import type { Db01Classification, Db01ClassificationClient } from './classification.ts';

export const DB01_DB00_JOIN_CONTRACT = 'wand.db01.db00-private-source-join@1' as const;
export interface Db00SourceTarget {
  platform: string;
  gameVersion: string;
  buildId: null;
  sourceSha256: string;
}
export async function createDb01Db00Patch(
  catalog: Db01CatalogClient, target: Db00SourceTarget,
  classification?: Db01ClassificationClient
) {
  if (!catalog?.source?.privateOnly || typeof catalog.getCategory !== 'function')
    throw new TypeError('DB01_PRIVATE_CATALOG_REQUIRED');
  validateTarget(target);
  if (target.platform !== catalog.source.platform ||
      target.gameVersion !== catalog.source.gameVersion ||
      target.sourceSha256 !== catalog.source.nativeSourceManifestSha256 ||
      target.buildId !== null) throw new TypeError('DB01_DB00_EXACT_SOURCE_TARGET_REQUIRED');
  if (classification && (
      !classification.source?.privateOnly ||
      classification.source.gameVersion !== catalog.source.gameVersion ||
      classification.source.sourceItemsSha256 !== catalog.source.sourceItemsSha256 ||
      classification.source.definitionCount !== catalog.source.definitions
  )) throw new TypeError('DB01_DB00_TAG_SOURCE_MISMATCH');
  const nativeCategories = ['ActivityItem', 'Furniture', 'Clothing', 'Trimming'] as const;
  const batches = await Promise.all(nativeCategories.map(category => catalog.getCategory(category)));
  const nativeRows = batches.flat();
  const tagged = new Map<number, Readonly<Db01Classification>>();
  if (classification) {
    // The overlay's 39k definitions are private, but only the 13k verified
    // native item classes belong in DB-00 Item records. Keep I/O bounded.
    for (let index = 0; index < nativeRows.length; index += 4096) {
      const subset = nativeRows.slice(index, index + 4096);
      const found = await classification.getItems(subset.map(row => row.itemId));
      if (found.length !== subset.length)
        throw new TypeError('DB01_DB00_TAG_BATCH_MISMATCH');
      found.forEach((metadata, i) => {
        const base = subset[i];
        if (!metadata || metadata.itemId !== base.itemId ||
            metadata.nativeKey !== base.nativeKey ||
            metadata.nativeCategory !== base.nativeCategory ||
            metadata.sourceSha256 !== base.sourceSha256)
          throw new TypeError('DB01_DB00_TAG_NATIVE_IDENTITY_MISMATCH');
        tagged.set(metadata.itemId, metadata);
      });
    }
  }
  const records = nativeRows.map(row => {
    if (row.catalogDomain !== 'item') throw new TypeError('DB01_UNCLASSIFIED_PATCH_BLOCKED');
    const names: Record<string,string> = {};
    for (const locale of DB01_LOCALES) {
      if (row.names[locale] !== null) names[locale] = row.names[locale];
    }
    const metadata = tagged.get(row.itemId);
    // Source Tag.json links are not synonymous with DLC entitlement or world
    // availability. Do NOT assert these DB-00 fields from Tag references.
    const attributes = metadata ? {
      gameOriginalTagReferences:metadata.tagReferences.map(tag => ({
        id:tag.tagId,key:tag.tagKey,originalWireField:tag.wireField,facet:tag.facet,
      })),
      gameOriginalTagFacets:metadata.facets,
      uninterpretedSubtypeCode:metadata.wireSubtypeCode,
      gameUiCategoryVerified:false,worldAvailabilityVerified:false,
      dlcOwnershipVerified:false,
    } : undefined;
    return validateItem({
      id:String(row.itemId), names, nameStatus:Object.keys(names).length ? 'verified' : 'unverified',
      category:null, subcategory:null, nativeCategory:row.nativeCategory,
      worlds:[],universes:metadata?.facets.disneyUniverse ?? [],
      contentIds:[],releaseIds:[],relations:[],
      sourceRefs:metadata ?
        ['db01-src01-steam-native','db01-original-tag-relations'] :
        ['db01-src01-steam-native'],
      ...(attributes ? {attributes} : {}),
    });
  });
  if (records.length !== catalog.source.currentNativeItemDefinitions)
    throw new TypeError('DB01_NATIVE_ITEM_COUNT_MISMATCH');
  const patch = {
    schema:PATCH_SCHEMA,
    target:{...target},
    items:records, releases:[],
    sources:[
      {id:'db01-src01-steam-native',sha256:catalog.source.nativeSourceManifestSha256,visibility:'private'},
      ...(classification ? [{id:'db01-original-tag-relations',
        sha256:classification.source.tagOriginalSha256,visibility:'private'}] : []),
    ],
  };
  return Object.freeze({
    contract:DB01_DB00_JOIN_CONTRACT,patch,
    currentItemDefinitions:records.length,
    excludedUnclassifiedDefinitions:catalog.source.definitions-records.length,
    sourceCompatible:true,catalogCoverageComplete:false,
    historicalMetadataCopied:false,saveWritingAuthorized:false,
    currentNameCoverageOnly:!classification,
    sourceTagMetadataAdded:classification ? tagged.size : 0,
    worldAvailabilityDerivedFromTags:false,dlcOwnershipDerivedFromTags:false,
    publishable:false,
  });
}