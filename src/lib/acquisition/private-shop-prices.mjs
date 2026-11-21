/**
 * Owner-private, exact-release static ProtoDB shops and item price definitions.
 * These are source-configured costs, NEVER live item offers, transaction prices,
 * stock, eligibility, ownership or account state.
 */
export const DB02_PRIVATE_SHOP_PRICES_CONTRACT='wand.db02.private-shop-prices@1';
export const DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256='641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975';
export const DB02_PRIVATE_SHOP_SOURCE_SHA256='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const SRC02_R5_MANIFEST='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const FILES=Object.freeze({
  'shop-definitions.jsonl':'1f192bff7db3536ea1a976783df0cd2f383ea59154e3f749815502ed8cb41629',
  'static-item-prices.jsonl':'ee876ef0dd721658f59e588b590cdd97d57081d735bf6893f85383587a8a18c2',
  'stall-shop-joins.jsonl':'7301b4fbf9f0e2151f6a70f51bbb1945720d59e98f9527e8c4ce052b84cdcda5',
  'dynamic-price-source.jsonl':'bb647f8c7b2049b8f1e386689d430065d950de9e4e288c096977e5f2c6d312af'
});
const decoder=new TextDecoder('utf-8',{fatal:true});
const fail=code=>{throw new TypeError('DB02_PRIVATE_SHOP_PRICES_'+code);};
const ok=(cond,code)=>{if(!cond)fail(code);};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bytes=(data,max)=>{
  const arr=data instanceof ArrayBuffer?new Uint8Array(data):data;
  ok(arr instanceof Uint8Array&&arr.length>0&&arr.length<=max,'INVALID_FILE_BYTES');
  return arr;
};
async function sha256(b){
  ok(!!globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',b))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
}
function parseJson(b){try{return JSON.parse(decoder.decode(b));}catch{fail('INVALID_JSON');}}
function jsonl(b){
  let str;try{str=decoder.decode(b);}catch{fail('INVALID_UTF8');}
  ok(str.endsWith('\n'),'JSONL_TERMINATION');
  try{return str.split('\n').filter(Boolean).map(x=>JSON.parse(x));}
  catch{fail('INVALID_JSONL');}
}
function freezeDeep(value){
  if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))freezeDeep(child);
  return Object.freeze(value);
}
const checkId=id=>{ok(positive(id),'INVALID_ITEM_ID');return id;};
const cost=(c)=>{
  ok(isObj(c)&&positive(c.currencyId)&&typeof c.amountFieldPresent==='boolean'&&
    (c.amountFieldPresent?nonnegative(c.amount):c.amount===null)&&hex(c.nativeWireSha256),
    'INVALID_CURRENCY_COST');
  return c;
};
/**
 * Supply private local release bytes by exact filename. Pins are independent
 * of the user-selected manifest, so a self-consistent forged ZIP is rejected.
 */
