/**
 * DB-02 owner-private Steam v1.26.2 native CookingData source evidence.
 * NEVER a per-meal final sell-price calculator: the executable method
 * Partial native accumulator math/rounding was independently verified
 * by the cross-platform auditor, but the full input-value and eligibility
 * resolution remains unverified by this source-settings parser.
 *
 * No game source bytes or config rows are bundled with public source.
 */
export const DB02_PRIVATE_COOKING_STAR_CONTRACT='wand.db02.private-cooking-star-settings@1';
export const DB02_ORIGINAL_COOKING_PROTO_SHA256='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
export const DB02_ORIGINAL_COOKING_WIRE_SHA256='c7f88137699c319dbdcbf3d8a006b0db50399d48683143b5e75ac908365bc1c2';
const MAX_PROTO=2*1024*1024;
const fail=code=>{throw new TypeError('DB02_COOKING_STAR_'+code);};
const must=(cond,code)=>{if(!cond)fail(code);};
const freeze=Object.freeze;
const utf8=new TextDecoder('utf-8',{fatal:true});
const id=n=>Number.isSafeInteger(n)&&n>=1&&n<=2147483647;
function varint(bytes,offset,end){
  let v=0n;
  for(let i=0;i<10&&offset<end;i++){
    const b=bytes[offset++];
    if(i===9&&b>1)fail('VARINT_OVERFLOW');
    v|=BigInt(b&127)<<BigInt(7*i);
    if(!(b&128)){
      if(i&&b===0)fail('NONCANONICAL_VARINT');
      return [v,offset];
    }
  }
  fail('TRUNCATED_VARINT');
}
function scan(bytes,fn){
  let pos=0,count=0;
  while(pos<bytes.length){
    must(++count<=100000,'TOO_MANY_FIELDS');
    const [tag,at]=varint(bytes,pos,bytes.length);
    pos=at;
    const field=Number(tag>>3n),kind=Number(tag&7n);
    must(field>=1&&field<=536870911&&[0,1,2,5].includes(kind),
      'BAD_WIRE_TAG');
    let v;
    if(kind===0)[v,pos]=varint(bytes,pos,bytes.length);
    else if(kind===2){
      const [length,start]=varint(bytes,pos,bytes.length);
      must(length<=BigInt(bytes.length-start),'TRUNCATED_LENGTH');
      pos=start+Number(length);
      v=bytes.subarray(start,pos);
    }else{
      const n=kind===1?8:4;
      must(pos+n<=bytes.length,'TRUNCATED_FIXED');
      v=bytes.subarray(pos,pos+n);pos+=n;
    }
    fn(field,kind,v);
  }
}
function number(raw,field){
  must(raw<=2147483647n,'VALUE_OVERFLOW_'+field);
  return Number(raw);
}
function singleton(bytes,requested,kind){
  let value=null;
  scan(bytes,(f,k,v)=>{
    if(f!==requested)return;
    must(k===kind&&value===null,'WRONG_FIELD_'+requested);
    value=v;
  });
  return value;
}
function parseStar(raw){
  let star=null,min=null,max=null,sell=null,mana=null;
  const seen=new Set();
  scan(raw,(f,k,v)=>{
    if(f>5)return; // Forward-compatible unknown fields remain untrusted.
    must(!seen.has(f)&&k===0,'STAR_FIELD_TYPE_OR_DUPLICATE');
    seen.add(f);
    const x=number(v,'STAR');
    if(f===1)star=x;
    else if(f===2)min=x;
    else if(f===3)max=x;
    else if(f===4)sell=x;
    else mana=x;
  });
  must(star!==null&&star>=1&&star<=5&&
    sell!==null&&sell>0&&sell<=1000&&
    mana!==null&&mana>0&&mana<=1000&&
    (min===null||min<=100)&&
    (max===null||max<=100)&&
    (min===null||max===null||min<=max),
    'STAR_VALUE_RANGE');
  return freeze({starRating:star,
    minDiscoveredInfoPercentage:min,
    minDiscoveredInfoFieldPresent:min!==null,
    maxDiscoveredInfoPercentage:max,
    maxDiscoveredInfoFieldPresent:max!==null,
    sellPriceIngredientPercentage:sell,
    manaRecoveredIngredientPercentage:mana,
    sourceSerializedSettingsOnly:true,
    actualSellPriceFormulaVerified:false,
    roundingRuleVerified:false});
}
/**
 * Structurally decode an untrusted native CookingData submessage. This pure
 * helper does NOT authenticate the data as original game content.
 */
