/** Original store upgrade display -> explicit item sequence -> price.
 * The configured route is affirmative static evidence, not live stock.
 * Generic layout matches alone never qualify.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
const props=r=>({...r?.nativeProperties,...r?.sourceAttributes});
export function buildStoreSequenceSources(rows,source,catalogFacts,layout,prices){
  const result=new Map(),sha=source.sourceFilesSha256;
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
    sha.Building!=='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0'||
    sha.Furniture!=='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'||
    sha.Clothing!=='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946')return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const building=known.get(20300028),b=props(building);
  if(building?.nativeCategory!=='Building'||b.DisplayName!=='Building.ScroogeStore_DisplayName'||
    b.DefaultGridLayoutPath!=='SceneLayouts/Rooms/ScroogeShop/ScroogeShop_DefaultLayout.json')return result;
  const slots=new Map();
  for(const [ui,u] of (b.UpgradeInfo??[]).entries()){
    if(!id(u.Level))continue;
    for(const [di,d] of (u.Store?.Displays??[]).entries()){
      if(!id(d.ItemID)||!id(d.Quantity)||!layout.displayDefinitions.has(d.ItemID))continue;
      const list=slots.get(d.ItemID)??[];
      list.push({upgradeLevel:u.Level,configuredDisplayQuantity:d.Quantity,
        sourcePath:'source.UpgradeInfo['+ui+'].Store.Displays['+di+'].ItemID'});
      slots.set(d.ItemID,list);
    }
  }
  const rejected={};
  const reject=k=>{rejected[k]=(rejected[k]??0)+1;};
  for(const [target,links] of layout.sequenceLinks){
    const row=known.get(target),f=catalogFacts.facts.get(target),screen=catalogFacts.storeScreens.get(target);
    if(!row||!['Furniture','Clothing'].includes(row.nativeCategory))continue;
    if(screen?.status!=='not_excluded_by_reviewed_gates'||!f?.flagsKnown||f.exclusionFlags.length||f.gateStatus!=='empty_source_gate'){reject('source_gate');continue;}
    const p=props(row),override=p.PriceOverride,price=override?.Price,provider=prices.items.get(target);
    if(override&&Object.keys(override).length&&price?.Id!==80000000){reject('currency_override');continue;}
    const cost=price?.Id===80000000&&Number.isSafeInteger(price.Amount)?
      {amount:price.Amount,source:'explicit_override'}:
      {amount:provider?.purchaseCosts.find(c=>c.currencyItemId===80000000&&c.amountFieldPresent)?.amount,source:provider?.providerKind};
    if(!id(cost.amount)||!['explicit_override','static','dynamic_cache'].includes(cost.source)){reject('price');continue;}
    for(const sequence of links){
      const def=layout.displayDefinitions.get(sequence.displayItemId);
      if(!def||def.sourceDisplaySha256!==sha.Display||!sequence.applyToBuildingIds.includes(building.itemId)||
        def.itemSequences[sequence.sequenceIndex]?.itemIds[sequence.position]!==target)continue;
      for(const slot of slots.get(sequence.displayItemId)??[]){
        const list=result.get(target)??[];
        list.push({kind:'ordinary_store_display_sequence',sourceItemId:sequence.displayItemId,targetItemId:target,
          buildingItemId:building.itemId,sequence,...slot,purchaseCurrencyItemId:80000000,
          configuredPurchaseAmount:cost.amount,priceSource:cost.source,sourceGameVersion:source.target.gameVersion,
          sourceDisplaySha256:sha.Display,sourceBuildingSha256:sha.Building,sourceItemFileSha256:sha[row.nativeCategory],
          guaranteedGrantVerified:false,storeMembershipVerified:false,liveTransactionVerified:false,currentAvailabilityVerified:false});
        result.set(target,list);
      }
    }
  }
  console.log('DB01_STORE_SEQUENCE '+JSON.stringify({candidates:layout.sequenceLinks.size,items:result.size,occurrences:[...result.values()].flat().length,rejected}));
  return result;
}
