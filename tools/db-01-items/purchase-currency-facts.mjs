/** Build-only exact default purchase currency facts. The absence of a
 * serialized field is not a configured soft currency or a price of zero.
 */
import {readFileSync,existsSync} from 'node:fs';
const classes={FurnitureItemData:['Furniture',18],LandscapingItemData:['Furniture',10],
  FenceAndRoadItemData:['Furniture',11],ClothingItemData:['Clothing',20]};
const check=(ok,reason)=>{if(!ok)throw Error('DB01_PURCHASE_CURRENCY_'+reason)};
export function buildPurchaseCurrencyFacts(source,rows){
  const version=source.target.gameVersion;
  check(/^\d+\.\d+\.\d+$/.test(version),'VERSION');
  const path=new URL('../../data/ddv/item-master/default-purchase-currency-steam-'+version+'.json',import.meta.url);
  const result=new Map();
  if(!existsSync(path))return result;
  const d=JSON.parse(readFileSync(path,'utf8'));
  check(d.schema==='wand.db01.default-purchase-currency@1'&&d.target.platform==='Steam'&&
    d.target.gameVersion===version&&d.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    ['Furniture','Clothing'].every(k=>d.sourceFiles[k]===source.sourceFilesSha256[k]),'SOURCE');
  const byId=new Map(rows.map(r=>[r.itemId,r])),explicit=new Map();
  let previous=0;
  for(const [id,currency] of d.rows){
    check(Number.isSafeInteger(id)&&id>previous&&Object.hasOwn(classes,byId.get(id)?.sourceClass)&&
      byId.get(currency)?.nativeCategory==='Currency','EXPLICIT');
    explicit.set(id,currency);previous=id;
  }
  const counts={};
  for(const row of rows){
    if(!Object.hasOwn(classes,row.sourceClass))continue;
    const [category,field]=classes[row.sourceClass];
    check(row.nativeCategory===category&&source.sourceFieldDeclarations[row.sourceClass]?.DefaultCurrencyItemID===field,'FIELD');
    const observed=row.observedFields.filter(([n])=>n===field);
    const currency=explicit.get(row.itemId);
    check(currency===undefined?observed.length===0:
      observed.length===1&&observed[0][1]===0&&observed[0][2]===1,'WIRE_'+row.itemId);
    const existing=row.nativeProperties?.DefaultCurrencyItemID??row.sourceAttributes?.DefaultCurrencyItemID;
    check(existing===undefined||existing===currency,'DECODED_CONFLICT');
    const price=row.sourceAttributes?.PriceOverride??row.nativeProperties?.PriceOverride;
    const matching=currency!==undefined&&price?.Price?.Id===currency&&
      Number.isSafeInteger(price.Price.Amount)&&price.Price.Amount>=0;
    counts[row.sourceClass]=(counts[row.sourceClass]??0)+1;
    result.set(row.itemId,{defaultCurrencyItemId:currency??null,
      serializedFieldPresent:currency!==undefined,
      sourceField:'DefaultCurrencyItemID',sourceFieldNumber:field,
      // Verified native rule: a valid explicit default goes through
      // TryGetPrice; if the actual native default is Invalid (0), use
      // TryGetPrices and its first returned row. No live quote is inferred.
      explicitDefaultLookup:'requested_currency',
      invalidNativeDefaultLookup:'first_returned_price',
      explicitDefaultMatchesPriceOverride:matching,
      currentAvailabilityVerified:false,currentPriceVerified:false});
  }
  check(Object.keys(counts).length===Object.keys(d.coverage).length&&
    Object.entries(counts).every(([k,v])=>d.coverage[k]===v),'CLASS_CENSUS');
  check(result.size===8229&&explicit.size===48&&[...explicit.values()].filter(v=>v===80000000).length===41&&
    [...explicit.values()].filter(v=>v===80100000).length===7&&
    [...result.values()].filter(v=>v.explicitDefaultMatchesPriceOverride).length===10,'CENSUS');
  return result;
}