export async function loadPrivateShopPriceView(input){
  ok(isObj(input)&&isObj(input.files),'FILES_REQUIRED');
  const manifestBytes=bytes(input.manifestBytes,65536);
  ok(await sha256(manifestBytes)===DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256,
    'MANIFEST_SHA256_MISMATCH');
  const manifest=parseJson(manifestBytes);
  ok(isObj(manifest)&&manifest.schema==='wand.db02.protodb-shops@1' &&
    manifest.platform==='Steam'&&manifest.gameVersion==='1.26.2'&&
    manifest.privateOnly===true&&manifest.publicationAuthorized===false&&
    manifest.source?.sha256===DB02_PRIVATE_SHOP_SOURCE_SHA256&&
    manifest.src02R5ManifestSha256===SRC02_R5_MANIFEST &&
    isObj(manifest.counts)&&manifest.counts.verifiedCurrentShopOffers===0,
    'WRONG_RELEASE');
  const content={};
  for(const [name,digest] of Object.entries(FILES)){
    ok(manifest.files?.[name]===digest,'MANIFEST_FILE_LEDGER');
    const b=bytes(input.files[name],2*1024*1024);
    ok(await sha256(b)===digest,'FILE_SHA256_MISMATCH');
    content[name]=jsonl(b);
  }
  const shops=content['shop-definitions.jsonl'],prices=content['static-item-prices.jsonl'];
  const stalls=content['stall-shop-joins.jsonl'],dynamic=content['dynamic-price-source.jsonl'];
  ok(shops.length===44&&prices.length===988&&stalls.length===65&&dynamic.length===1,
    'RELEASE_CENSUS');
  const shopsByKey=new Map(),stallsById=new Map(),pricesByItem=new Map();
  let slots=0,buy=0,sell=0,missing=0;
  const distinctDb=new Set(),itemAndDb=new Set(),stalledShopKeys=new Set();
  for(const row of shops){
    ok(isObj(row)&&typeof row.shopKey==='string'&&row.shopKey.length>0&&
      !shopsByKey.has(row.shopKey)&&Array.isArray(row.slots)&&
      row.slots.length===row.slotCount&&hex(row.nativeWireSha256)&&
      row.currentOffersVerified===false&&row.stockVerified===false,'INVALID_SHOP');
    row.slots.forEach((slot,i)=>{
      ok(slot.index===i&&hex(slot.nativeWireSha256)&&
        (slot.currencyId===null||positive(slot.currencyId)),'INVALID_SHOP_SLOT');
    });
    if(row.refreshCost!==null)cost(row.refreshCost);
    slots+=row.slots.length;
    shopsByKey.set(row.shopKey,freezeDeep(row));
  }
  for(const row of prices){
    ok(isObj(row)&&typeof row.databaseKey==='string'&&row.databaseKey.length>0&&
      positive(row.itemId)&&hex(row.nativeWireSha256)&&
      row.currentShopPriceVerified===false&&
      row.currentPurchaseEligibilityVerified===false&&
      Array.isArray(row.purchaseCostDefinitions)&&Array.isArray(row.sellValueDefinitions),
      'INVALID_PRICE_ROW');
    const key=row.databaseKey+'#'+row.itemId;
    ok(!itemAndDb.has(key),'DUPLICATE_PRICE_ROW');itemAndDb.add(key);
    distinctDb.add(row.databaseKey);
    for(const [name,kind] of [['purchaseCostDefinitions','buy'],['sellValueDefinitions','sell']]){
      const currencies=new Set();
      for(const c of row[name]){
        cost(c);ok(!currencies.has(c.currencyId),'DUPLICATE_CURRENCY');
        currencies.add(c.currencyId);missing+=!c.amountFieldPresent;
        if(kind==='buy')buy++;else sell++;
      }
    }
    if(!pricesByItem.has(row.itemId))pricesByItem.set(row.itemId,[]);
    pricesByItem.get(row.itemId).push(freezeDeep(row));
  }
  for(const row of stalls){
    ok(isObj(row)&&positive(row.stallId)&&!stallsById.has(row.stallId)&&
      typeof row.shopKey==='string'&&shopsByKey.has(row.shopKey)&&
      row.offerItemMappingVerified===false&&row.nativeSlotCountMatchesStallLoot===true&&
      shopsByKey.get(row.shopKey).slotCount===row.nativeShopSlotCount,
      'STALL_SHOP_JOIN_INVALID');
    stallsById.set(row.stallId,freezeDeep(row));stalledShopKeys.add(row.shopKey);
  }
  ok(isObj(dynamic[0])&&dynamic[0].runtimeFormulaEvaluation==='not_evaluated'&&
    hex(dynamic[0].nativeWireSha256),'DYNAMIC_SOURCE_INVALID');
  const counts=manifest.counts;
  ok(slots===218&&buy===1348&&sell===711&&missing===3&&distinctDb.size===10&&
    stalledShopKeys.size===41&&counts.shopDefinitions===shops.length&&
    counts.staticPriceItemRows===prices.length&&counts.matchedStallReferences===stalls.length&&
    counts.purchaseCostDefinitions===buy&&counts.sellValueDefinitions===sell&&
    counts.absentSerializedAmounts===missing&&counts.shopSlots===slots,
    'RELEASE_COUNTS_MISMATCH');
  for(const [id,rows] of pricesByItem)
    pricesByItem.set(id,Object.freeze(rows.sort((a,b)=>a.databaseKey.localeCompare(b.databaseKey))));
  const sourceStallRelations=Object.freeze([...stallsById.values()]
    .sort((a,b)=>a.stallId-b.stallId));
  const queryId=value=>{checkId(value);return value;};
  const queryShop=key=>{ok(typeof key==='string'&&key.length>0&&key.length<=256,
    'INVALID_SHOP_KEY');return key;};
  return Object.freeze({
    contract:DB02_PRIVATE_SHOP_PRICES_CONTRACT,
    verified:true,privateSource:true,publishable:false,
    gameVersion:'1.26.2',platform:'Steam',
    sourceManifestSha256:DB02_PRIVATE_SHOP_PRICE_RELEASE_SHA256,
    src02R5ManifestSha256:SRC02_R5_MANIFEST,
    counts:freezeDeep({...counts}),
    offersVerified:false,stockVerified:false,effectivePriceVerified:false,
    dynamicPricesEvaluated:false,ownershipVerified:false,
    listSourceStallShopRelations:()=>sourceStallRelations,
    getSourceItemPriceDefinitions:itemId=>pricesByItem.get(queryId(itemId))??Object.freeze([]),
    getSourceShopConfiguration:key=>shopsByKey.get(queryShop(key))??null,
    getSourceStallShopConfiguration:stallId=>{
      const stall=stallsById.get(queryId(stallId));
      return stall?Object.freeze({stall,shop:shopsByKey.get(stall.shopKey)}):null;
    }
  });
}
