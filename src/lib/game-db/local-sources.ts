/**
 * DB-00 optional, owner-local connection to DB-01's original native definitions
 * and DB-04's native World / Universe Tag evidence.
 *
 * Reuse exact source-verified DB-01/04 readers; never infer Collection screen
 * membership, item availability, DLC rights, or ownership from native Tags.
 * Nothing is fetched, uploaded, persisted or published by this module.
 */
import {canonicalId} from './model.ts';
import {
  joinCurrentGameSources,
  type Db00SourceJoinedItem,type Db00SourceWorldPage
} from './source-join.ts';
import type {
  PublicSharedGameSources
} from './public-sources.ts';
import type {
  Db01SharedItem,Db01SharedItemClient
} from '../items/shared-view.ts';
import type {
  Db04NativeItemScopeClient,Db04WorldTag,Db04NativeScopePage
} from '../world/native-item-scope.ts';
import type {SharedDbFilter} from './integrated.ts';

export const DB00_LOCAL_SOURCES_SCHEMA='wand.game-db.local-sources@1' as const;
const SHA=/^[a-f0-9]{64}$/;
const KNOWN_WORLD_TAGS=new Set<string>([
  'IsDreamlightValley','IsEternityIsle','IsStorybookVale',
  'IsWishBlossomMountains','isSeaOfSecrets','isHoneywood'
]);

