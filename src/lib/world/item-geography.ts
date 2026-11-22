/**
 * Shared DB-04 location adapter for DB-01 definitions and DB-02 acquisition.
 *
 * Reuses the existing source-verified DB-01 lazy catalog and DB-02's
 * independently validated DB-01↔DB-02 join. Does NOT parse/guess item
 * acquisition locations from recipe/loot/shop IDs and never infers player
 * placement or legal decoration zones from default GridObjects.
 *
 * This is a local-only, read-only TypeScript API, usable by Collection,
 * Guide, Gallery, Save Editor, Decorate and Presets.
 */
import type { Db01CatalogClient, Db01Item } from '../items/index.ts';
import type { Db01Db02Join, Db01Db02JoinResult } from '../items/db02-join.ts';
import type { Db01UniversePredicateClient, Db01UniversePredicateMatch } from
  '../items/collection-universe.ts';
import { WorldReferenceIndex, type ItemWorldRelations,
  type NativeAreaReference, type NativeSourceItemReference,
  type WorldIdentity } from './reference-graph.ts';
import {DB04_NATIVE_SCOPE_CLIENT, type Db04NativeItemScopeClient,
  type Db04NativeItemScopeRow} from './native-item-scope.ts';

export const DB04_ITEM_GEOGRAPHY_JOIN = 'wand.db04.item-geography-join@1' as const;

export interface SourceDefaultLocation {
  /** Original default GridObject; not the user's actual saved placement. */
  readonly evidence: NativeSourceItemReference;
  readonly world: WorldIdentity | null;
  readonly area: NativeAreaReference | null;
  readonly verifiedSourceWorldReference: boolean;
  readonly verifiedSourceAreaReference: boolean;
  readonly originalSourceOnly: true;
  readonly savedPlayerPlacementVerified: false;
  readonly acquisitionLocationVerified: false;
  readonly placeableInWorldVerified: false;
}
/**
 * Reconciliation of independent original Item Tag/Set-name evidence and the
 * DB-01 CollectionSet dynamic-selector static-predicate matches.
 *
 * This is evidence about original definitions, NOT proven Collection UI
 * membership, world of origin, DLC ownership or live store availability.
 */
export interface SourceUniverseReconciliation {
  readonly directNativeUniverseTagKeys: readonly string[];
  readonly staticSourcePredicateKeys: readonly string[];
  readonly sourcePredicateAlsoInDirectOrSetNameKeys: readonly string[];
  readonly sourcePredicateOnlyKeys: readonly string[];
  readonly setNameCandidateWithoutPredicateKeys: readonly string[];
  readonly gameRuntimeMembershipVerified: false;
  readonly gameUiVisibilityVerified: false;
  readonly dlcOwnershipVerified: false;
}
export interface WorldItemGeography {
  readonly contract: typeof DB04_ITEM_GEOGRAPHY_JOIN;
  readonly itemId: number;
  readonly gameVersion: string;
  readonly sourceWorldManifestSha256: string;
  readonly definition: Readonly<Db01Item> | null;
  readonly definitionStatus:
    | 'db01_native_definition_present'
    | 'not_in_partial_db01_catalog';
  /** Existing DB-01↔DB-02 source-pinned read result (or null if omitted). */
  readonly staticDb02Acquisition: Db01Db02JoinResult | null;
  readonly originalDefaultLocations: readonly SourceDefaultLocation[];
  readonly sourceRelations: ItemWorldRelations;
  /** Exact original itemlist Tag IDs, independent of default GridObjects. */
  readonly originalItemScopeTags: Readonly<Db04NativeItemScopeRow> | null;
  /** Null = client not attached; [] = source checked, no predicate match. */
  readonly sourceCollectionUniversePredicateMatches:
    readonly Readonly<Db01UniversePredicateMatch>[] | null;
  /** Only available when BOTH independent source clients were attached. */
  readonly sourceUniverseReconciliation: SourceUniverseReconciliation | null;
  readonly sourceVersionMatched: true;
  readonly itemOriginWorldVerified: false;
  readonly itemAcquisitionWorldVerified: false;
  readonly playerSavePlacementVerified: false;
  readonly itemPlacementLegalityVerified: false;
  readonly dlcEntitlementVerified: false;
  readonly publicationAuthorized: false;
}
export interface Db04ItemGeographyBridge {
  readonly contract: typeof DB04_ITEM_GEOGRAPHY_JOIN;
  readonly source: Readonly<{
    platform: 'Steam';
    gameVersion: string;
    worldManifestSha256: string;
    db01NativeManifestSha256: string;
    db02Attached: boolean;
    originalItemScopeAttached: boolean;
    collectionUniversePredicatesAttached: boolean;
  }>;
  getItem(itemId: number): Promise<WorldItemGeography>;
}
const SHA = /^[a-f0-9]{64}$/;
function check(value:unknown,why:string):asserts value{
  if(!value)throw new TypeError('DB04_ITEM_GEOGRAPHY_'+why);
}

