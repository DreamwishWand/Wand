/**
 * Build-only extension of the versioned DB-01 master. The old archive and
 * its Collection projection remain immutable until consumers migrate.
 * The extension is a narrow, owner-authorized projection of source records,
 * not the original private catalog or a proof of actual Collection membership.
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const GUID=/^[0-9a-f]{32}$/;
const SHA=/^[0-9a-f]{64}$/;
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const STATES=['source_linked','unresolved_source','no_universe_in_verified_tag_fields'];
const ID=x=>Number.isSafeInteger(x)&&x>0;
const TAG_ID=x=>ID(x)&&x>=2000500000&&x<2000600000;
const sortedUnique=(values,compare)=>[...new Set(values)].sort(compare);
const byId=(a,b)=>a.itemId-b.itemId;
function check(v,code){if(!v)throw Error('DB01_EXPANDED_MASTER_'+code)}
function universe(row){
  const keys=sortedUnique([
    ...row.tags.filter(x=>x.facet==='disneyUniverse').map(x=>x.key),
    ...row.collectionSourceCandidates.map(x=>x.universeTagKey)
  ].filter(x=>typeof x==='string'&&x.length>0));
  const ids=sortedUnique([
    ...row.tags.filter(x=>x.facet==='disneyUniverse').map(x=>x.id),
    ...row.collectionSourceCandidates.map(x=>x.universeTagId)
  ].filter(TAG_ID),(a,b)=>a-b);
  return {keys,ids};
}
function validateExtra(row){
  check(ID(row.itemId)&&typeof row.nativeCategory==='string'&&
    typeof row.nativeKey==='string'&&row.nativeKey.length>0&&
    GUID.test(row.iconGuid)&&row.artwork?.iconGuid===row.iconGuid&&
    row.names&&LOCALES.every(l=>row.names[l]===null||
      typeof row.names[l]==='string'&&row.names[l].length>0)&&
    row.nameVerified===LOCALES.every(l=>row.names[l]!==null)&&
    row.itemType?.name===row.nativeCategory&&
    Number.isSafeInteger(row.itemType.code)&&
    Number.isSafeInteger(row.itemType.subtypeCode)&&
    Math.floor(row.itemId/10000000)===row.itemType.code&&
    Math.floor((row.itemId%10000000)/100000)===row.itemType.subtypeCode&&
    typeof row.itemType.subtypeNameVerified==='boolean'&&
    Array.isArray(row.tags)&&row.tags.every(t=>ID(t.id)&&
      typeof t.key==='string'&&typeof t.facet==='string'&&
      Number.isSafeInteger(t.sourceField))&&
    Array.isArray(row.collectionSourceCandidates)&&
    row.collectionSourceCandidates.every(c=>ID(c.setId)&&
      Number.isSafeInteger(c.groupIndex)&&typeof c.evidence==='string')&&
    row.collectionMembershipVerified===false&&row.worldMembershipVerified===false&&
    row.availabilityVerified===false,'ROW_'+row.itemId);
  if(row.nativeCategory==='MemoryShard')
    check(GUID.test(row.artwork.imageGuid)&&GUID.test(row.artwork.maskGuid),
      'MEMORY_ARTWORK_'+row.itemId);
  const u=universe(row);
  check(Array.isArray(row.universeTagIds)&&
    JSON.stringify(row.universeTagIds)===JSON.stringify(u.ids)&&
    STATES.includes(row.universeSourceStatus)&&
    (row.universeSourceStatus==='source_linked')===(u.ids.length>0),
    'UNIVERSE_'+row.itemId);
}
export function materializeExpandedMaster(project,entry,release,files,baseFacetPath){
  if(!entry.expanded)return;
  const version=entry.gameVersion,e=entry.expanded;
  check(typeof e.release==='string'&&
    new RegExp('^steam-'+version.replaceAll('.','\\.')+'-item-id-master-v[1-9][0-9]*$').test(e.release)&&
    e.release!==release.version&&
    Number.isSafeInteger(e.count)&&e.count>release.count&&e.count<=1000000&&
    SHA.test(e.extensionSha256),'RELEASE_ENTRY');
  const bytes=readFileSync(join(project,'data/ddv/item-master',
    'collectible-extension-steam-'+version+'.json'));
  check(sha(bytes)===e.extensionSha256,'EXTENSION_SHA');
  const ext=JSON.parse(bytes.toString('utf8'));
  check(ext.schema==='wand.item-master.collectible-extension@1'&&
    ext.target?.platform===release.target.platform&&
    ext.target?.gameVersion===version&&
    ext.baseRelease===release.version&&ext.baseCount===release.count&&
    ext.sourceItemsSha256===release.source.sourceItemsSha256&&
    ext.count===e.count-release.count&&Array.isArray(ext.items)&&
    ext.items.length===ext.count,'EXTENSION_SCHEMA');
  const rowsByBucket=new Map(), seen=new Set();
  const allRows=[];
  for(let i=0;i<256;i++){
    const key=i.toString(16).padStart(2,'0'),p='id/'+key+'.json';
    const rows=JSON.parse(files.get(p).toString('utf8')).items;
    rowsByBucket.set(key,rows.slice());
    for(const row of rows){check(!seen.has(row.itemId),'BASE_DUPLICATE');seen.add(row.itemId);allRows.push(row);}
  }
  const actualFamilies={};
  for(const row of ext.items){
    validateExtra(row);
    check(!seen.has(row.itemId),'EXTENSION_DUPLICATE_'+row.itemId);
    seen.add(row.itemId);allRows.push(row);
    rowsByBucket.get((row.itemId&255).toString(16).padStart(2,'0')).push(row);
    actualFamilies[row.nativeCategory]=(actualFamilies[row.nativeCategory]??0)+1;
  }
  check(seen.size===e.count&&
    Object.keys(actualFamilies).length===Object.keys(ext.coverage.byNativeCategory).length&&
    Object.entries(actualFamilies).every(([k,v])=>ext.coverage.byNativeCategory[k]===v),
    'EXTENSION_CENSUS');
  const coverage={...release.coverage,
    itemNamesVerified:allRows.filter(r=>r.nameVerified).length,
    itemNamesUnverified:allRows.filter(r=>!r.nameVerified).length,
    itemIconGuid:allRows.filter(r=>GUID.test(r.iconGuid)).length,
    sourceTagReferences:allRows.reduce((a,r)=>a+r.tags.length,0),
    itemsWithSourceTag:allRows.filter(r=>r.tags.length>0).length,
    sourceCollectionCandidateReferences:allRows.reduce((a,r)=>a+r.collectionSourceCandidates.length,0),
    itemsWithSourceCollectionCandidates:allRows.filter(r=>r.collectionSourceCandidates.length>0).length,
  };
  const index={...release,scope:'expanded',version:e.release,count:e.count,
    baseRelease:release.version,baseCount:release.count,extensionCount:ext.count,
    extensionSha256:e.extensionSha256,coverage,shards:{}};
  const root=join(project,'static/ddv/item-master');
  mkdirSync(root,{recursive:true});
  const staging=mkdtempSync(join(root,'.expanded-'));
  try{
    mkdirSync(join(staging,'id'));
    for(const [key,rows] of rowsByBucket){
      rows.sort(byId);
      const path='id/'+key+'.json';
      const data=Buffer.from(JSON.stringify({
        schema:'wand.item-master.shard@1',bucket:key,items:rows
      })+'\n');
      index.shards[path]={count:rows.length,bytes:data.length,sha256:sha(data)};
      writeFileSync(join(staging,path),data);
    }
    writeFileSync(join(staging,'index.json'),JSON.stringify(index)+'\n');
    const destination=join(root,'steam-'+version+'-expanded');
    rmSync(destination,{recursive:true,force:true});
    renameSync(staging,destination);
  }catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
  // Reuse the existing Collection-only source projection, adding only the
  // newly available ID rows. Leave the original 13,202-ID artifact untouched.
  const facet=JSON.parse(readFileSync(baseFacetPath,'utf8'));
  check(facet.release===release.version&&facet.sourceItemCount===release.count&&
    facet.nativeSubtypeItemCount===release.count,'BASE_FACET_VERSION');
  const nativeSubtypeItems=[...facet.nativeSubtypeItems];
  const items=[...facet.items], categoryItems=[...facet.categoryItems];
  const universeSourceItems=[...facet.universeSourceItems];
  const universeSourceTagItems=[...facet.universeSourceTagItems];
  const universeSourceStatusItems=[];
  const baseUniverse=new Set([...facet.universeSourceItems,...facet.universeSourceTagItems].map(r=>r[0]));
  for(const row of allRows){
    const u=universe(row);
    universeSourceStatusItems.push([row.itemId,row.universeSourceStatus??
      (baseUniverse.has(row.itemId)?'source_linked':'unresolved_source')]);
    if(!row.artwork)continue;
    nativeSubtypeItems.push([row.itemId,row.itemType.name,row.itemType.subtypeCode,
      row.itemType.subtypeNameVerified?row.itemType.subtypeName:null]);
    if(row.tags.length)items.push([row.itemId,row.tags.map(t=>[t.facet,t.key])]);
    const submenus=sortedUnique(row.collectionSourceCandidates.map(c=>c.submenuCode)
      .filter(Number.isSafeInteger),(a,b)=>a-b);
    if(submenus.length)categoryItems.push([row.itemId,submenus]);
    if(u.keys.length)universeSourceItems.push([row.itemId,u.keys]);
    if(u.ids.length)universeSourceTagItems.push([row.itemId,u.ids]);
  }
  const sorted=arr=>arr.sort((a,b)=>a[0]-b[0]);
  for(const arr of [nativeSubtypeItems,items,categoryItems,universeSourceItems,
    universeSourceTagItems,universeSourceStatusItems]){
    sorted(arr);check(new Set(arr.map(r=>r[0])).size===arr.length&&
      arr.every(r=>seen.has(r[0])),'FACET_DUPLICATE_OR_DANGLING');
  }
  check(nativeSubtypeItems.length===e.count&&universeSourceStatusItems.length===e.count,
    'FACET_CENSUS');
  const next={...facet,release:e.release,sourceItemCount:e.count,
    extensionSha256:e.extensionSha256,taggedItems:items.length,items,
    categoryItemCount:categoryItems.length,categoryItems,
    nativeSubtypeItemCount:nativeSubtypeItems.length,nativeSubtypeItems,
    universeSourceItemCount:universeSourceItems.length,universeSourceItems,
    universeSourceTagCount:universeSourceTagItems.length,universeSourceTagItems,
    universeSourceStatusItems,universeSourceStatusItemCount:universeSourceStatusItems.length,
    gameRuntimeMembershipVerified:false};
  const destination=join(dirname(baseFacetPath),
    'db01-expanded-facets-'+version.replaceAll('.','')+'.json');
  writeFileSync(destination,JSON.stringify(next)+'\n');
  console.log('DB-01 expanded Item master:',e.count,'items,',ext.count,'new definitions');
}
