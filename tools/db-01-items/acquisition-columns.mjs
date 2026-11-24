/** Offline projection of existing verified acquisition indexes into the
 * canonical Item ID field store. No new product JS or standalone database.
 * Legacy source files are still supported by the existing compatibility APIs.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[1-9][0-9]{0,15}$/;
const CATEGORIES=['ordinary_gameplay','premium_shop','star_path','in_game_limited_event','real_time_limited_event','iap_package_reward'];
const check=(ok,code)=>{if(!ok)throw Error('DB01_ACQUISITION_PROJECTION_'+code)};
function canonical(v){check(typeof v==='string'&&ID.test(v)&&Number.isSafeInteger(Number(v)),'ID');return Number(v)}
function pinned(project,name,version,sha){
  check(/^\d+\.\d+\.\d+$/.test(version)&&typeof sha==='string'&&SHA.test(sha),'PIN');
  const bytes=readFileSync(join(project,'static/acquisition/public',name+'-'+version+'.json'));
  check(createHash('sha256').update(bytes).digest('hex')===sha,'SHA_'+name);
  return JSON.parse(bytes);
}
export function loadAcquisitionColumns(project,version,pins,rows){
  if(pins===undefined)return null;
  check(Object.keys(pins).length===2,'PIN_SHAPE');
  const a=pinned(project,'db01-item-acquisition',version,pins.summarySha256);
  const b=pinned(project,'db01-item-source-relations',version,pins.relationsSha256);
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  check(a.schema==='wand.db02.db01-item-acquisition@1'&&b.schema==='wand.db02.db01-item-source-relations@1'&&
    [a,b].every(x=>x.target?.platform==='Steam'&&x.target?.gameVersion===version&&same(x.categoryOrder,CATEGORIES))&&
    a.coverage.allGameItemIdsCovered===false&&b.semantics.allOriginalSourcesCovered===false&&
    b.semantics.currentAvailabilityVerified===false&&a.coverage.separateActiveAvailabilityVerified===false,'SOURCE');
  const known=new Set(rows.map(r=>r.itemId)),summary=new Map(),relations=new Map();
  let prior=0,classified=0,hintRows=0,linkCount=0;
  for(const [raw,groups,hints] of a.items){
    const i=canonical(raw);
    check(i>prior&&Array.isArray(groups)&&Array.isArray(hints),'SUMMARY_ROW');prior=i;
    const details=Object.fromEntries(groups);
    const categories=CATEGORIES.filter(c=>Object.hasOwn(details,c));
    check(same(categories,groups.map(x=>x[0]))&&groups.every(([c,m])=>Array.isArray(m)&&m.length>0&&
      m.every(v=>a.details[c].includes(v)))&&hints.every(x=>['premium','time_limited'].includes(x))&&
      new Set(hints).size===hints.length&&(groups.length||hints.length),'SUMMARY_GROUPS');
    if(categories.length)classified++;
    if(hints.length)hintRows++;
    summary.set(i,{itemId:raw,categories,details,unresolvedOnlineHints:hints,classified:categories.length>0,currentAvailabilityVerified:false});
  }
  prior=0;
  check(Array.isArray(b.roles)&&Array.isArray(b.sourceKinds)&&b.roles.length===b.roleCategory.length&&
    b.roleCategory.every(c=>c===null||Number.isInteger(c)&&c>=0&&c<CATEGORIES.length),'ROLE_CATALOG');
  for(const [raw,edges] of b.items){
    const i=canonical(raw);
    check(i>prior&&Array.isArray(edges)&&edges.length>0,'RELATIONS_ROW');prior=i;
    const links=edges.map(edge=>{
      check(Array.isArray(edge)&&edge.length===5,'EDGE');
      const [k,s,r,n,p]=edge;
      check(Number.isInteger(k)&&k>=0&&k<b.sourceKinds.length&&Number.isInteger(r)&&r>=0&&r<b.roles.length&&
        typeof s==='string'&&s.length>0&&s.length<=128&&Number.isSafeInteger(n)&&n>=0&&
        Array.isArray(p)&&p.length<=8&&p.every(v=>v===null||typeof v==='string'&&v.length<=256||Number.isSafeInteger(v)&&v>=0),'EDGE_VALUE');
      return {kind:b.sourceKinds[k],sourceId:s,role:b.roles[r],category:b.roleCategory[r]===null?null:CATEGORIES[b.roleCategory[r]],
        occurrenceIndex:n,sourcePosition:p,gameSourceOnly:true,grantedVerified:false,currentlyAvailableVerified:false};
    });
    const categories=CATEGORIES.filter(c=>links.some(l=>l.category===c));
    check(same(categories,summary.get(i)?.categories??[]),'CATEGORY_JOIN');
    relations.set(i,{itemId:raw,categories,links,identifiedSourceLinks:true,sourceCoverageComplete:false});
    linkCount+=links.length;
  }
  check(summary.size===a.coverage.recordsIncludingUnresolvedHints&&classified===a.coverage.distinctClassifiedItemIds&&
    hintRows===a.coverage.distinctOriginalOnlineHintItemIds&&relations.size===b.coverage.itemIdsWithLinks&&
    linkCount===b.coverage.sourceLinks&&[...summary].every(([i,s])=>!s.classified||relations.has(i)),'CENSUS');
  for(const c of CATEGORIES)check([...summary.values()].filter(s=>s.categories.includes(c)).length===a.coverage.itemIdsByCategory[c],'CATEGORY_CENSUS');
  // An explicit source reference outside the published item universe is not
  // a canonical Item definition. Keep those in the existing source index.
  const summaryCount=[...summary.keys()].filter(i=>known.has(i)).length;
  const relationCount=[...relations.keys()].filter(i=>known.has(i)).length;
  return {summary,relations,metadata:{...pins,sourceGameVersion:version,
    summaryCount,relationCount,sourceOnlySummaryCount:summary.size-summaryCount,
    sourceOnlyRelationCount:relations.size-relationCount,
    sourceLinks:linkCount,currentAvailabilityVerified:false,coverageComplete:false}};
}
