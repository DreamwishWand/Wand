/**
 * DB-02 owner-private Steam v1.26.2 native DynamicItemPriceDatase cache.
 *
 * This is a *serialized cache snapshot*, NOT a live pricing formula or a
 * per-item sale price. Missing cache rows cannot prove missing runtime prices.
 * The exact original protoDb SHA, native dynamic envelope SHA and cache SHA
 * are independently pinned; original cached records never ship in the repo.
 */
export const DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT=
  'wand.db02.private-dynamic-price-cache@1';
export const DB02_DYNAMIC_PROTODB_SHA256=
  'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
export const DB02_DYNAMIC_SOURCE_BODY_SHA256=
  '2fb01bfd8bddb0efce6a58bcaba57338566bf63fdadaf52cda0989955af48858';
export const DB02_DYNAMIC_CACHE_BODY_SHA256=
  '6b97ccead7d8a134d7f2e0e58c82c47416126efa3fceefaefcec09d2fa15bd2e';
const fail=code=>{throw new TypeError('DB02_DYNAMIC_CACHE_'+code);};
const check=(yes,code)=>{if(!yes)fail(code);};
const freeze=Object.freeze;
const decoder=new TextDecoder('utf-8',{fatal:true});
const positiveId=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const MAX_PRICE_BYTES=240000;
function readVarint(bytes,start,end){
  let val=0n,at=start;
  for(let i=0;i<10&&at<end;i++){
    const b=bytes[at++];
    if(i===9&&b>1)fail('VARINT_OVERFLOW');
    val|=BigInt(b&127)<<BigInt(7*i);
    if(!(b&128)){
      if(i&&b===0)fail('NONCANONICAL_VARINT');
      return [val,at];
    }
  }
  fail('TRUNCATED_VARINT');
}
function scan(bytes,process){
  let at=0,count=0;
  while(at<bytes.length){
    check(++count<=100000,'TOO_MANY_FIELDS');
    const [tag,p]=readVarint(bytes,at,bytes.length);
    at=p;
    const num=Number(tag>>3n),kind=Number(tag&7n);
    check(num>=1&&num<=536870911&&[0,1,2,5].includes(kind),
      'INVALID_FIELD_TAG');
    let val;
    if(kind===0)[val,at]=readVarint(bytes,at,bytes.length);
    else if(kind===2){
      const [length,start]=readVarint(bytes,at,bytes.length);
      check(length<=BigInt(bytes.length-start),'TRUNCATED_MESSAGE');
      at=start+Number(length);
      val=bytes.subarray(start,at);
    }else{
      const length=kind===1?8:4;
      check(length<=bytes.length-at,'TRUNCATED_FIXED');
      val=bytes.subarray(at,at+length);at+=length;
    }
    process(num,kind,val);
  }
  check(at===bytes.length,'TRAILING_WIRE_BYTES');
}
function singleton(bytes,num,kind){
  let result=null;
  scan(bytes,(f,k,v)=>{
    if(f!==num)return;
    check(k===kind&&result===null,'DUPLICATE_OR_MISTYPED_FIELD');
    result=v;
  });
  return result;
}
function validScalar(v){
  check(v!==null&&v>0n&&v<=2147483647n,'INVALID_ITEM_ID');
  return Number(v);
}
function packedIds(bytes){
  const output=[];
  let at=0;
  while(at<bytes.length){
    const [v,p]=readVarint(bytes,at,bytes.length);
    output.push(validScalar(v));at=p;
    check(output.length<=32,'TOO_MANY_FORMULAS');
  }
  check(output.length>0&&new Set(output).size===output.length,
    'INVALID_FORMULA_REFERENCES');
  return output;
}
function cost(bytes){
  let currency=null,amount=null;
  scan(bytes,(f,k,v)=>{
    if(f===1){
      check(k===0&&currency===null,'INVALID_COST_CURRENCY');
      currency=validScalar(v);
    }else if(f===2){
      check(k===0&&amount===null&&v<=2147483647n,
        'INVALID_COST_AMOUNT');
      amount=Number(v);
    }
  });
  check(currency!==null,'MISSING_COST_CURRENCY');
  return {currency,amount,amountPresent:amount!==null};
}
function cacheRow(bytes){
  let itemId=null,purchase=0,sell=0,withSellAmount=0,withPurchaseAmount=0;
  const buyCurrencies=new Set(),sellCurrencies=new Set();
  scan(bytes,(f,k,v)=>{
    if(f===1){
      check(k===0&&itemId===null,'INVALID_CACHE_ITEM_ID');
      itemId=validScalar(v);
    }else if(f===2||f===3){
      check(k===2,'INVALID_CACHE_COST_WIRE');
      const entry=cost(v),seen=f===2?buyCurrencies:sellCurrencies;
      check(!seen.has(entry.currency),'DUPLICATE_CACHE_CURRENCY');
      seen.add(entry.currency);
      if(f===2){purchase++;if(entry.amountPresent)withPurchaseAmount++;}
      else{sell++;if(entry.amountPresent)withSellAmount++;}
    }
  });
  check(itemId!==null&&purchase+sell>0,'EMPTY_CACHE_ROW');
  return {itemId,purchase,sell,withPurchaseAmount,withSellAmount,
    allSellSoftCurrency:sellCurrencies.size===0||
      (sellCurrencies.size===1&&sellCurrencies.has(80000000))};
}
/**
 * Pure structural parser for synthetic test fixtures. Does not authenticate
 * the caller's input and does not return original source price amounts.
 */
