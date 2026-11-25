/** Build-only original price projection, authorized by Owner on 2026-11-25.
 * The source is the sanitized Item ID/currency/amount projection, not a live
 * shop quote. No original binary, private ZIP or save enters public assets.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const pins={'1.26.2':{
  sourceItemsSha256:'de579d94fa10258249c9c477075110d0bcf001a0d865a15ded039efb3616c8f0',
  sourceProtoDbSha256:'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
  sha256:'84a6befdb0727c8f683c15dc1220567df2fc2fe0fbd0d9439cbcc83257176055',
  providerCounts:{274:8549,1966:52,1967:312,1968:185,1969:14,1971:53,1972:107,1973:108,1974:90,1975:8,1976:59}
}};
const check=(ok,reason)=>{if(!ok)throw Error('DB01_ORIGINAL_PRICE_'+reason)};
export function loadOriginalPriceFacts(project,source,byId){
  const version=source.target.gameVersion,pin=pins[version],items=new Map();
  const saleFlags=new Map();
  if(!pin||source.target.platform!=='Steam')return {items,saleFlags,metadata:null};
  check(source.sourceItemsSha256===pin.sourceItemsSha256,'SOURCE_ITEMS');
  const raw=readFileSync(join(project,'data/ddv/item-master/original-price-amounts-steam-'+version+'.json'));
  check(createHash('sha256').update(raw).digest('hex')===pin.sha256,'SHA');
  const rows=JSON.parse(raw),counts={},coverage={itemCount:0,purchaseEntries:0,sellEntries:0,
    purchaseExplicitAmounts:0,sellExplicitAmounts:0,staticItems:0,dynamicCacheItems:0};
  const currencies=new Set();
  let last=0;
  check(Array.isArray(rows),'ROWS');
  for(const row of rows){
    check(Array.isArray(row)&&row.length===4,'ROW');
    const [id,provider,buy,sell]=row;
    check(Number.isSafeInteger(id)&&id>last&&byId.has(id),'ITEM_ID');last=id;
    check(Object.hasOwn(pin.providerCounts,provider)&&Number.isInteger(provider),'PROVIDER');
    counts[provider]=(counts[provider]??0)+1;
    const read=(list,direction)=>{
      check(Array.isArray(list)&&list.length<=64,'COST_LIST');
      const seen=new Set();
      return list.map(cost=>{
        check(Array.isArray(cost)&&cost.length===2,'COST');
        const [currencyItemId,amount]=cost;
        check(byId.get(currencyItemId)?.nativeCategory==='Currency'&&!seen.has(currencyItemId),'CURRENCY');
        check(amount===null||Number.isInteger(amount)&&amount>=0&&amount<=2147483647,'AMOUNT');
        seen.add(currencyItemId);currencies.add(currencyItemId);
        coverage[direction+'Entries']++;
        if(amount!==null)coverage[direction+'ExplicitAmounts']++;
        return {currencyItemId,amount,amountFieldPresent:amount!==null};
      });
    };
    const purchaseCosts=read(buy,'purchase'),sellCosts=read(sell,'sell');
    check(purchaseCosts.length+sellCosts.length>0,'EMPTY');
    const providerKind=provider===274?'dynamic_cache':'static';
    coverage[provider===274?'dynamicCacheItems':'staticItems']++;coverage.itemCount++;
    items.set(id,{providerKind,sourceRecordIndex:provider,purchaseCosts,sellCosts,runtimePriceVerified:false});
  }
  check(Object.entries(pin.providerCounts).every(([k,v])=>counts[k]===v)&&
    Object.keys(counts).length===Object.keys(pin.providerCounts).length,'PROVIDER_CENSUS');
  check(coverage.itemCount===9537&&coverage.purchaseEntries===9416&&coverage.sellEntries===1192&&
    coverage.purchaseExplicitAmounts===9036&&coverage.sellExplicitAmounts===718&&currencies.size===8,'COST_CENSUS');
  // Independent original ActivityItem projection. Omitted protobuf bools
  // default to false; neither flag proves an available sale transaction.
  const saleSha='c4b353fceed467bd74a92578aa364c67ec3087f0e37d506a832c3333bc1d0db0';
  const activitySha='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
  check(source.sourceFilesSha256.ActivityItem===activitySha,'SALE_ACTIVITY_SOURCE');
  const flagRaw=readFileSync(join(project,'data/ddv/item-master/original-sale-flags-steam-'+version+'.json'));
  check(createHash('sha256').update(flagRaw).digest('hex')===saleSha,'SALE_SHA');
  const flagRows=JSON.parse(flagRaw),classes={CropItemData:165,FishItemData:103,IngredientItemData:201,MealItemData:618};
  const classCounts={},flagCounts={mission:0,unsellable:0};
  let prior=0;
  for(const tuple of flagRows){
    check(Array.isArray(tuple)&&tuple.length===3,'SALE_ROW');
    const [id,mission,unsellable]=tuple,definition=byId.get(id);
    check(Number.isSafeInteger(id)&&id>prior&&definition&&Object.hasOwn(classes,definition.sourceClass),'SALE_ID');
    prior=id;
    check([mission,unsellable].every(v=>v===null||v===0||v===1),'SALE_BOOL');
    const sourceMission=definition.sourceAttributes?.IsMissionItem??definition.nativeProperties?.IsMissionItem??false;
    check(sourceMission===(mission===1),'SALE_MISSION_JOIN');
    classCounts[definition.sourceClass]=(classCounts[definition.sourceClass]??0)+1;
    flagCounts.mission+=Number(mission===1);flagCounts.unsellable+=Number(unsellable===1);
    saleFlags.set(id,{isMissionItem:mission===1,missionFieldPresent:mission!==null,
      unsellable:unsellable===1,unsellableFieldPresent:unsellable!==null,
      runtimeSaleEligibilityVerified:false});
  }
  check(flagRows.length===1087&&Object.entries(classes).every(([k,v])=>classCounts[k]===v)&&
    flagCounts.mission===343&&flagCounts.unsellable===236,'SALE_CENSUS');
  return {items,saleFlags,metadata:{sourceGameVersion:version,sourceProtoDbSha256:pin.sourceProtoDbSha256,
    projectionSha256:pin.sha256,publicationAuthorized:true,runtimePriceVerified:false,
    ...coverage,currencyCount:currencies.size,sourceSaleFlags:{activityItemSha256:activitySha,
      projectionSha256:saleSha,itemCount:saleFlags.size,missionItemCount:flagCounts.mission,
      unsellableCount:flagCounts.unsellable,runtimeSaleEligibilityVerified:false}}};
}
