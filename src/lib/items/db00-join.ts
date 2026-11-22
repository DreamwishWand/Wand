/** TypeScript DB-01 → DB-00 bridge. Explicitly private, never auto-publishes or writes saves. */
import { PATCH_SCHEMA, validateItem, validateTarget } from '../game-db/model.mjs';
import { DB01_LOCALES, type Db01CatalogClient } from './index.ts';
import type { Db01Classification, Db01ClassificationClient } from './classification.ts';
import type { Db01ItemType, Db01ItemTypeClient } from './item-types.ts';
import type { Db01OriginalCollectionMenuClient, Db01OriginalCollectionListing } from './collection-menu.ts';
import type { Db01UniversePredicateClient, Db01UniversePredicateMatch } from './collection-universe.ts';
import type { Db01RemainingClient, Db01RemainingResult } from './collection-remaining.ts';

export const DB01_DB00_JOIN_CONTRACT = 'wand.db01.db00-private-source-join@1' as const;
export interface Db00SourceTarget {
  platform: string;
  gameVersion: string;
  buildId: null;
  sourceSha256: string;
}
export async function createDb01Db00Patch(
  catalog: Db01CatalogClient, target: Db00SourceTarget,
  classification?: Db01ClassificationClient,
  itemTypes?: Db01ItemTypeClient,
  collectionMenus?: Db01OriginalCollectionMenuClient,
  collectionUniverse?: Db01UniversePredicateClient,
  activityCrafting?: Db01RemainingClient
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
  if (itemTypes && (
      itemTypes.source.gameVersion !== catalog.source.gameVersion ||
      itemTypes.source.sourceItemsSha256 !== catalog.source.sourceItemsSha256 ||
      itemTypes.source.definitionCount !== catalog.source.definitions ||
      itemTypes.source.sourceItemTypeVerified !== catalog.source.definitions
  )) throw new TypeError('DB01_DB00_IL2CPP_SOURCE_MISMATCH');
  if (collectionMenus && (
      collectionMenus.source.gameVersion !== catalog.source.gameVersion ||
      collectionMenus.source.sourceItemsSha256 !== catalog.source.sourceItemsSha256 ||
      collectionMenus.source.catalogDefinitions !== catalog.source.definitions
  )) throw new TypeError('DB01_DB00_COLLECTION_SOURCE_MISMATCH');
  if (collectionUniverse && (
      collectionUniverse.source.gameVersion !== catalog.source.gameVersion ||
      collectionUniverse.source.sourceItemsSha256 !== catalog.source.sourceItemsSha256 ||
      collectionUniverse.source.sourceDefinitionCount !== catalog.source.definitions
  )) throw new TypeError('DB01_DB00_UNIVERSE_PREDICATE_SOURCE_MISMATCH');
  if (activityCrafting && (
      activityCrafting.source.gameVersion !== catalog.source.gameVersion ||
      activityCrafting.source.sourceItemsSha256 !== catalog.source.sourceItemsSha256 ||
      activityCrafting.source.definitionCount !== catalog.source.definitions
  )) throw new TypeError('DB01_DB00_ACTIVITY_CRAFTING_SOURCE_MISMATCH');
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
  const typed = new Map<number, Readonly<Db01ItemType>>();
  if (itemTypes) {
    for (let index = 0; index < nativeRows.length; index += 4096) {
      const subset = nativeRows.slice(index, index + 4096);
      const found = await itemTypes.getItems(subset.map(row => row.itemId));
      if (found.length !== subset.length)
        throw new TypeError('DB01_DB00_IL2CPP_BATCH_MISMATCH');
      found.forEach((metadata, i) => {
        const base = subset[i];
        if (!metadata || metadata.itemId !== base.itemId ||
            metadata.nativeCategory !== base.nativeCategory ||
            metadata.sourceSha256 !== base.sourceSha256 ||
            metadata.itemTypeName !== base.nativeCategory)
          throw new TypeError('DB01_DB00_IL2CPP_ITEM_MISMATCH');
        typed.set(metadata.itemId, metadata);
      });
    }
  }
  const menuListed = new Map<number,readonly Readonly<Db01OriginalCollectionListing>[]>();
  if (collectionMenus) {
    for (let index=0;index<nativeRows.length;index+=4096) {
      const subset=nativeRows.slice(index,index+4096);
      const results=await collectionMenus.getDirectListingsBatch(subset.map(row=>row.itemId));
      if (results.length!==subset.length)
        throw new TypeError('DB01_DB00_COLLECTION_BATCH_MISMATCH');
      for (let i=0;i<results.length;i++) {
        const listed=results[i];
        if (!Array.isArray(listed))
          throw new TypeError('DB01_DB00_COLLECTION_INVALID_LIST');
        if (listed.length) menuListed.set(subset[i].itemId,listed);
      }
    }
  }
  const universeCandidates=new Map<number,readonly Readonly<Db01UniversePredicateMatch>[]>();
  if (collectionUniverse) {
    for (let index=0;index<nativeRows.length;index+=4096) {
      const subset=nativeRows.slice(index,index+4096);
      const matches=await collectionUniverse.getItems(subset.map(row=>row.itemId));
      if (matches.length!==subset.length)
        throw new TypeError('DB01_DB00_UNIVERSE_PREDICATE_BATCH_MISMATCH');
      for(let i=0;i<matches.length;i++) {
        const found=matches[i];
        if(!Array.isArray(found)||found.some(link=>
            link.nativeCategory!==subset[i].nativeCategory||
            link.sourcePredicateMatched!==true||
            link.gameUiMembershipVerified!==false))
          throw new TypeError('DB01_DB00_UNIVERSE_PREDICATE_ITEM_MISMATCH');
        if(found.length) universeCandidates.set(subset[i].itemId,found);
      }
    }
  }
  const activityCraftingRows=new Map<number,Readonly<Db01RemainingResult>>();
  let universePredicatesSuppressedByCrafting=0;
  if (activityCrafting) {
    for (let index=0;index<nativeRows.length;index+=4096) {
      const subset=nativeRows.slice(index,index+4096);
      const found=await activityCrafting.getItems(subset.map(row=>row.itemId));
      if (found.length!==subset.length)
        throw new TypeError('DB01_DB00_ACTIVITY_CRAFTING_BATCH_MISMATCH');
      for (let i=0;i<found.length;i++) {
        const meta=found[i],base=subset[i];
        if (!meta)continue;
        if (meta.itemId!==base.itemId||
            meta.nativeCategory!==base.nativeCategory||
            meta.sourceSha256!==base.sourceSha256)
          throw new TypeError('DB01_DB00_ACTIVITY_CRAFTING_ITEM_MISMATCH');
        activityCraftingRows.set(meta.itemId,meta);
        // Explicit original Crafting Ignore=1 selectors are negative
        // predicates. Suppress same CollectionSet/group universe matches,
        // but never claim the remaining set is actual UI membership.
        const other=universeCandidates.get(meta.itemId);
        if (other && meta.negative.length) {
          const negatives=new Set(meta.negative.map(negative=>
            negative.collectionSetId+':'+negative.groupIndex));
          const filtered=other.filter(link=>
            !negatives.has(link.setId+':'+link.groupIndex));
          universePredicatesSuppressedByCrafting+=other.length-filtered.length;
          if (filtered.length)universeCandidates.set(meta.itemId,filtered);
          else universeCandidates.delete(meta.itemId);
        }
      }
    }
  }
  const records = nativeRows.map(row => {
    if (row.catalogDomain !== 'item') throw new TypeError('DB01_UNCLASSIFIED_PATCH_BLOCKED');
    const names: Record<string,string> = {};
    for (const locale of DB01_LOCALES) {
      if (row.names[locale] !== null) names[locale] = row.names[locale];
    }
    const metadata = tagged.get(row.itemId);
    const itemType = typed.get(row.itemId);
    const directMenus = menuListed.get(row.itemId);
    const universeMatches=universeCandidates.get(row.itemId);
    const activityAndCraft=activityCraftingRows.get(row.itemId);
    // Source Tag.json links are not synonymous with DLC entitlement or world
    // availability. Do NOT assert these DB-00 fields from Tag references.
    const attributes = metadata || itemType || directMenus ||
      universeMatches || activityAndCraft ? {
      ...(metadata ? {
        gameOriginalTagReferences:metadata.tagReferences.map(tag => ({
          id:tag.tagId,key:tag.tagKey,originalWireField:tag.wireField,facet:tag.facet,
        })),
        gameOriginalTagFacets:metadata.facets,
        uninterpretedSubtypeCode:metadata.wireSubtypeCode,
      } : {}),
      ...(itemType ? {
        sourceItemType:{code:itemType.itemTypeCode,name:itemType.itemTypeName,
          evidence:'current_original_il2cpp_enum'},
        sourceSubtype:{code:itemType.subtypeCode,
          name:itemType.subtypeName,
          enum:itemType.subtypeEnumName,
          verified:itemType.subtypeNameVerified},
      } : {}),
      ...(directMenus ? {
        gameOriginalCollectionDirectListings:directMenus.map(listing=>({
          setId:listing.setId,setKey:listing.setKey,
          submenu:listing.submenu,submenuCode:listing.submenuCode,
          collectionLabelKey:listing.collectionLabelKey,
          groupIndex:listing.groupIndex,evidence:listing.evidence,
          gameUiVisibilityVerified:false,
        })),
      } : {}),
      ...(universeMatches ? {
        gameOriginalCollectionUniversePredicateMatches:universeMatches.map(match=>({
          collectionSetId:match.setId,groupIndex:match.groupIndex,
          sourceSetItemId:match.sourceSetItemId,
          universeTagId:match.universeTagId,
          universeTagKey:match.universeTagKey,
          rule:match.rule,sourcePredicateMatched:true,
          gameUiMembershipVerified:false,
          gameUiVisibilityVerified:false,
        })),
      } : {}),
      ...(activityAndCraft ? {
        gameOriginalCollectionActivityCraftingSource:{
          positive:activityAndCraft.positive,
          negativeExclusions:activityAndCraft.negative,
          gameUiMembershipVerified:false,
        },
      } : {}),
      gameUiCategoryVerified:false,worldAvailabilityVerified:false,
      dlcOwnershipVerified:false,
    } : undefined;
    return validateItem({
      id:String(row.itemId), names, nameStatus:Object.keys(names).length ? 'verified' : 'unverified',
      category:null, subcategory:null, nativeCategory:row.nativeCategory,
      worlds:[],universes:metadata?.facets.disneyUniverse ?? [],
      contentIds:[],releaseIds:[],relations:[],
      sourceRefs:[
        'db01-src01-steam-native',
        ...(metadata ? ['db01-original-tag-relations'] : []),
        ...(itemType ? ['db01-original-il2cpp-types'] : []),
        ...(directMenus ? ['db01-original-collection-menus',
          'db01-original-collection-submenus'] : []),
        ...(universeMatches ? ['db01-original-collection-universe-predicates',
          'db01-original-collection-universe-il2cpp'] : []),
        ...(activityAndCraft ? ['db01-original-collection-activity-crafting',
          'db01-original-collection-activity-crafting-il2cpp'] : []),
      ],
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
      ...(itemTypes ? [{id:'db01-original-il2cpp-types',
        sha256:itemTypes.source.sourceIl2cppDumpSha256,visibility:'private'}] : []),
      ...(collectionMenus ? [
        {id:'db01-original-collection-menus',
          sha256:collectionMenus.source.sourceCollectionSetSha256,visibility:'private'},
        {id:'db01-original-collection-submenus',
          sha256:collectionMenus.source.sourceIl2cppDumpSha256,visibility:'private'},
      ] : []),
      ...(collectionUniverse ? [
        {id:'db01-original-collection-universe-predicates',
          sha256:collectionUniverse.source.sourceSqliteSha256,visibility:'private'},
        {id:'db01-original-collection-universe-il2cpp',
          sha256:collectionUniverse.source.sourceIl2cppDumpSha256,visibility:'private'},
      ] : []),
      ...(activityCrafting ? [
        {id:'db01-original-collection-activity-crafting',
          sha256:activityCrafting.source.sourceSqliteSha256,visibility:'private'},
        {id:'db01-original-collection-activity-crafting-il2cpp',
          sha256:activityCrafting.source.sourceIl2cppDumpSha256,visibility:'private'},
      ] : []),
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
    sourceItemTypeMetadataAdded:itemTypes ? typed.size : 0,
    sourceCollectionDirectListingsAdded:collectionMenus ? menuListed.size : 0,
    sourceCollectionUniversePredicateCandidatesAdded:
      collectionUniverse ? universeCandidates.size : 0,
    sourceActivityCraftingPredicateEvidenceAdded:
      activityCrafting ? activityCraftingRows.size : 0,
    sourceUniversePredicatesSuppressedByCrafting:
      universePredicatesSuppressedByCrafting,
    worldAvailabilityDerivedFromTags:false,dlcOwnershipDerivedFromTags:false,
    publishable:false,
  });
}