/**
 * DB-02 is optional: the original initial-placement data must be usable
 * when a visitor hasn't loaded acquisition sources or a save file.
 *
 * The DB-02 join MUST have been created with the independently pinned
 * manifest/Condition verification in src/lib/items/db02-join.ts.
 * Comparing DB-01 and DB-04 game versions does not imply byte-identical
 * source files; this is an exact Item ID cross-reference only.
 */
export function createDb04ItemGeographyBridge(
  world:WorldReferenceIndex,
  db01:Db01CatalogClient,
  db02:Db01Db02Join|null=null,
  nativeScope:Db04NativeItemScopeClient|null=null,
  collectionUniverse:Db01UniversePredicateClient|null=null
):Db04ItemGeographyBridge{
  check(world instanceof WorldReferenceIndex,'VERIFIED_WORLD_INDEX_REQUIRED');
  check(db01?.source?.privateOnly===true &&
    db01.source.platform==='Steam' &&
    db01.source.gameVersion===world.target.gameVersion &&
    typeof db01.source.nativeSourceManifestSha256==='string' &&
    SHA.test(db01.source.nativeSourceManifestSha256) &&
    typeof db01.getItem==='function',
    'DB01_PRIVATE_EXACT_VERSION_REQUIRED');
  if(db02!==null){
    check(db02?.contract==='wand.db01.db02-private-source-join@1' &&
      db02.source?.platform==='Steam' &&
      db02.source.gameVersion===world.target.gameVersion &&
      SHA.test(db02.source.manifestSha256) &&
      SHA.test(db02.source.currentConditionSha256) &&
      typeof db02.getItem==='function',
      'DB02_VERIFIED_EXACT_VERSION_REQUIRED');
  }
  if(nativeScope!==null){
    check(nativeScope.contract===DB04_NATIVE_SCOPE_CLIENT &&
      nativeScope.source?.platform==='Steam' &&
      nativeScope.source.gameVersion===world.target.gameVersion &&
      nativeScope.source.privateOnly===true &&
      nativeScope.source.publicationAuthorized===false &&
      SHA.test(nativeScope.source.auditSha256) &&
      SHA.test(nativeScope.source.rowsSha256) &&
      Object.values(nativeScope.source.sourceSha256ByCategory)
        .length===4 &&
      Object.values(nativeScope.source.sourceSha256ByCategory)
        .every(v=>SHA.test(v)) &&
      typeof nativeScope.getItem==='function',
      'NATIVE_SCOPE_PRIVATE_EXACT_VERSION_REQUIRED');
  }
  if(collectionUniverse!==null){
    check(collectionUniverse.source?.gameVersion===world.target.gameVersion &&
      collectionUniverse.source.sourceItemsSha256===db01.source.sourceItemsSha256 &&
      collectionUniverse.source.sourceDefinitionCount===db01.source.definitions &&
      SHA.test(collectionUniverse.source.sourceSqliteSha256) &&
      SHA.test(collectionUniverse.source.sourceIl2cppDumpSha256) &&
      typeof collectionUniverse.getItem==='function',
      'DB01_UNIVERSE_PREDICATE_SOURCE_MISMATCH');
  }
  const source=Object.freeze({
    platform:'Steam' as const,
    gameVersion:world.target.gameVersion,
    worldManifestSha256:world.target.nativeWorldManifestSha256,
    db01NativeManifestSha256:db01.source.nativeSourceManifestSha256,
    db02Attached:db02!==null,
    originalItemScopeAttached:nativeScope!==null,
    collectionUniversePredicatesAttached:collectionUniverse!==null
  });
  return Object.freeze({
    contract:DB04_ITEM_GEOGRAPHY_JOIN,
    source,
    async getItem(itemId:number):Promise<WorldItemGeography>{
      check(Number.isSafeInteger(itemId)&&itemId>0,
        'INVALID_ITEM_ID');
      const [definition,staticDb02Acquisition,rawUniverseMatches]=await Promise.all([
        db01.getItem(itemId),
        db02===null ? Promise.resolve(null) : db02.getItem(itemId),
        collectionUniverse===null?Promise.resolve(null):
          collectionUniverse.getItem(itemId)
      ]);
      check(definition===null||definition.itemId===itemId,
        'DB01_ITEM_ID_MISMATCH');
      const originalItemScopeTags=nativeScope?.getItem(itemId)??null;
      const nativeCategory=definition?.nativeCategory;
      const scopedCategory=nativeCategory==='Furniture'||nativeCategory==='Clothing'||
        nativeCategory==='Trimming'||nativeCategory==='ActivityItem';
      if(nativeScope!==null){
        check(scopedCategory===(originalItemScopeTags!==null) &&
          (originalItemScopeTags===null||(
            definition!==null &&
            originalItemScopeTags.itemId===itemId &&
            originalItemScopeTags.nativeCategory===definition.nativeCategory &&
            definition.sourceSha256===
              nativeScope.source.sourceSha256ByCategory[originalItemScopeTags.nativeCategory]
          )),
          'DB01_NATIVE_SCOPE_ORIGINAL_IDENTITY_MISMATCH');
      }
      check(rawUniverseMatches===null||(
        Array.isArray(rawUniverseMatches)&&
        rawUniverseMatches.every(match=>(
          (definition?.nativeCategory==='Furniture'||
           definition?.nativeCategory==='Clothing') &&
          match.nativeCategory===definition.nativeCategory &&
          match.sourcePredicateMatched===true &&
          match.gameUiMembershipVerified===false &&
          match.gameUiVisibilityVerified===false &&
          match.worldAvailabilityVerified===false &&
          match.dlcOwnershipVerified===false &&
          typeof match.universeTagKey==='string' &&
          /^[A-Za-z][A-Za-z0-9_]*$/.test(match.universeTagKey)
        ))
      ),'SOURCE_UNIVERSE_PREDICATE_REPLY_MISMATCH');
      const sourceCollectionUniversePredicateMatches=rawUniverseMatches===null?
        null:Object.freeze(rawUniverseMatches.map(match=>Object.freeze({...match})));
      const sourceUniverseReconciliation:SourceUniverseReconciliation|null=
        nativeScope===null||collectionUniverse===null?null:(()=>{
          const direct=Object.freeze([...(originalItemScopeTags?.universeTagsDirect??[])]);
          const knownNames=new Set([
            ...direct,...(originalItemScopeTags?.universeSetCandidates??[])
          ]);
          const predicates=Object.freeze([...new Set(
            (sourceCollectionUniversePredicateMatches??[]).map(match=>
              match.universeTagKey))].sort());
          const predicateNames=new Set(predicates);
          return Object.freeze({
            directNativeUniverseTagKeys:direct,
            staticSourcePredicateKeys:predicates,
            sourcePredicateAlsoInDirectOrSetNameKeys:Object.freeze(
              predicates.filter(tag=>knownNames.has(tag))),
            sourcePredicateOnlyKeys:Object.freeze(
              predicates.filter(tag=>!knownNames.has(tag))),
            setNameCandidateWithoutPredicateKeys:Object.freeze(
              (originalItemScopeTags?.universeSetCandidates??[])
                .filter(tag=>!predicateNames.has(tag))),
            gameRuntimeMembershipVerified:false as const,
            gameUiVisibilityVerified:false as const,
            dlcOwnershipVerified:false as const,
          });
        })();
      check(staticDb02Acquisition===null||(
        staticDb02Acquisition.contract==='wand.db01.db02-private-source-join@1' &&
        staticDb02Acquisition.itemId===itemId &&
        staticDb02Acquisition.versionAndSourceProvenanceMatched===true &&
        staticDb02Acquisition.publicationAuthorized===false &&
        staticDb02Acquisition.liveAvailabilityVerified===false &&
        staticDb02Acquisition.saveWritingAuthorized===false &&
        (staticDb02Acquisition.definition===null||
         staticDb02Acquisition.definition.itemId===itemId)),
      'DB02_ITEM_ID_OR_PROVENANCE_MISMATCH');

      const relations=world.itemWorldRelations(itemId);
      const originalDefaultLocations=relations.nativeSourceInitialPlacement.values.map(
        (evidence):SourceDefaultLocation=>{
          const nativeWorld=evidence.worldId===null
            ?null:world.getWorld(evidence.worldId);
          const nativeArea=evidence.areaRefId===null
            ?null:world.getArea(evidence.areaRefId);
          check((evidence.worldId===null||nativeWorld!==null) &&
            (evidence.areaRefId===null||nativeArea!==null),
            'WORLD_AREA_EXACT_JOIN_BROKEN');
          return Object.freeze({
            evidence,world:nativeWorld,area:nativeArea,
            verifiedSourceWorldReference:nativeWorld!==null,
            verifiedSourceAreaReference:nativeArea!==null,
            originalSourceOnly:true,
            savedPlayerPlacementVerified:false,
            acquisitionLocationVerified:false,
            placeableInWorldVerified:false
          });
        }
      );
      return Object.freeze({
        contract:DB04_ITEM_GEOGRAPHY_JOIN,
        itemId,gameVersion:world.target.gameVersion,
        sourceWorldManifestSha256:world.target.nativeWorldManifestSha256,
        definition,
        definitionStatus:definition!==null
          ?'db01_native_definition_present':'not_in_partial_db01_catalog',
        staticDb02Acquisition,
        originalDefaultLocations:Object.freeze(originalDefaultLocations),
        sourceRelations:relations,
        originalItemScopeTags,
        sourceCollectionUniversePredicateMatches,
        sourceUniverseReconciliation,
        sourceVersionMatched:true,
        itemOriginWorldVerified:false,
        itemAcquisitionWorldVerified:false,
        playerSavePlacementVerified:false,
        itemPlacementLegalityVerified:false,
        dlcEntitlementVerified:false,
        publicationAuthorized:false
      });
    }
  });
}
