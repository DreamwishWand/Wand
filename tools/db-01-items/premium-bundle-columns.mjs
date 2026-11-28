import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const check=(ok,why)=>{if(!ok)throw Error('DB01_PREMIUM_BUNDLE_'+why)};
const SHA=/^[a-f0-9]{64}$/;
const BUNDLE=/^[A-Za-z0-9_-]{1,128}$/;
const validId=v=>Number.isSafeInteger(v)&&v>0;
export function loadPremiumBundleColumns(project,pin,rows){
  if(pin===undefined)return null;
  check(typeof pin==='string'&&SHA.test(pin),'PIN');
  const bytes=readFileSync(join(project,'data/ddv/item-master/premium-bundles-public.json'));
  check(createHash('sha256').update(bytes).digest('hex')===pin,'SOURCE_SHA');
  const catalog=JSON.parse(bytes);
  check(catalog.schema==='wand.item-master.premium-bundle-source@1'&&catalog.source?.steam?.globalCompletenessVerified===false&&
    catalog.source?.legacy?.schemaFullyVerified===false&&Array.isArray(catalog.definitions),'SOURCE');
  // Validate exact public schema and reject restricted nested fields rather than copying arbitrary native objects.
  function safe(value){
    if(Array.isArray(value))return value.forEach(safe);
    if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){
      check(!/price|discount|saleStart|saleEnd|startDate|endDate|timestamp|nativeOffer|rawWire|token/i.test(k),'RESTRICTED_FIELD');
      safe(v);
    }
  }
  safe(catalog);
  const known=new Set(rows.map(r=>r.itemId)),byItem=new Map(),all=new Set();
  let previous='',currentCount=0,oldCount=0,commonCount=0;
  for(const b of catalog.definitions){
    check(BUNDLE.test(b.bundleId)&&b.bundleId>previous&&
      (b.current||b.legacy)&&b.saleHistoryVerified===false&&b.currentAvailabilityVerified===false&&b.listingEligibility==='unverified','DEFINITION');
    previous=b.bundleId;
    if(b.current)currentCount++;
    if(b.legacy)oldCount++;
    if(b.current&&b.legacy)commonCount++;
    for(const [kind,revision] of [['current',b.current],['legacy',b.legacy]]){
      if(!revision)continue;
      check(SHA.test(revision.revisionSha256)&&Array.isArray(revision.components)&&revision.components.length>0,'REVISION');
      for(const [index,c] of revision.components.entries()){
        check(validId(c.itemId)&&validId(c.quantity),'COMPONENT');
        all.add(c.itemId);
        if(!known.has(c.itemId))continue;
        let row=byItem.get(c.itemId);
        if(!row){row={bundleIds:[],currentBundleIds:[],legacyBundleIds:[],occurrences:[]};byItem.set(c.itemId,row);}
        if(!row.bundleIds.includes(b.bundleId))row.bundleIds.push(b.bundleId);
        const ids=kind==='current'?row.currentBundleIds:row.legacyBundleIds;
        if(!ids.includes(b.bundleId))ids.push(b.bundleId);
        row.occurrences.push([b.bundleId,kind,index,c.quantity]);
      }
    }
  }
  const c=catalog.counts;
  check(c.publicDefinitions===catalog.definitions.length&&c.publicDistinctItems===all.size&&
    c.steam===currentCount&&c.shared===commonCount&&c.switch===oldCount+c.withheldDefinitions&&
    c.total===c.publicDefinitions+c.withheldDefinitions&&c.legacyOnly===c.switch-c.shared&&c.steamOnly===c.steam-c.shared,'CENSUS');
  return {catalog,byItem,coverage:{...c,canonicalItemCount:byItem.size,unindexedItemCount:all.size-byItem.size,
    canonicalCurrentItemCount:[...byItem.values()].filter(x=>x.currentBundleIds.length).length,
    currentAvailabilityVerified:false,saleHistoryVerified:false,globalCompletenessVerified:false}};
}