export interface Db00LocalSourceOptions {
  /** Existing private, SHA-verified full 39,067-definition DB-01 reader. */
  readonly db01?:Db01SharedItemClient;
  /** Independently known source-items SHA, not copied from the DB-01 reader. */
  readonly expectedDb01SourceItemsSha256?:string;
  /** Existing private, independently verified 13,202-row DB-04 reader. */
  readonly nativeScope?:Db04NativeItemScopeClient;
  /** Independently known hashes, not copied from the DB-04 source reader. */
  readonly nativeScopePins?:Readonly<{auditSha256:string;rowsSha256:string}>;
}
export interface Db00LocalItem {
  readonly itemId:string;
  readonly shared:Db00SourceJoinedItem;
  /** null = no original definition; a loaded original does not mean a UI item. */
  readonly originalDefinition:Readonly<Db01SharedItem>|null;
  readonly originalDefinitionStatus:
    'source_not_connected'|'source_native_definition'|'not_in_original_corpus';
  /** true only when both original DB-01 and DB-04 directly attest same World Tag set. */
  readonly nativeWorldTagsCrossChecked:boolean;
  readonly originalSourceOnly:true;
  readonly gameUiCategoryVerified:false;
  readonly gameUiSubcategoryVerified:false;
  readonly collectionUiMembershipVerified:false;
  readonly acquisitionWorldVerified:false;
  readonly dlcEntitlementVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface Db00LocalSourcePage{
  readonly total:number;
  readonly offset:number;
  readonly nextOffset:number|null;
  readonly items:readonly Db00LocalItem[];
  readonly gameUiMembershipVerified:false;
}
export interface Db00LocalWorldPage{
  readonly sourcePage:Db04NativeScopePage;
  readonly items:readonly Db00LocalItem[];
  readonly gameUiMembershipVerified:false;
}
export interface Db00LocalSourceReader{
  readonly contract:typeof DB00_LOCAL_SOURCES_SCHEMA;
  readonly snapshotId:string;
  readonly ownerLocalOnly:true;
  readonly publicationAuthorized:false;
  readonly privateDb01Connected:boolean;
  readonly privateDb04Connected:boolean;
  getItem(id:number|string):Promise<Db00LocalItem>;
  getItems(ids:readonly (number|string)[]):Promise<readonly Db00LocalItem[]>;
  /** Queries verified DB-00 current facts, then attaches local native metadata. */
  queryPublishedItems(filters?:readonly SharedDbFilter[],
    page?:Readonly<{offset?:number;limit?:number}>):Promise<Db00LocalSourcePage>;
  /** This is an original Tag lookup; never a Collection world selector. */
  byNativeWorldTag(tag:Db04WorldTag,
    page?:Readonly<{offset:number;limit:number}>):Promise<Db00LocalWorldPage>;
}
function assert(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB00_LOCAL_SOURCES_'+code);
}
/**
 * Attach trusted local, version-compatible original evidence to the existing
 * public data instance. The underlying verified DB-00 facts remain untouched.
 */
export function joinLocalGameSources(
  publicData:PublicSharedGameSources,
  options:Db00LocalSourceOptions
):Db00LocalSourceReader {
  assert(publicData?.schema==='wand.game-db.public-sources@1' &&
    publicData.snapshotId==='steam-1.26.2-native-itemlist-v1' &&
    publicData.database?.target.platform==='Steam' &&
    publicData.database.target.gameVersion==='1.26.2' &&
    publicData.database.itemCount===13202 &&
    publicData.acquisition?.coverage.requiresPrivateGameArchive===false &&
    publicData.guide?.evidence.integrity==='pinned_public_sha256',
    'PUBLIC_EXACT_SOURCE_REQUIRED');
  assert(options!==null&&typeof options==='object'&&
    (options.db01!==undefined||options.nativeScope!==undefined),
    'OWNER_LOCAL_SOURCE_REQUIRED');
  const {db01,expectedDb01SourceItemsSha256,nativeScope,nativeScopePins}=options;
  if(db01){
    const source=db01.source,coverage=db01.getCoverage();
    assert(typeof expectedDb01SourceItemsSha256==='string' &&
      SHA.test(expectedDb01SourceItemsSha256) &&
      source.platform==='Steam'&&source.gameVersion==='1.26.2'&&
      source.sourceItemsSha256===expectedDb01SourceItemsSha256 &&
      source.definitions===39067&&coverage.totalDefinitions===39067&&
      (coverage.tagAssociatedDefinitions===null||
        coverage.tagAssociatedDefinitions===14973)&&
      coverage.actualGameUiMembershipVerified===false &&
      coverage.worldAvailabilityVerified===false &&
      coverage.dlcOwnershipVerified===false &&
      typeof db01.getItems==='function',
      'DB01_INDEPENDENT_CURRENT_PRIVATE_SOURCE_REQUIRED');
  }else {
    assert(expectedDb01SourceItemsSha256===undefined,
      'DB01_PIN_WITHOUT_SOURCE');
  }
  const joined=joinCurrentGameSources(publicData.database,{
    origins:publicData.acquisition.origins,rewards:publicData.guide,
    staticContainers:publicData.acquisition.staticContainerSource,
    questTargets:publicData.guideQuestTargets,
    nativeScope,nativeScopePins
  });
  const build=(itemId:string,shared:Db00SourceJoinedItem,
    originalDefinition:Readonly<Db01SharedItem>|null):Db00LocalItem=>{
    const numeric=Number(itemId);
    assert(!originalDefinition||(
      originalDefinition.itemId===numeric &&
      originalDefinition.item.itemId===numeric &&
      originalDefinition.gameVersion==='1.26.2' &&
      originalDefinition.nativeCategory===originalDefinition.item.nativeCategory &&
      originalDefinition.collection.actualGameUiMembershipVerified===false &&
      originalDefinition.screenCategory===null &&
      originalDefinition.screenSubcategory===null &&
      originalDefinition.availableWorlds===null &&
      originalDefinition.dlcEntitlements===null &&
      originalDefinition.runtimeCollectionState===null &&
      originalDefinition.publicationAuthorized===false
    ),'DB01_NATIVE_ITEM_ID_OR_STATUS_MISMATCH');
    if(shared.catalog){
      assert(!db01||(
        originalDefinition!==null &&
        originalDefinition.item.catalogDomain==='item' &&
        (!shared.catalog.nativeCategory ||
          originalDefinition.nativeCategory===shared.catalog.nativeCategory)
      ),'DB01_PUBLISHED_ITEM_IDENTITY_MISMATCH');
    }else{
      assert(!originalDefinition||
        originalDefinition.item.catalogDomain!=='item',
        'DB01_UNPUBLISHED_ITEM_DOMAIN_CONFLICT');
    }
    let nativeWorldTagsCrossChecked=false;
    if(originalDefinition?.originalTags&&shared.nativeTags.status==='source_native_tag_only'){
      const tags=originalDefinition.originalTags;
      assert(tags.itemId===numeric&&tags.nativeCategory===originalDefinition.nativeCategory &&
        tags.gameUiCategoryVerified===false&&
        tags.dlcOwnershipVerified===false&&tags.worldAvailabilityVerified===false,
        'DB01_TAG_EVIDENCE_MISMATCH');
      const fromDb01=(tags.facets.worldContextTag??[])
        .filter(value=>KNOWN_WORLD_TAGS.has(value)).sort();
      const fromDb04=[...shared.nativeTags.worldsDirect].sort();
      assert(fromDb01.length===fromDb04.length &&
        fromDb01.every((value,i)=>value===fromDb04[i]),
        'DB01_DB04_DIRECT_WORLD_TAG_CONFLICT');
      nativeWorldTagsCrossChecked=true;
    }
    return Object.freeze({
      itemId,shared,originalDefinition,
      originalDefinitionStatus:!db01?'source_not_connected' as const:
        originalDefinition?'source_native_definition' as const:
          'not_in_original_corpus' as const,
      nativeWorldTagsCrossChecked,
      originalSourceOnly:true as const,
      gameUiCategoryVerified:false as const,
      gameUiSubcategoryVerified:false as const,
      collectionUiMembershipVerified:false as const,
      acquisitionWorldVerified:false as const,
      dlcEntitlementVerified:false as const,
      playerOwnershipVerified:false as const
    });
  };
  const getItems=async(
    ids:readonly (number|string)[]
  ):Promise<readonly Db00LocalItem[]>=>{
    assert(Array.isArray(ids)&&ids.length<=4096,'INVALID_BATCH');
    const canonical=ids.map(canonicalId);
    const shared=joined.getItems(canonical);
    const definitions=db01?await db01.getItems(canonical.map(Number)):
      canonical.map(()=>null);
    assert(Array.isArray(definitions)&&definitions.length===canonical.length,
      'DB01_BATCH_ALIGNMENT');
    return Object.freeze(canonical.map((id,i)=>
      build(id,shared[i],definitions[i]??null)));
  };
  return Object.freeze({
    contract:DB00_LOCAL_SOURCES_SCHEMA,
    snapshotId:joined.snapshotId,
    ownerLocalOnly:true as const,
    publicationAuthorized:false as const,
    privateDb01Connected:db01!==undefined,
    privateDb04Connected:nativeScope!==undefined,
    async getItem(id:number|string){
      return (await getItems([id]))[0];
    },
    getItems,
    async queryPublishedItems(filters:readonly SharedDbFilter[]=[],
      page:Readonly<{offset?:number;limit?:number}>={}):Promise<Db00LocalSourcePage>{
      const result=publicData.database.queryItems(filters,page);
      const items=await getItems(result.items.map(item=>item.id));
      return Object.freeze({
        total:result.total,offset:result.offset,nextOffset:result.nextOffset,
        items,gameUiMembershipVerified:false as const
      });
    },
    async byNativeWorldTag(tag:Db04WorldTag,
      page?:Readonly<{offset:number;limit:number}>):Promise<Db00LocalWorldPage>{
      const result:Db00SourceWorldPage=joined.byNativeWorldTag(tag,page);
      const items=await getItems(result.items.map(item=>item.itemId));
      return Object.freeze({
        sourcePage:result.sourcePage,items,
        gameUiMembershipVerified:false as const
      });
    }
  });
}
