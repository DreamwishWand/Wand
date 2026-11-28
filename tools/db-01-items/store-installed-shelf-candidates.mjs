/** Join actual positive store upgrade shelf slots, not every generic layout.
 * Native 1.26.2 StoreUtil.GetScroogeStoreItemList -> AddItemsToResult -> 
 * ItemGenerator.GetFilteredItemList enumerates candidates, with price table
 * partitions. Runtime ownership, expansion, price and uniqueness gates
 * remain separate; this index never adds an acquisition category.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
export function buildInstalledShelfCandidates(rows,source,layout,catalog){
  const out=new Map(),sha=source.sourceFilesSha256;
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
    sha.Building!=='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0'||
    sha.Display!=='6ba1986365d04a1b1db665a48f3289eee18ee166fcbb864c470093c20d2ea452'||
    sha.Clothing!=='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946'||
    sha.Furniture!=='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196')return out;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const building=known.get(20300028),b=props(building);
  if(building?.nativeCategory!=='Building'||b.DisplayName!=='Building.ScroogeStore_DisplayName'||
    b.DefaultGridLayoutPath!=='SceneLayouts/Rooms/ScroogeShop/ScroogeShop_DefaultLayout.json')return out;
  const byArea=new Map(layout.areas.map(a=>[a.key,a])),slots=new Map();
  for(const [ui,u] of (b.UpgradeInfo??[]).entries()){
    if(!id(u.Level))continue;
    for(const [di,d] of (u.Store?.Displays??[]).entries()){
      const def=layout.displayDefinitions.get(d.ItemID);
      if(!id(d.Quantity)||def?.kind!=='shelf')continue;
      const p=props(known.get(d.ItemID));
      for(const [si,s] of def.shelfSlots.entries()){
        const area=byArea.get(s.areaKey);if(!area)continue;
        const a=slots.get(s.areaKey)??[];
        a.push({displayItemId:d.ItemID,upgradeLevel:u.Level,configuredDisplayQuantity:d.Quantity,
          buildingSourcePath:'source.UpgradeInfo['+ui+'].Store.Displays['+di+'].ItemID',
          shelfSlotIndex:si,shelfSlotAmount:s.amount,areaKey:s.areaKey,
          areaRecordIndex:area.recordIndex,areaSourceRecordSha256:area.sourceRecordSha256,
          priceTables:p.PricesTables??null,uniqueTagsFilters:p.UniqueTagsFilters??null,
          gridReviewRequired:!!area.filter.grid,
          directTagReviewRequired:!!(area.filter.allTags||area.filter.anyTags),
          sourceProtoDbSha256:area.sourceProtoDbSha256});
        slots.set(s.areaKey,a);
      }
    }
  }
  const counts={};
  for(const [itemId,candidate] of layout.candidates){
    const row=known.get(itemId),f=catalog.facts.get(itemId);
    const links=candidate.matchingAreaKeys.flatMap(k=>slots.get(k)??[]);
    if(!links.length)continue;
    out.set(itemId,links.map(l=>({...l,buildingItemId:building.itemId,
      targetItemId:itemId,sourceGameVersion:source.target.gameVersion,
      sourceDisplaySha256:sha.Display,sourceBuildingSha256:sha.Building,
      sourceItemFileSha256:sha[row.nativeCategory],
      catalogGateStatus:f?.gateStatus??null,catalogFlagsKnown:f?.flagsKnown??false,
      catalogExclusionFlags:f?.exclusionFlags??null,
      sourceTagIds:row.tags.filter(t=>t.sourceField===9).map(t=>t.id),
      directLayoutMatch:true,nativeOwnershipCheckRequired:row.nativeCategory==='Clothing',
      gridPredicateEvaluated:false,runtimeStorePoolVerified:false,
      storeMembershipVerified:false,currentAvailabilityVerified:false})));
    counts[row.nativeCategory]=(counts[row.nativeCategory]??0)+1;
  }
  console.log('DB01_INSTALLED_SHELF '+JSON.stringify({counts,items:out.size,occurrences:[...out.values()].flat().length,areas:[...slots.keys()]}));
  return out;
}
