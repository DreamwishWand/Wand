/**
 * Build-only compiler for the definition-complete DB-01 source release.
 * Public assets contain sanitized source facts, never source binaries or saves.
 * Old v1/v2 releases remain compatibility views; v3 has every native ID.
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const hash=b=>createHash('sha256').update(b).digest('hex');
const SHA=/^[0-9a-f]{64}$/;
const GUID=/^[0-9a-f]{32}$/;
const ID=i=>Number.isSafeInteger(i)&&i>0;
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const STATES=['source_linked','unresolved_source','no_universe_in_verified_tag_fields'];
const SCOPES=['source_candidate','item_definition','other_definition'];
const FACETS=new Set(['color','furnitureStyle','clothingStyle','furnitureKind',
  'clothingSlot','disneyUniverse','worldContextTag','ingredientKind','mealKind']);
const SUBMENUS=new Set([0,1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
const json=b=>Buffer.from(JSON.stringify(b)+'\n');
const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
function check(v,c){if(!v)throw Error('DB01_COMPLETE_MASTER_'+c)}
function validAttribute(value,depth=0){
  if(depth>16)return false;
  if(typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return true;
  if(Array.isArray(value))return value.every(v=>validAttribute(v,depth+1));
  return value!==null&&typeof value==='object'&&Object.entries(value).every(([k,v])=>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)&&
    validAttribute(v,depth+1));
}
function attachAttributes(project,e,version,source,byId){
  if(e.attributesSha256===undefined)return undefined;
  check(SHA.test(e.attributesSha256),'ATTRIBUTE_SHA_FORMAT');
  const bytes=readFileSync(join(project,'data/ddv/item-master','source-attributes-steam-'+version+'.json.gz'));
  check(hash(bytes)===e.attributesSha256,'ATTRIBUTE_SHA');
  const a=JSON.parse(gunzipSync(bytes,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(a.schema==='wand.item-master.source-attributes@1'&&a.release===e.release&&
    a.gameVersion===version&&a.sourceItemsSha256===source.sourceItemsSha256&&
    a.masterArchiveSha256===e.archiveSha256&&a.definitionCount===e.count&&
    a.allOriginalFieldSemanticsVerified===false&&a.gridLayerOccupancyVerified===false&&
    a.runtimePriceVerified===false&&Array.isArray(a.items)&&a.items.length===a.count,
    'ATTRIBUTE_RELEASE');
  const seen=new Set(),coverage=new Map();
  for(const pair of a.items){
    check(Array.isArray(pair)&&pair.length===2&&ID(pair[0])&&byId.has(pair[0])&&
      !seen.has(pair[0])&&pair[1]&&typeof pair[1]==='object'&&!Array.isArray(pair[1])&&
      Object.keys(pair[1]).length>0&&validAttribute(pair[1]),'ATTRIBUTE_ROW');
    const [id,props]=pair;seen.add(id);
    const r=byId.get(id);
    check(r.sourceClass!==null&&Object.keys(props).every(k=>!Object.hasOwn(r.nativeProperties,k)),
      'ATTRIBUTE_SCALAR_DUPLICATION');
    r.sourceAttributes=props;
    for(const k of Object.keys(props))coverage.set(k,(coverage.get(k)??0)+1);
  }
  check(Object.keys(a.coverage).length===coverage.size&&
    [...coverage].every(([k,n])=>a.coverage[k]===n),'ATTRIBUTE_CENSUS');
  return {itemCount:seen.size,fieldCount:coverage.size,
    fieldOccurrences:[...coverage.values()].reduce((a,b)=>a+b,0),
    fields:a.coverage,unmappedSourceClassCount:a.unmappedSourceClassCount,
    allOriginalFieldSemanticsVerified:false,gridLayerOccupancyVerified:false,runtimePriceVerified:false};
}
const LOCALIZED_FIELDS=['Description','DescriptionText','EvolvingDescription','PluralDisplayName'];
function loadLocalizations(project,e,version,source,byId){
  if(e.localization===undefined)return undefined;
  const config=e.localization;
  check(SHA.test(config.sha256)&&Number.isSafeInteger(config.parts)&&config.parts>0&&config.parts<=100,'LOCALIZATION_METADATA');
  const packed=Buffer.concat(Array.from({length:config.parts},(_,i)=>
    readFileSync(join(project,'data/ddv/item-master','item-localizations-steam-'+version+'.json.gz.part'+i))));
  check(hash(packed)===config.sha256,'LOCALIZATION_SHA');
  const l=JSON.parse(gunzipSync(packed,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(l.schema==='wand.item-master.localized-source@1'&&l.release===e.release&&
    l.gameVersion===version&&l.sourceItemsSha256===source.sourceItemsSha256&&
    l.masterArchiveSha256===e.archiveSha256&&l.attributesSha256===e.attributesSha256&&
    Array.isArray(l.items)&&l.items.length===l.count,'LOCALIZATION_RELEASE');
  const expected=new Map();
  for(const row of byId.values()){
    if(row.nativeCategory==='Dialogue')continue;
    const fields=Object.fromEntries(LOCALIZED_FIELDS.filter(k=>typeof row.sourceAttributes?.[k]==='string')
      .map(k=>[k,row.sourceAttributes[k]]));
    if(Object.keys(fields).length)expected.set(row.itemId,fields);
  }
  const keys=new Set(),seen=new Set(),fieldCounts={};
  for(const [id,fields] of l.items){
    const actual=expected.get(id);
    check(actual&&!seen.has(id)&&Object.keys(actual).length===Object.keys(fields).length&&
      Object.entries(fields).every(([k,v])=>actual[k]===v),'LOCALIZATION_ITEM_LINK');
    seen.add(id);
    for(const [k,v] of Object.entries(fields)){keys.add(v);fieldCounts[k]=(fieldCounts[k]??0)+1;}
  }
  check(seen.size===expected.size&&keys.size===l.keyCount&&
    Object.keys(fieldCounts).length===Object.keys(l.fieldCounts).length&&
    Object.entries(fieldCounts).every(([k,v])=>l.fieldCounts[k]===v),'LOCALIZATION_LINK_CENSUS');
  check(Object.keys(l.translations).length===LOCALES.length&&Object.keys(l.evidence).length===LOCALES.length,'LOCALIZATION_LOCALES');
  for(const locale of LOCALES){
    const values=l.translations[locale],ev=l.evidence[locale];
    check(values&&ev&&SHA.test(ev.archiveSha256)&&Object.values(ev.members).every(v=>SHA.test(v))&&
      Object.keys(values).length===l.localeCounts[locale]&&
      Object.entries(values).every(([k,v])=>keys.has(k)&&typeof v==='string'&&v.trim().length>0&&v.length<=8192),
      'LOCALIZATION_VALUE_'+locale);
  }
  const all=[...keys].filter(k=>LOCALES.every(locale=>Object.hasOwn(l.translations[locale],k))).length;
  check(all===l.allLocalesKeyCount,'LOCALIZATION_ALL_LOCALES');
  return {translations:l.translations,coverage:{itemCount:l.count,keyCount:l.keyCount,
    allLocalesKeyCount:all,fieldCounts:l.fieldCounts,localeCounts:l.localeCounts,evidence:l.evidence}};
}
function sourceCodes(row){
  const codes=new Set(row.collectionSourceCandidates.map(c=>c.submenuCode).filter(c=>SUBMENUS.has(c)));
  // Native item-type browse fallback is not evidence of game Collection membership.
  if(row.nativeCategory==='Furniture')codes.add(3);
  if(row.nativeCategory==='Clothing')codes.add(4);
  if(row.nativeCategory==='ActivityItem'){
    const code=new Map([[2,0],[4,0],[11,0],[10,1],[3,2],[8,8],[16,9],[17,10]]).get(row.itemType.subtypeCode);
    if(code!==undefined)codes.add(code);
  }
  return [...codes].sort((a,b)=>a-b);
}
function validLinks(links,byId,menus){
  return Array.isArray(links)&&links.every(c=>ID(c.setId)&&menus.has(c.setId)&&
    Number.isSafeInteger(c.groupIndex)&&c.groupIndex>=0&&
    menus.get(c.setId).submenuCode===c.submenuCode&&typeof c.evidence==='string'&&
    (c.sourceRecipeItemId==null||byId.has(c.sourceRecipeItemId))&&
    (c.sourceSetItemId==null||byId.has(c.sourceSetItemId)));
}
export function materializeCompleteSourceMaster(project,entry,baseRelease,baseFiles){
  const e=entry.complete;
  if(!e)return;
  const version=entry.gameVersion;
  check(typeof e.release==='string'&&e.release.startsWith('steam-'+version+'-item-id-master-v')&&
    e.release!==baseRelease.version&&e.release!==entry.expanded?.release&&
    Number.isSafeInteger(e.count)&&e.count>=baseRelease.count&&e.count<=1_000_000&&
    Number.isSafeInteger(e.parts)&&e.parts>=1&&e.parts<=100&&SHA.test(e.archiveSha256),'VERSION_ENTRY');
  const packed=Buffer.concat(Array.from({length:e.parts},(_,i)=>
    readFileSync(join(project,'data/ddv/item-master','complete-source-steam-'+version+'.json.gz.part'+i))));
  check(hash(packed)===e.archiveSha256,'ARCHIVE_SHA');
  const source=JSON.parse(gunzipSync(packed,{maxOutputLength:128*1024*1024}).toString('utf8'));
  check(source.schema==='wand.item-master.complete-source@1'&&source.release===e.release&&
    source.target.platform==='Steam'&&source.target.gameVersion===version&&
    source.sourceItemsSha256===baseRelease.source.sourceItemsSha256&&
    SHA.test(source.sourceIl2cppDumpSha256)&&source.count===e.count&&
    Array.isArray(source.items)&&source.items.length===e.count&&
    Object.keys(source.sourceFilesSha256).length===source.sourceFilesVerified&&
    Object.values(source.sourceFilesSha256).every(s=>SHA.test(s))&&
    source.coverage.definitionCount===e.count&&source.coverage.runtimeCollectionMembershipVerified===false&&
    source.coverage.allOriginalFieldSemanticsVerified===false,'SCHEMA');
  const rows=source.items;
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  check(byId.size===e.count&&rows.every((r,i)=>i===0||rows[i-1].itemId<r.itemId),'ID_CENSUS');
  const sourceAttributeCoverage=attachAttributes(project,e,version,source,byId);
  const localizations=loadLocalizations(project,e,version,source,byId);
  // Verify no existing public definition is lost or silently replaced.
  for(const [path,raw] of baseFiles){
    if(!path.startsWith('id/'))continue;
    for(const prev of JSON.parse(raw.toString('utf8')).items){
      const next=byId.get(prev.itemId);
      check(next&&prev.nativeCategory===next.nativeCategory&&prev.nativeKey===next.nativeKey&&
        prev.iconGuid===next.iconGuid&&LOCALES.every(l=>prev.names[l]===next.names[l]),
        'BASE_IDENTITY_'+prev.itemId);
    }
  }
  const menus=new Map(source.collectionMenus.map(r=>[r.setId,r]));
  const universes=new Map(source.universeTags.map(r=>[r.tagId,r]));
  const worlds=new Map(source.worldTags.map(r=>[r.tagId,r]));
  const validLabels=(r)=>ID(r.tagId)&&byId.get(r.tagId)?.nativeCategory==='Tag'&&
    typeof r.key==='string'&&LOCALES.every(l=>r.names[l]===null||
      typeof r.names[l]==='string'&&r.names[l].length>0);
  check(menus.size===source.collectionMenus.length&&
    [...menus.keys()].every(i=>byId.get(i)?.nativeCategory==='CollectionSet')&&
    universes.size===source.universeTags.length&&source.universeTags.every(validLabels)&&
    worlds.size===source.worldTags.length&&source.worldTags.every(validLabels)&&
    source.collectionSelectors.length===source.coverage.sourceSelectorCount,'RELATION_CENSUS');
  const buckets=Array.from({length:256},()=>[]);
  const f={schema:'wand.collection.db01-complete-source-facets@1',release:e.release,
    sourceArchiveSha256:e.archiveSha256,sourceItemCount:rows.length,
    nativeSubtypeItems:[],items:[],categoryItems:[],activityTypeItems:[],
    universeSourceItems:[],universeSourceTagItems:[],universeSourceStatusItems:[],
    worldSourceTagItems:[],sourceSetItems:[],craftingRecipeResultItems:[],
    definitionScopeItems:[],browseItems:[],
    universeTags:source.universeTags,worldTags:source.worldTags,
    gameRuntimeMembershipVerified:false};
  const names={};
  for(const l of LOCALES)names[l]=[];
  for(const r of rows){
    const i=r.itemId;
    check(ID(i)&&typeof r.nativeCategory==='string'&&r.nativeCategory in source.sourceFilesSha256&&
      typeof r.nativeKey==='string'&&r.nativeKey.length>0&&
      (r.iconGuid===null||GUID.test(r.iconGuid))&&
      r.artwork&&Object.values(r.artwork).every(g=>GUID.test(g))&&
      (r.artwork.iconGuid??null)===r.iconGuid&&
      r.names&&LOCALES.every(l=>r.names[l]===null||typeof r.names[l]==='string'&&r.names[l].length>0)&&
      r.nameVerified===LOCALES.every(l=>r.names[l]!==null)&&
      r.itemType?.name===r.nativeCategory&&Number.isSafeInteger(r.itemType.code)&&
      Math.floor(i/10000000)===r.itemType.code&&
      Math.floor((i%10000000)/100000)===r.itemType.subtypeCode&&
      typeof r.itemType.subtypeNameVerified==='boolean'&&
      Array.isArray(r.tags)&&r.tags.every(t=>ID(t.id)&&byId.get(t.id)?.nativeCategory==='Tag'&&
        typeof t.key==='string'&&typeof t.facet==='string'&&Number.isSafeInteger(t.sourceField))&&
      validLinks(r.collectionPositiveSourceLinks,byId,menus)&&validLinks(r.collectionExclusions,byId,menus)&&
      validLinks(r.collectionSourceCandidates,byId,menus)&&
      SCOPES.includes(r.definitionScope)&&STATES.includes(r.universeSourceStatus)&&
      (r.universeSourceStatus==='source_linked')===(r.universeTagIds.length>0)&&
      r.universeTagIds.every(t=>universes.has(t))&&
      JSON.stringify(r.universeTagIds)===JSON.stringify(uniq([
        ...r.universeDirectTagIds,...r.universeSetTagIds,...r.universePredicateTagIds]))&&
      r.worldTagIds.every(t=>worlds.has(t))&&
      (r.sourceSetItemId===null||byId.get(r.sourceSetItemId)?.nativeCategory==='Set')&&
      r.craftingRecipeItemIds.every(t=>byId.get(t)?.itemType.subtypeName==='CraftingRecipe')&&
      Array.isArray(r.sourceFrame)&&r.sourceFrame.length===2&&r.sourceFrame.every(Number.isSafeInteger)&&
      r.sourceFrame[0]>=0&&r.sourceFrame[1]>0&&Array.isArray(r.observedFields)&&
      r.observedFields.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isSafeInteger)&&v[0]>0&&v[2]>0&&[0,1,2,5].includes(v[1]))&&
      r.nativeProperties&&Object.values(r.nativeProperties).every(v=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))&&
      r.collectionMembershipVerified===false&&r.worldMembershipVerified===false&&r.availabilityVerified===false,
      'ROW_'+i);
    const excluded=new Set(r.collectionExclusions.map(c=>c.setId+':'+c.groupIndex));
    const actual=r.collectionPositiveSourceLinks.filter(c=>!excluded.has(c.setId+':'+c.groupIndex));
    check(JSON.stringify(actual)===JSON.stringify(r.collectionSourceCandidates),'POLARITY_'+i);
    buckets[i&255].push(r);
    const type=r.itemType;
    f.nativeSubtypeItems.push([i,type.name,type.subtypeCode,type.subtypeName]);
    f.definitionScopeItems.push([i,r.definitionScope]);
    if(type.name==='ActivityItem')f.activityTypeItems.push([i,type.subtypeCode,type.subtypeName]);
    const tags=r.tags.filter(t=>FACETS.has(t.facet)).map(t=>[t.facet,t.key]);
    if(tags.length)f.items.push([i,tags]);
    const codes=sourceCodes(r);if(codes.length)f.categoryItems.push([i,codes]);
    if(r.universeTagIds.length){
      f.universeSourceTagItems.push([i,r.universeTagIds]);
      f.universeSourceItems.push([i,r.universeTagIds.map(t=>universes.get(t).key)]);
    }
    f.universeSourceStatusItems.push([i,r.universeSourceStatus]);
    if(r.worldTagIds.length)f.worldSourceTagItems.push([i,r.worldTagIds]);
    if(r.sourceSetItemId!==null)f.sourceSetItems.push([i,r.sourceSetItemId]);
    if(r.craftingRecipeItemIds.length)f.craftingRecipeResultItems.push([i,r.craftingRecipeItemIds]);
    // Include source-matched definitions and item-like classes as browse
    // candidates. This does not declare them all visible/owned/collectible.
    if(r.definitionScope!=='other_definition'){
      f.browseItems.push([i,r.nativeCategory,type.subtypeCode,r.iconGuid,r.definitionScope]);
      for(const l of LOCALES)if(r.names[l]!==null)names[l].push([i,r.names[l]]);
    }
  }
  check(f.nativeSubtypeItems.length===e.count&&
    f.universeSourceStatusItems.length===e.count&&
    f.craftingRecipeResultItems.length===source.coverage.recipeResultItemIds&&
    f.craftingRecipeResultItems.reduce((n,r)=>n+r[1].length,0)===source.coverage.recipeResultLinks&&
    f.worldSourceTagItems.length===source.coverage.worldTagItemIds&&
    rows.reduce((n,r)=>n+r.collectionPositiveSourceLinks.length,0)===source.coverage.positiveSourceLinks&&
    rows.reduce((n,r)=>n+r.collectionExclusions.length,0)===source.coverage.negativeSourceLinks,
    'FACT_CENSUS');
  for(const [key,count] of [['taggedItems','items'],['categoryItemCount','categoryItems'],
    ['activityTypeItemCount','activityTypeItems'],['nativeSubtypeItemCount','nativeSubtypeItems'],
    ['universeSourceItemCount','universeSourceItems'],['universeSourceTagCount','universeSourceTagItems'],
    ['universeSourceStatusItemCount','universeSourceStatusItems'],['worldSourceTagCount','worldSourceTagItems'],
    ['browseItemCount','browseItems']])f[key]=f[count].length;
  const index={schema:'wand.item-master.release@1',scope:'complete',version:e.release,target:source.target,
    count:e.count,bucketCount:256,archiveSha256:e.archiveSha256,
    sourceFilesVerified:source.sourceFilesVerified,sourceFilesSha256:source.sourceFilesSha256,
    sourceItemsSha256:source.sourceItemsSha256,sourceIl2cppDumpSha256:source.sourceIl2cppDumpSha256,
    coverage:{...source.coverage,itemNamesVerified:source.coverage.nameVerified,
      itemNamesUnverified:e.count-source.coverage.nameVerified,itemIconGuid:source.coverage.iconGuid,
      sourceTagReferences:rows.reduce((n,r)=>n+r.tags.length,0),
      itemsWithSourceTag:rows.filter(r=>r.tags.length>0).length,
      sourceCollectionCandidateReferences:rows.reduce((n,r)=>n+r.collectionSourceCandidates.length,0),
      itemsWithSourceCollectionCandidates:source.coverage.collectionCandidateItemIds,
      worldMembershipVerified:false,collectionMembershipVerified:false,
      acquisitionCoverageComplete:false,publishedR2ImageUrlAvailable:false},
    ...(sourceAttributeCoverage?{attributesSha256:e.attributesSha256,sourceAttributeCoverage}:{}),
    ...(localizations?{localizationSha256:e.localization.sha256,localizationCoverage:localizations.coverage}:{}),
    shards:{},assets:{}};
  const root=join(project,'static/ddv/item-master');
  mkdirSync(root,{recursive:true});
  const stage=mkdtempSync(join(root,'.complete-'));
  try{
    const write=(path,value,count)=>{
      const bytes=json(value);mkdirSync(dirname(join(stage,path)),{recursive:true});
      writeFileSync(join(stage,path),bytes);
      return {count,bytes:bytes.length,sha256:hash(bytes)};
    };
    for(let i=0;i<256;i++){
      const key=i.toString(16).padStart(2,'0'),path='id/'+key+'.json';
      index.shards[path]=write(path,{schema:'wand.item-master.shard@1',bucket:key,items:buckets[i]},buckets[i].length);
    }
    index.assets['collection-facets.json']=write('collection-facets.json',f,f.sourceItemCount);
    for(const l of LOCALES)index.assets['locale/'+l+'.json']=write('locale/'+l+'.json',
      {schema:'wand.item-master.complete-browse-names@1',release:e.release,locale:l,items:names[l]},names[l].length);
    index.assets['source-relations.json']=write('source-relations.json',{
      schema:'wand.item-master.complete-source-relations@1',release:e.release,
      collectionMenus:source.collectionMenus,collectionSelectors:source.collectionSelectors,
      ignoredSentinels:source.ignoredSentinels,universeTags:source.universeTags,worldTags:source.worldTags,
      sourceFieldDeclarations:source.sourceFieldDeclarations,gameRuntimeMembershipVerified:false
    },source.collectionSelectors.length);
    if(localizations)for(const locale of LOCALES){
      const entries=Object.entries(localizations.translations[locale]);
      const path='text/'+locale+'.json';
      index.assets[path]=write(path,{schema:'wand.item-master.localized-text@1',release:e.release,locale,items:entries},entries.length);
    }
    writeFileSync(join(stage,'index.json'),json(index));
    const destination=join(root,'steam-'+version+'-complete');
    rmSync(destination,{recursive:true,force:true});renameSync(stage,destination);
  }catch(err){rmSync(stage,{recursive:true,force:true});throw err;}
  console.log('DB-01 complete-source master:',rows.length,'definitions,',source.coverage.nativeCategoryCount,'native classes,',source.coverage.sourceSelectorCount,'resolved source selectors');
}
