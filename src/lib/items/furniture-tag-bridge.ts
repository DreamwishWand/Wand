/**
 * DB-01 source-corrected Furniture Tag bridge.
 *
 * Joins the 6,746 version-pinned native FurnitureItem records to the common
 * DB-01 catalog and classification Tag overlay. The historic Tag overlay
 * omitted the exact FurnitureBlockerItemData field-14 Tags, so it must not
 * be used by itself to evaluate native IHasTags.HasTag.
 *
 * This bridge computes the actual source HasTag direct + IHasSet-inherited
 * Tag IDs, and separately exposes original overlay references that are NOT
 * native HasTag evidence. Loads originals only from caller-provided private
 * SHA-verified readers. Run full scans in a Web Worker.
 */
import type {Db01CatalogClient} from './index.ts';
import type {Db01ClassificationClient,Db01TagRef} from './classification.ts';
import {
  DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS,
  type Db01OriginalFurnitureSubtype,
  type Db01OriginalFurnitureHasTagClient,
  type Db01OriginalFurnitureHasTagItem,
} from './furniture-native-has-tag.ts';

export const DB01_VERIFIED_FURNITURE_TAG_BRIDGE=
  'wand.db01.verified-furniture-tag-join-steam-1262@1' as const;

export interface Db01VerifiedFurnitureTagItem{
  readonly itemId:number;
  readonly originalNativeClass:Db01OriginalFurnitureSubtype;
  readonly originalTagsFieldNumber:number;
  readonly nativeDirectTagIds:readonly number[];
  readonly nativeInheritedSetTagIds:readonly number[];
  /** Native HasTag predicate tests this OR-union; no other source wire fields. */
  readonly nativeHasTagIds:readonly number[];
  /** Direct native Tags absent from the old generic DB-01 Tag overlay.
   * All 19 missing Steam 1.26.2 references are FurnitureBlocker field 14.
   * With a rebuilt classification overlay this list becomes empty.
   */
  readonly missingClassificationDirectTagIds:readonly number[];
  /** Other Tag associations in the generic source overlay; may be useful
   * facets but are NOT part of the object's direct IHasTags.Tags field.
   */
  readonly otherSourceTagReferences:readonly Readonly<Db01TagRef>[];
  readonly originalFurnitureSourceVerified:true;
  readonly nativeHasTagSemanticsVerified:true;
  readonly collectionUiMembershipVerified:false;
  readonly worldAvailabilityVerified:false;
  readonly dlcEntitlementVerified:false;
}

export interface Db01VerifiedFurnitureTagQuery{
  /** Source class, NOT the game-screen Collection category. */
  readonly nativeClasses?:readonly Db01OriginalFurnitureSubtype[];
  readonly tagIds?:readonly number[];
  readonly tagMatch?:'all'|'any';
  readonly includeInheritedSetTags?:boolean;
  readonly offset?:number;
  readonly limit?:number;
}
export interface Db01VerifiedFurnitureTagPage{
  readonly itemIds:readonly number[];
  readonly total:number;
  readonly hasMore:boolean;
  readonly originalNativeHasTagSourceOnly:true;
  readonly gameCollectionAreaMembershipVerified:false;
  readonly playerOwnershipVerified:false;
  readonly dlcEntitlementVerified:false;
}
export interface Db01VerifiedFurnitureTagCoverage{
  readonly gameVersion:'1.26.2';
  readonly sourceFurnitureItems:6746;
  readonly originalNativeClasses:Readonly<Record<Db01OriginalFurnitureSubtype,number>>;
  readonly nativeDirectTaggedItems:number;
  readonly nativeInheritedTaggedItems:number;
  readonly legacyOverlayMissingDirectTaggedItems:number;
  readonly legacyOverlayMissingDirectTagReferences:number;
  readonly nativeHasTagSourceCompletelyIndexed:true;
  readonly gameCollectionAreaMembershipVerified:false;
}
export interface Db01VerifiedFurnitureTagClient{
  readonly contract:typeof DB01_VERIFIED_FURNITURE_TAG_BRIDGE;
  getItem(id:number):Promise<Readonly<Db01VerifiedFurnitureTagItem>|null>;
  /** Complete source scan; loads all native furniture IDs and both overlays. */
  getCoverage():Promise<Readonly<Db01VerifiedFurnitureTagCoverage>>;
  search(query?:Db01VerifiedFurnitureTagQuery):
    Promise<Readonly<Db01VerifiedFurnitureTagPage>>;
}