export function parseDynamicPriceCacheStructure(cacheBytes){
  check(cacheBytes instanceof Uint8Array&&cacheBytes.length>0&&
    cacheBytes.length<=MAX_PRICE_BYTES,'INVALID_CACHE_BYTES');
  const seen=new Set(),sellIds=new Set(),buyIds=new Set();
  let rows=0,buyOnly=0,sellOnly=0,both=0,withSellAmount=0,withoutSellAmount=0;
  scan(cacheBytes,(f,k,v)=>{
    check(f===1&&k===2&&++rows<=10000,'INVALID_CACHE_ROW_FIELD');
    const r=cacheRow(v);
    check(!seen.has(r.itemId),'DUPLICATE_CACHE_ITEM');
    seen.add(r.itemId);
    if(r.purchase)buyIds.add(r.itemId);
    if(r.sell){
      sellIds.add(r.itemId);
      check(r.allSellSoftCurrency,'NON_SOFT_SELL_CURRENCY');
      withSellAmount+=r.withSellAmount;
      withoutSellAmount+=r.sell-r.withSellAmount;
    }
    if(r.purchase&&r.sell)both++;
    else if(r.purchase)buyOnly++;
    else sellOnly++;
  });
  check(rows>0&&buyOnly+sellOnly+both===rows,
    'INCOMPLETE_CACHE_CENSUS');
  const lookup=id=>{
    check(positiveId(id),'INVALID_LOOKUP_ID');
    return freeze({
      itemId:id,
      cachedPurchaseRowPresent:buyIds.has(id),
      cachedSellRowPresent:sellIds.has(id),
      originalSourceAuthenticated:false,
      serializedCacheOnly:true,
      runtimeFormulaEvaluated:false,
      effectiveSellPriceVerified:false,
      sellPrice:null
    });
  };
  return freeze({
    cacheRowCount:rows,
    purchaseOnlyRowCount:buyOnly,
    sellOnlyRowCount:sellOnly,
    bothPurchaseAndSellRowCount:both,
    sellCurrencyAmountFieldsPresent:withSellAmount,
    sellCurrencyAmountFieldsAbsent:withoutSellAmount,
    sourceAuthenticated:false,
    runtimeFormulaEvaluated:false,
    effectiveSellPricesVerified:false,
    lookup
  });
}
function nativeDynamicBody(protodb){
  let index=0,dynamic=null;
  scan(protodb,(field,kind,entry)=>{
    check(field===1&&kind===2,'INVALID_CONTAINER_WIRE');
    if(index++!==274)return;
    const key=singleton(entry,1,2);
    check(key&&decoder.decode(key)==='FormulaDynamicPriceDatabase',
      'DYNAMIC_ENTRY_KEY');
    const envelope=singleton(entry,2,2);
    check(envelope,'DYNAMIC_ENVELOPE_MISSING');
    const name=singleton(envelope,5,2);
    check(name&&decoder.decode(name)==='Definitions.Shops.DynamicItemPriceDatase',
      'DYNAMIC_NATIVE_CLASS');
    dynamic=singleton(envelope,6,2);
  });
  check(index===2246&&dynamic instanceof Uint8Array&&dynamic.length>0,
    'ORIGINAL_CONTAINER_CENSUS');
  return dynamic;
}
async function digest(bytes){
  check(!!globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  const hash=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/**
 * Verify the original v1.26.2 Steam protoDb.bin in full; do not trust a
 * caller-supplied "verified" flag, pre-parsed catalog or forged partial bytes.
 */
export async function loadPrivateDynamicPriceCache(protoDbBytes){
  check(protoDbBytes instanceof Uint8Array&&protoDbBytes.length===1335720,
    'ORIGINAL_BYTES_REQUIRED');
  check(await digest(protoDbBytes)===DB02_DYNAMIC_PROTODB_SHA256,
    'ORIGINAL_PROTO_SHA');
  const source=nativeDynamicBody(protoDbBytes);
  check(await digest(source)===DB02_DYNAMIC_SOURCE_BODY_SHA256,
    'DYNAMIC_BODY_SHA');
  const purchaseFormula=singleton(source,1,2);
  const sellFormula=singleton(source,2,2);
  const raw=singleton(source,3,2);
  check(purchaseFormula&&sellFormula&&raw,'SOURCE_FIELDS_MISSING');
  const p=packedIds(purchaseFormula),s=packedIds(sellFormula);
  check(p.length===4&&s.length===1,'FORMULA_SOURCE_CENSUS');
  check(await digest(raw)===DB02_DYNAMIC_CACHE_BODY_SHA256,
    'DYNAMIC_CACHE_SHA');
  const parsed=parseDynamicPriceCacheStructure(raw);
  check(parsed.cacheRowCount===8549&&
    parsed.purchaseOnlyRowCount===8068&&
    parsed.sellOnlyRowCount===481&&
    parsed.bothPurchaseAndSellRowCount===0&&
    parsed.sellCurrencyAmountFieldsPresent===7&&
    parsed.sellCurrencyAmountFieldsAbsent===474,
    'ORIGINAL_DYNAMIC_CACHE_CENSUS');
  return freeze({
    contract:DB02_PRIVATE_DYNAMIC_PRICE_CACHE_CONTRACT,
    platform:'Steam',gameVersion:'1.26.2',
    sourceKey:'FormulaDynamicPriceDatabase',
    sourceNativeClass:'Definitions.Shops.DynamicItemPriceDatase',
    originalProtoSha256:DB02_DYNAMIC_PROTODB_SHA256,
    sourceBodySha256:DB02_DYNAMIC_SOURCE_BODY_SHA256,
    cachedPriceDataSha256:DB02_DYNAMIC_CACHE_BODY_SHA256,
    originalSourceVerified:true,
    sourcePurchaseFormulaReferenceCount:p.length,
    sourceSellFormulaReferenceCount:s.length,
    cacheRowCount:parsed.cacheRowCount,
    purchaseOnlyRowCount:parsed.purchaseOnlyRowCount,
    sellOnlyRowCount:parsed.sellOnlyRowCount,
    bothPurchaseAndSellRowCount:parsed.bothPurchaseAndSellRowCount,
    sellCurrencyAmountFieldsPresent:parsed.sellCurrencyAmountFieldsPresent,
    sellCurrencyAmountFieldsAbsent:parsed.sellCurrencyAmountFieldsAbsent,
    lookup:itemId=>{
      const row=parsed.lookup(itemId);
      return freeze({
        itemId,
        cachedPurchaseRowPresent:row.cachedPurchaseRowPresent,
        cachedSellRowPresent:row.cachedSellRowPresent,
        originalSourceAuthenticated:true,
        serializedCacheOnly:true,
        runtimeFormulaEvaluated:false,
        effectiveSellPriceVerified:false,
        sellPrice:null
      });
    },
    runtimeFormulaEvaluated:false,
    actualSellPricesVerified:false,
    saveWriterAuthorized:false,
    publishable:false
  });
}