export function parseCookingDataStarSettings(body){
  must(body instanceof Uint8Array&&body.length>0&&body.length<=4096,
    'INVALID_COOKING_BYTES');
  const rows=[];
  scan(body,(f,k,v)=>{
    if(f===5){
      must(k===2&&rows.length<5,'STAR_RESULT_FIELD_TYPE');
      rows.push(parseStar(v));
    }
  });
  rows.sort((a,b)=>a.starRating-b.starRating);
  must(rows.length===5&&rows.every((r,i)=>r.starRating===i+1),
    'INCOMPLETE_STAR_TIERS');
  return freeze({
    starResults:freeze(rows),
    sourceAuthenticated:false,
    nativeSourceSettingsOnly:true,
    sellPriceComputed:false
  });
}
function exactCookingBody(bytes){
  let entryIndex=0,body=null;
  scan(bytes,(field,kind,entry)=>{
    must(field===1&&kind===2,'PROTODB_CONTAINER_WIRE');
    const index=entryIndex++;
    // Only inspect the Cooking definition. Preserve all other records untouched.
    const key=singleton(entry,1,2);
    must(key!==null,'MISSING_ENTRY_KEY');
    const name=utf8.decode(key);
    if(name!=='Cooking')return;
    must(body===null&&index===6,'COOKING_ENTRY_MISMATCH');
    const envelope=singleton(entry,2,2);
    must(envelope!==null,'MISSING_COOKING_ENVELOPE');
    const nativeClass=singleton(envelope,5,2);
    must(nativeClass!==null&&utf8.decode(nativeClass)===
      'Definitions.Activities.CookingData','WRONG_NATIVE_CLASS');
    const nativeBody=singleton(envelope,6,2);
    must(nativeBody!==null,'MISSING_COOKING_BODY');
    body=nativeBody;
  });
  must(entryIndex===2246&&body!==null&&body.length===315,
    'PROTODB_ORIGINAL_CENSUS');
  return body;
}
async function sha256(bytes){
  must(!!globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(c=>c.toString(16).padStart(2,'0')).join('');
}
/**
 * The local caller must select the exact Steam v1.26.2 original
 * ddv_Data/StreamingAssets/protoDb.bin. All bytes are independently pinned.
 */
export async function loadPrivateCookingStarSettings(protoDbBytes){
  must(protoDbBytes instanceof Uint8Array&&protoDbBytes.length===1335720&&
    protoDbBytes.length<=MAX_PROTO,'INVALID_SOURCE_BYTES');
  must(await sha256(protoDbBytes)===DB02_ORIGINAL_COOKING_PROTO_SHA256,
    'ORIGINAL_SOURCE_SHA');
  const body=exactCookingBody(protoDbBytes);
  must(await sha256(body)===DB02_ORIGINAL_COOKING_WIRE_SHA256,
    'ORIGINAL_COOKING_BODY_SHA');
  const parsed=parseCookingDataStarSettings(body);
  return freeze({
    contract:DB02_PRIVATE_COOKING_STAR_CONTRACT,
    gameVersion:'1.26.2',platform:'Steam',
    sourceEntryKey:'Cooking',nativeClass:'Definitions.Activities.CookingData',
    originalProtoSha256:DB02_ORIGINAL_COOKING_PROTO_SHA256,
    nativeCookingWireSha256:DB02_ORIGINAL_COOKING_WIRE_SHA256,
    verifiedPrivateOriginal:true,
    priceTableKind:'star_result_ingredient_percentage_configuration',
    starResults:parsed.starResults,
    getStarResult:star=>{
      must(Number.isSafeInteger(star)&&star>=1&&star<=5,'INVALID_STAR');
      return parsed.starResults[star-1];
    },
    // Separate executable audits verify SOME native math and routing only.
    // This loader never proves a complete item sale-price calculation.
    formulaBodyVerified:false,roundingRuleVerified:false,
    actualSellPricesVerified:false,saveWriterAuthorized:false,
    publishable:false
  });
}