const specs=DB01_ORIGINAL_FURNITURE_SUBTYPE_SPECS;
const names=new Set<string>(Object.keys(specs));
const positive=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const nonnegative=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function ensure(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB01_FURNITURE_TAG_BRIDGE_'+code);
}
function queryValidate(raw:Db01VerifiedFurnitureTagQuery):Required<Db01VerifiedFurnitureTagQuery>{
  ensure(!!raw&&typeof raw==='object'&&!Array.isArray(raw),'INVALID_QUERY');
  const nativeClasses=raw.nativeClasses??Object.keys(specs) as Db01OriginalFurnitureSubtype[];
  ensure(Array.isArray(nativeClasses)&&nativeClasses.length<=names.size&&
    nativeClasses.every(x=>typeof x==='string'&&names.has(x))&&
    new Set(nativeClasses).size===nativeClasses.length,'INVALID_CLASS_FILTER');
  const tagIds=raw.tagIds??[];
  ensure(Array.isArray(tagIds)&&tagIds.length<=256&&tagIds.every(positive)&&
    new Set(tagIds).size===tagIds.length,'INVALID_TAG_FILTER');
  const tagMatch=raw.tagMatch??'any';
  ensure(tagMatch==='all'||tagMatch==='any','INVALID_MATCH_MODE');
  const includeInheritedSetTags=raw.includeInheritedSetTags??true;
  ensure(typeof includeInheritedSetTags==='boolean','INVALID_INHERITANCE');
  const offset=raw.offset??0,limit=raw.limit??100;
  ensure(nonnegative(offset)&&nonnegative(limit)&&limit<=1000&&
    offset<=1_000_000,'INVALID_PAGINATION');
  return {nativeClasses,tagIds,tagMatch,includeInheritedSetTags,offset,limit};
}

