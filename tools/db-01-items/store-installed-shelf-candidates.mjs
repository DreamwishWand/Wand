/** Join actual positive store upgrade shelf slots, not every generic layout.
 * Native 1.26.2 StoreUtil.GetScroogeStoreItemList -> AddItemsToResult -> 
 * ItemGenerator.GetFilteredItemList enumerates candidates, with price table
 * partitions. Runtime ownership, expansion, price and uniqueness gates
 * remain separate. Only fully evaluated original clothing shelf routes add a category.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
export function buildInstalledShelfCandidates(rows,source,layout,catalog,prices){
  const out=new Map(),ordinary=new Map(),sha=source.sourceFilesSha256;
  const result={candidates:out,ordinary};
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
    sha.Set!=='3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f'||
    sha.Building!=='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0'||
    sha.Display!=='6ba1986365d04a1b1db665a48f3289eee18ee166fcbb864c470093c20d2ea452'||
    sha.Clothing!=='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946'||
    sha.Furniture!=='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196')return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const building=known.get(20300028),b=props(building);
  if(building?.nativeCategory!=='Building'||b.DisplayName!=='Building.ScroogeStore_DisplayName'||
    b.DefaultGridLayoutPath!=='SceneLayouts/Rooms/ScroogeShop/ScroogeShop_DefaultLayout.json')return result;
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
  const counts={},classificationCounts={},rejected={};
  const reject=k=>{rejected[k]=(rejected[k]??0)+1;};
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
    // The native catalogue enumeration calls ItemGenerator.GetFilteredItemList,
    // then repeats with each positive inclusive price interval. Only clothing
    // type/subtype-only shelves can currently be evaluated end-to-end here.
    // Grid and direct/dynamic tag filters are intentionally not promoted.
    if(row.nativeCategory!=='Clothing')continue;
    if(!f?.flagsKnown||f.exclusionFlags.length||f.gateStatus!=='empty_source_gate'){reject('item_gate');continue;}
    const p=props(row),setId=p.SetItemID;
    if(!Number.isSafeInteger(setId)||setId<0){reject('set_unknown');continue;}
    const set=setId>0?known.get(setId):null;
    const setGate=set?props(set).CatalogVisibilityConditions:null;
    // Native CanBuy falls back to IHasSet when item condition is undefined.
    if(setId>0&&(set?.nativeCategory!=='Set'||set?.sourceClass!=='SetItemData'||
      !setGate||typeof setGate!=='object'||Array.isArray(setGate)||Object.keys(setGate).length)){
      reject('set_gate');continue;
    }
    if(p.IsEvolvedAsset===true){reject('evolved');continue;}
    const override=p.PriceOverride;
    if(!override||typeof override!=='object'||Array.isArray(override)){reject('override_unknown');continue;}
    const provider=prices.items.get(itemId);
    // A formula/ambiguous override is not interchangeable with provider
    // pricing. Accept only an empty override and an explicit sole coin cost.
    if(Object.keys(override).length||!provider||provider.purchaseCosts.length!==1){reject('price_override_or_provider');continue;}
    const price=provider.purchaseCosts[0];
    if(price.currencyItemId!==80000000||!price.amountFieldPresent||!id(price.amount)||price.amount>2147483647){reject('coin_price');continue;}
    const qualifying=[];
    for(const l of links){
      const area=byArea.get(l.areaKey),filter=area?.filter;
      if(!filter||filter.grid||filter.allTags||filter.anyTags||filter.typeCodes?.length!==1||
        filter.typeCodes[0]!==5||filter.subtypes?.length!==1||filter.subtypes[0][0]!==6||
        !filter.subtypes[0][1].includes(row.itemType.subtypeCode))continue;
      if(!Array.isArray(l.priceTables))continue;
      for(const [tableIndex,table] of l.priceTables.entries()){
        const ts=table?.Thresholds;
        if(!Array.isArray(ts)||!ts.length||Object.keys(table).length!==1||
          !ts.every((n,i)=>id(n)&&n<2147483647&&(i===0||n>ts[i-1])))continue;
        // Native thresholds delimit [1,t0-1], [t0,t1-1], ..., [tn,INT_MAX].
        let bandIndex=ts.findIndex(n=>price.amount<n);
        if(bandIndex===-1)bandIndex=ts.length;
        const minimum=bandIndex===0?1:ts[bandIndex-1],maximum=bandIndex===ts.length?2147483647:ts[bandIndex]-1;
        if(price.amount<minimum||price.amount>maximum)continue;
        qualifying.push({kind:'ordinary_generated_clothing_shelf',sourceItemId:l.displayItemId,targetItemId:itemId,
          buildingItemId:building.itemId,upgradeLevel:l.upgradeLevel,configuredDisplayQuantity:l.configuredDisplayQuantity,
          sourcePath:l.buildingSourcePath,shelfSlotIndex:l.shelfSlotIndex,shelfSlotAmount:l.shelfSlotAmount,
          areaKey:l.areaKey,areaRecordIndex:l.areaRecordIndex,areaSourceRecordSha256:l.areaSourceRecordSha256,
          sourceProtoDbSha256:l.sourceProtoDbSha256,sourceGameVersion:source.target.gameVersion,
          sourceDisplaySha256:sha.Display,sourceBuildingSha256:sha.Building,sourceItemFileSha256:sha.Clothing,sourceSetSha256:sha.Set,
          nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
          purchaseCurrencyItemId:80000000,configuredPurchaseAmount:price.amount,priceSource:provider.providerKind,
          priceProviderRecordIndex:provider.sourceRecordIndex,tableIndex,bandIndex,minimum,maximum,
          setItemId:setId||null,itemCatalogGateEmpty:true,inheritedSetGateEmpty:true,
          itemTypeCode:row.itemType.code,itemSubtypeCode:row.itemType.subtypeCode,
          configuredPoolRouteVerified:true,runtimeStockVerified:false,storeMembershipVerified:false,
          currentAvailabilityVerified:false,guaranteedGrantVerified:false});
      }
    }
    if(qualifying.length){
      ordinary.set(itemId,qualifying);
      classificationCounts[row.nativeCategory]=(classificationCounts[row.nativeCategory]??0)+1;
    }else reject('no_verified_price_table_shelf');
  }
  console.log('DB01_INSTALLED_SHELF '+JSON.stringify({counts,items:out.size,occurrences:[...out.values()].flat().length,areas:[...slots.keys()],classificationCounts,classifiedItems:ordinary.size,classifiedOccurrences:[...ordinary.values()].flat().length,rejected}));
  return result;
}
