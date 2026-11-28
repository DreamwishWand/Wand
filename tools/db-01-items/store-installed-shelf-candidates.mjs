/** Join actual positive store upgrade shelf slots, not every generic layout.
 * Native 1.26.2 StoreUtil.GetScroogeStoreItemList -> AddItemsToResult -> 
 * ItemGenerator.GetFilteredItemList enumerates candidates, with price table
 * partitions. Runtime ownership, expansion, price and uniqueness gates
 * remain separate. Only fully evaluated original shelf routes add a category.
 */
import {stageAreaSlots} from './store-native-stage-layout.mjs';
import {resolveStoreCatalogGate} from './store-catalog-gate.mjs';
const id=n=>Number.isSafeInteger(n)&&n>0;
// Five exact original Display records have no field 10 (PricesTables).
// StoreInfo refresh bypasses missing table setters, clamps min to 1 in
// UpdateSlot; PriceMatches treats MaxAmount <= 0 as unbounded.
// Diagnostic StoreUtil enumeration skips these, unlike actual generation.
const NO_PRICE_TABLE=new Set([2140000002,2140000003,2140000006,2140000015,2140000016]);
function priceBands(link,amount){
  const tables=link.priceTables;
  if(NO_PRICE_TABLE.has(link.displayItemId)&&(tables===null||Array.isArray(tables)&&tables.length===0))
    return [{tableIndex:null,bandIndex:null,minimum:1,maximum:2147483647,priceBandKind:'native_unbounded_positive',catalogueEnumerationVerified:false}];
  if(!Array.isArray(tables))return [];
  const bands=[];
  for(const [tableIndex,table] of tables.entries()){
    const ts=table?.Thresholds;
    if(!Array.isArray(ts)||!ts.length||Object.keys(table).length!==1||
      !ts.every((n,i)=>id(n)&&n<2147483647&&(i===0||n>ts[i-1])))continue;
    let bandIndex=ts.findIndex(n=>amount<n);
    if(bandIndex===-1)bandIndex=ts.length;
    const minimum=bandIndex===0?1:ts[bandIndex-1],maximum=bandIndex===ts.length?2147483647:ts[bandIndex]-1;
    if(amount>=minimum&&amount<=maximum)bands.push({tableIndex,bandIndex,minimum,maximum,priceBandKind:'configured_thresholds',catalogueEnumerationVerified:true});
  }
  return bands;
}
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
export function buildInstalledShelfCandidates(rows,source,layout,catalog,prices,questKinds=new Map()){
  const out=new Map(),ordinary=new Map(),sha=source.sourceFilesSha256;
  const stageCandidates=new Map(),stageOrdinary=new Map();
  const result={candidates:out,ordinary,stageCandidates,stageOrdinary};
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
  const byArea=new Map(layout.areas.map(a=>[a.key,a])),slots=new Map(),stageSlots=new Map();
  for(const [ui,u] of (b.UpgradeInfo??[]).entries()){
    if(!id(u.Level))continue;
    for(const [di,d] of (u.Store?.Displays??[]).entries()){
      const def=layout.displayDefinitions.get(d.ItemID);
      if(!id(d.Quantity)||!def)continue;
      const p=props(known.get(d.ItemID));
      if(def.kind==='stage'){
        for(const stage of stageAreaSlots(d.ItemID,def.stageLayouts,p)){
          const area=byArea.get(stage.areaKey);if(!area)continue;
          const a=stageSlots.get(stage.areaKey)??[];
          a.push({...stage,displayItemId:d.ItemID,upgradeLevel:u.Level,configuredDisplayQuantity:d.Quantity,
            buildingSourcePath:'source.UpgradeInfo['+ui+'].Store.Displays['+di+'].ItemID',
            areaRecordIndex:area.recordIndex,areaSourceRecordSha256:area.sourceRecordSha256,
            priceTables:p.PricesTables??null,uniqueTagsFilters:p.UniqueTagsFilters??null,
            gridReviewRequired:!!area.filter.grid,directTagReviewRequired:!!(area.filter.allTags||area.filter.anyTags),
            sourceProtoDbSha256:area.sourceProtoDbSha256});
          stageSlots.set(stage.areaKey,a);
        }
        continue;
      }
      if(def.kind!=='shelf')continue;
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
    const shelfLinks=candidate.matchingAreaKeys.flatMap(k=>slots.get(k)??[]);
    const stageLinks=row.nativeCategory==='Furniture'?candidate.matchingAreaKeys.flatMap(k=>stageSlots.get(k)??[]):[];
    const links=[...shelfLinks,...stageLinks];
    if(!links.length)continue;
    const enrich=l=>({...l,buildingItemId:building.itemId,
      targetItemId:itemId,sourceGameVersion:source.target.gameVersion,
      sourceDisplaySha256:sha.Display,sourceBuildingSha256:sha.Building,
      sourceItemFileSha256:sha[row.nativeCategory],
      catalogGateStatus:f?.gateStatus??null,catalogFlagsKnown:f?.flagsKnown??false,
      catalogExclusionFlags:f?.exclusionFlags??null,
      sourceTagIds:row.tags.filter(t=>t.sourceField===9).map(t=>t.id),
      directLayoutMatch:true,sourceDirectTagPredicateVerified:candidate.sourceDirectTagPredicateVerified===true,nativeOwnershipCheckRequired:row.nativeCategory==='Clothing',
      nativeGrid:layout.dimensionComparisons.get(itemId)?.find(g=>g.areaKey===l.areaKey)?.nativeGrid??null,
      gridPredicateEvaluated:false,runtimeStorePoolVerified:false,
      storeMembershipVerified:false,currentAvailabilityVerified:false});
    if(shelfLinks.length){
      out.set(itemId,shelfLinks.map(enrich));
      counts[row.nativeCategory]=(counts[row.nativeCategory]??0)+1;
    }
    if(stageLinks.length)stageCandidates.set(itemId,stageLinks.map(enrich));
    // The native catalogue enumeration calls ItemGenerator.GetFilteredItemList,
    // then repeats with each positive inclusive price interval. Both furniture
    // and clothing use the same price and inherited unlock checks.
    if(!['Clothing','Furniture'].includes(row.nativeCategory))continue;
    if(!f?.flagsKnown||f.exclusionFlags.length){reject('item_flags');continue;}
    const catalogGate=resolveStoreCatalogGate(f.catalogVisibilityConditions,known,questKinds,sha);
    if(!catalogGate){reject('item_gate');continue;}
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
    // The independently audited native matching-currency explicit override
    // precedes provider lookup. A different-currency, currency-only or
    // ambiguous override is not evidence of a positive coin price.
    const explicit=override.Price;
    let price,priceSource,priceProviderRecordIndex;
    if(Object.keys(override).length){
      if(Object.keys(override).length!==1||!explicit||typeof explicit!=='object'||Array.isArray(explicit)||
        Object.keys(explicit).length!==2||explicit.Id!==80000000||!id(explicit.Amount)||
        explicit.Amount>2147483647||!['FurnitureItemData','ClothingItemData'].includes(row.sourceClass)){
        reject('price_override_unresolved');continue;
      }
      price={currencyItemId:explicit.Id,amount:explicit.Amount,amountFieldPresent:true};
      priceSource='explicit_override';priceProviderRecordIndex=null;
    }else{
      if(!provider||provider.purchaseCosts.length!==1){reject('price_provider_unresolved');continue;}
      price=provider.purchaseCosts[0];priceSource=provider.providerKind;priceProviderRecordIndex=provider.sourceRecordIndex;
    }
    if(price.currencyItemId!==80000000||!price.amountFieldPresent||!id(price.amount)||price.amount>2147483647){reject('coin_price');continue;}
    const qualifying=[];
    for(const l of links){
      const area=byArea.get(l.areaKey),filter=area?.filter;
      const furniture=row.nativeCategory==='Furniture';
      const nativeGrid=layout.dimensionComparisons.get(itemId)?.find(g=>g.areaKey===l.areaKey)?.nativeGrid??null;
      if(!filter||candidate.sourceDirectTagPredicateVerified!==true)continue;
      if(furniture){
        // These matches were selected by the exact direct type/subtype/tag
        // predicates. Require a fully resolved grid match, never just bounds.
        if(!filter.grid||nativeGrid?.status!=='passed'||nativeGrid.directTagPredicateVerified!==true)continue;
      }else if(filter.grid||filter.allTags||filter.anyTags||filter.typeCodes?.length!==1||
        filter.typeCodes[0]!==5||filter.subtypes?.length!==1||filter.subtypes[0][0]!==6||
        !filter.subtypes[0][1].includes(row.itemType.subtypeCode))continue;
      for(const band of priceBands(l,price.amount)){
        const stage=l.stageLayoutType!==undefined;
        qualifying.push({kind:stage?'ordinary_generated_store_stage':'ordinary_generated_store_shelf',itemNativeCategory:row.nativeCategory,sourceDirectTagPredicateVerified:true,nativeGrid,sourceItemId:l.displayItemId,targetItemId:itemId,
          buildingItemId:building.itemId,upgradeLevel:l.upgradeLevel,configuredDisplayQuantity:l.configuredDisplayQuantity,
          sourcePath:l.buildingSourcePath,...(stage?{stageLayoutType:l.stageLayoutType,stageLayoutIndex:l.stageLayoutIndex,
            stageLayoutWeight:l.stageLayoutWeight,stageSourceSize:l.stageSourceSize,stageAreaSize:l.stageAreaSize,stageSlotIndices:l.stageSlotIndices}:
            {shelfSlotIndex:l.shelfSlotIndex,shelfSlotAmount:l.shelfSlotAmount}),
          areaKey:l.areaKey,areaRecordIndex:l.areaRecordIndex,areaSourceRecordSha256:l.areaSourceRecordSha256,
          sourceProtoDbSha256:l.sourceProtoDbSha256,sourceGameVersion:source.target.gameVersion,
          sourceDisplaySha256:sha.Display,sourceBuildingSha256:sha.Building,sourceItemFileSha256:sha[row.nativeCategory],sourceSetSha256:sha.Set,
          nativeAssemblySha256:'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
          purchaseCurrencyItemId:80000000,configuredPurchaseAmount:price.amount,priceSource,
          priceProviderRecordIndex,...band,
          setItemId:setId||null,itemCatalogGateEmpty:catalogGate.kind==='empty',catalogGate,inheritedSetGateEmpty:true,
          itemTypeCode:row.itemType.code,itemSubtypeCode:row.itemType.subtypeCode,
          configuredPoolRouteVerified:true,runtimeStockVerified:false,storeMembershipVerified:false,
          currentAvailabilityVerified:false,guaranteedGrantVerified:false});
      }
    }
    const shelves=qualifying.filter(l=>l.kind==='ordinary_generated_store_shelf');
    const stages=qualifying.filter(l=>l.kind==='ordinary_generated_store_stage');
    if(shelves.length){
      ordinary.set(itemId,shelves);
      classificationCounts[row.nativeCategory]=(classificationCounts[row.nativeCategory]??0)+1;
    }else if(shelfLinks.length)reject('no_verified_price_table_shelf');
    if(stages.length)stageOrdinary.set(itemId,stages);
  }
  console.log('DB01_INSTALLED_SHELF '+JSON.stringify({counts,items:out.size,occurrences:[...out.values()].flat().length,areas:[...slots.keys()],classificationCounts,classifiedItems:ordinary.size,classifiedOccurrences:[...ordinary.values()].flat().length,rejected}));
  console.log('DB01_INSTALLED_STAGE '+JSON.stringify({areas:[...stageSlots.keys()],items:stageCandidates.size,occurrences:[...stageCandidates.values()].flat().length,classifiedItems:stageOrdinary.size,classifiedOccurrences:[...stageOrdinary.values()].flat().length}));
  const gated=new Map();
  for(const [itemId,links] of [...ordinary,...stageOrdinary])if(links[0]?.catalogGate.kind!=='empty')gated.set(itemId,links[0].catalogGate.kind);
  console.log('DB01_STORE_PROGRESSION_GATE '+JSON.stringify({items:gated.size,byKind:Object.fromEntries([...new Set(gated.values())].map(k=>[k,[...gated.values()].filter(v=>v===k).length]))}));
  const unbounded=[...ordinary,...stageOrdinary].flatMap(([itemId,ls])=>ls.filter(l=>l.priceBandKind==='native_unbounded_positive').map(l=>({itemId,displayItemId:l.sourceItemId})));
  console.log('DB01_NATIVE_UNBOUNDED_STORE_PRICE '+JSON.stringify({items:new Set(unbounded.map(l=>l.itemId)).size,occurrences:unbounded.length,byDisplay:Object.fromEntries([...new Set(unbounded.map(l=>l.displayItemId))].map(d=>[d,new Set(unbounded.filter(l=>l.displayItemId===d).map(l=>l.itemId)).size]))}));
  return result;
}