export function createDb01VerifiedFurnitureTagClient(
  catalog:Db01CatalogClient,
  classification:Db01ClassificationClient,
  furniture:Db01OriginalFurnitureHasTagClient,
):Db01VerifiedFurnitureTagClient{
  const c=catalog?.source,t=classification?.source,f=furniture?.source;
  ensure(c?.privateOnly===true&&c.platform==='Steam'&&
    c.gameVersion==='1.26.2'&&c.fullCorpusParsed===true&&
    t?.privateOnly===true&&t.gameVersion===c.gameVersion&&
    t.sourceItemsSha256===c.sourceItemsSha256&&
    t.tagOriginalSha256===f?.sourceTagSha256&&
    f?.gameVersion===c.gameVersion&&
    typeof catalog.getCategory==='function'&&
    typeof classification.getItem==='function'&&
    typeof classification.getItems==='function'&&
    typeof furniture.getItem==='function'&&
    typeof furniture.getItems==='function',
    'SOURCE_VERSION_OR_READER_MISMATCH');

  function reconcile(
    native:Readonly<Db01OriginalFurnitureHasTagItem>,
    overlay:Awaited<ReturnType<Db01ClassificationClient['getItem']>>,
  ):Readonly<Db01VerifiedFurnitureTagItem>{
    const row=native.original;
    ensure(overlay!==null&&overlay.itemId===row.itemId&&
      overlay.nativeCategory==='Furniture'&&
      overlay.nativeKey===row.nativeKey&&
      overlay.sourceSha256===f.sourceFurnitureSha256&&
      overlay.gameUiCategoryVerified===false&&
      overlay.worldAvailabilityVerified===false&&
      overlay.dlcOwnershipVerified===false,
      'SOURCE_CLASSIFICATION_ITEM_IDENTITY');
    const direct=row.nativeTags;
    const directSet=new Set(direct);
    const inherited=row.setLookup.kind==='has_set'&&
      row.setLookup.definition.kind==='original_set_definition'?
      row.setLookup.definition.nativeTags.filter(x=>!directSet.has(x)):[];
    const tagsField=row.tagsFieldNumber;
    const exactReferences=new Set<number>();
    const otherRefs:Readonly<Db01TagRef>[]=[];
    for(const ref of overlay.tagReferences){
      if(ref.wireField===tagsField){
        // Complete original wire field decoded independently from SHA-pinned
        // source: the older overlay is allowed to MISS field14, never invent.
        ensure(directSet.has(ref.tagId),
          'CONTRADICTORY_NATIVE_TAG_FIELD_REFERENCE');
        exactReferences.add(ref.tagId);
      }else otherRefs.push(ref);
    }
    return Object.freeze({
      itemId:row.itemId,originalNativeClass:row.originalNativeClass,
      originalTagsFieldNumber:tagsField,
      nativeDirectTagIds:direct,
      nativeInheritedSetTagIds:Object.freeze([...inherited]),
      nativeHasTagIds:Object.freeze([...direct,...inherited]),
      missingClassificationDirectTagIds:Object.freeze(
        direct.filter(tag=>!exactReferences.has(tag))),
      otherSourceTagReferences:Object.freeze(otherRefs),
      originalFurnitureSourceVerified:true,
      nativeHasTagSemanticsVerified:true,
      collectionUiMembershipVerified:false,
      worldAvailabilityVerified:false,
      dlcEntitlementVerified:false,
    });
  }

  async function getItem(id:number):
    Promise<Readonly<Db01VerifiedFurnitureTagItem>|null>{
    ensure(positive(id),'INVALID_ITEM_ID');
    const [native,overlay]=await Promise.all([
      furniture.getItem(id),classification.getItem(id),
    ]);
    if(!native)return null;
    return reconcile(native,overlay);
  }
  type Index=Readonly<{
    rows:ReadonlyMap<number,Readonly<Db01VerifiedFurnitureTagItem>>;
    coverage:Readonly<Db01VerifiedFurnitureTagCoverage>;
    ids:readonly number[];
  }>;
  let loader:Promise<Index>|null=null;
  async function build():Promise<Index>{
    const canonical=await catalog.getCategory('Furniture');
    ensure(canonical.length===6746,'SOURCE_FURNITURE_CENSUS');
    const rows=new Map<number,Readonly<Db01VerifiedFurnitureTagItem>>();
    let missingItems=0,missingRefs=0,directItems=0,inheritedItems=0;
    const observed=new Map<Db01OriginalFurnitureSubtype,number>();
    for(let offset=0;offset<canonical.length;offset+=512){
      const slice=canonical.slice(offset,offset+512);
      const ids=slice.map(r=>r.itemId);
      const [native,overlay]=await Promise.all([
        furniture.getItems(ids),classification.getItems(ids),
      ]);
      ensure(native.length===slice.length&&overlay.length===slice.length,
        'SOURCE_BATCH_CENSUS');
      for(let index=0;index<slice.length;index++){
        const n=native[index],c=overlay[index],base=slice[index];
        ensure(n!==null&&n.original.itemId===base.itemId&&
          n.original.nativeKey===base.nativeKey&&
          base.nativeCategory==='Furniture'&&
          base.sourceSha256===f.sourceFurnitureSha256&&
          !rows.has(base.itemId),'SOURCE_FULL_JOIN_MISMATCH');
        const item=reconcile(n,c);
        rows.set(item.itemId,item);
        const klass=item.originalNativeClass;
        observed.set(klass,(observed.get(klass)??0)+1);
        directItems+=Number(item.nativeDirectTagIds.length>0);
        inheritedItems+=Number(item.nativeInheritedSetTagIds.length>0);
        missingItems+=Number(item.missingClassificationDirectTagIds.length>0);
        missingRefs+=item.missingClassificationDirectTagIds.length;
      }
    }
    ensure(rows.size===6746&&
      Object.entries(specs).every(([name,v])=>
        observed.get(name as Db01OriginalFurnitureSubtype)===v.count),
      'SOURCE_ORIGINAL_CLASS_CENSUS');
    // Valid previously verified Steam releases: 19 missing Blocker Tag
    // references, or the regenerated source overlay with none. Fail on
    // other unexpected omissions and never silently accept dropped data.
    ensure((missingItems===19&&missingRefs===19)||
      (missingItems===0&&missingRefs===0),
      'SOURCE_CLASSIFICATION_COVERAGE_DRIFT');
    const coverage:Object=Object.freeze({
      gameVersion:'1.26.2' as const,sourceFurnitureItems:6746 as const,
      originalNativeClasses:Object.freeze(Object.fromEntries(
        Object.entries(specs).map(([name,v])=>[name,v.count]))
      ) as Readonly<Record<Db01OriginalFurnitureSubtype,number>>,
      nativeDirectTaggedItems:directItems,
      nativeInheritedTaggedItems:inheritedItems,
      legacyOverlayMissingDirectTaggedItems:missingItems,
      legacyOverlayMissingDirectTagReferences:missingRefs,
      nativeHasTagSourceCompletelyIndexed:true as const,
      gameCollectionAreaMembershipVerified:false as const,
    });
    return Object.freeze({
      rows,ids:Object.freeze([...rows.keys()].sort((a,b)=>a-b)),
      coverage:coverage as Db01VerifiedFurnitureTagCoverage,
    });
  }
  function indexed():Promise<Index>{
    if(!loader){
      loader=build().catch(error=>{loader=null;throw error;});
    }
    return loader;
  }
  async function search(
    query:Db01VerifiedFurnitureTagQuery={},
  ):Promise<Readonly<Db01VerifiedFurnitureTagPage>>{
    const q=queryValidate(query);
    const index=await indexed();
    const classes=new Set(q.nativeClasses);
    const results:number[]=[];
    let total=0;
    for(const id of index.ids){
      const item=index.rows.get(id)!;
      if(!classes.has(item.originalNativeClass))continue;
      const tags=new Set(q.includeInheritedSetTags?
        item.nativeHasTagIds:item.nativeDirectTagIds);
      if(q.tagIds.length){
        const match=q.tagMatch==='all'?
          q.tagIds.every(t=>tags.has(t)):
          q.tagIds.some(t=>tags.has(t));
        if(!match)continue;
      }
      if(total>=q.offset&&results.length<q.limit)results.push(id);
      total++;
    }
    return Object.freeze({
      itemIds:Object.freeze(results),
      total,hasMore:total>q.offset+results.length,
      originalNativeHasTagSourceOnly:true,
      gameCollectionAreaMembershipVerified:false,
      playerOwnershipVerified:false,
      dlcEntitlementVerified:false,
    });
  }
  return Object.freeze({
    contract:DB01_VERIFIED_FURNITURE_TAG_BRIDGE,
    getItem,getCoverage:async()=>(await indexed()).coverage,search,
  });
}
