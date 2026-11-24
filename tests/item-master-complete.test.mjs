import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openPublicItemMaster,openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {openPublicItemDetails,openCurrentItemDetails} from '../src/lib/items/public-item-details.ts';
import {parseDb01ItemAcquisition} from '../src/lib/acquisition/db01-item-acquisition.ts';
import {parseDb01ItemSourceRelations} from '../src/lib/acquisition/db01-item-source-relations.ts';
import {createPublicItemMediaReader} from '../src/lib/items/public-item-media.ts';
import {publicImageKey} from '../src/lib/media/public-image-key.ts';

const root='static/ddv/item-master/steam-1.26.2-complete';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function site(){
  const requests=[];
  return {requests,fetcher:async url=>{
    assert.match(url,/^\/Wand\/(?:ddv\/item-master|acquisition\/public\/db01-item-)/);
    requests.push(url);
    const bytes=await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes),{status:200});
  }};
}

test('complete source release includes every original definition exactly once',async()=>{
  const {fetcher,requests}=site();
  const master=await openPublicItemMaster('/Wand',fetcher,{gameVersion:'current',scope:'complete'});
  assert.equal(master.release.version,'steam-1.26.2-item-id-master-v3');
  assert.equal(master.release.count,39067);
  assert.equal(master.release.sourceFilesVerified,39);
  assert.equal(master.release.coverage.nativeCategoryCount,38);
  assert.equal(master.release.coverage.sourceSelectorCount,262);
  assert.equal(master.release.coverage.allOriginalFieldSemanticsVerified,false);
  assert.equal(requests.length,2,'registry and index only');
  const all=new Map();
  for(const [path,meta] of Object.entries(master.release.shards)){
    const bytes=await readFile(join(root,path));
    assert.equal(digest(bytes),meta.sha256);
    assert.equal(bytes.length,meta.bytes);
    const rows=JSON.parse(bytes).items;
    assert.equal(rows.length,meta.count);
    for(const r of rows){
      assert.equal(all.has(r.itemId),false);all.set(r.itemId,r);
      assert.equal(r.collectionMembershipVerified,false);
      assert.equal(r.worldMembershipVerified,false);
      assert.equal(r.availabilityVerified,false);
    }
  }
  assert.equal(all.size,39067);
  const facets=await master.getCollectionFacets();
  assert.equal(facets.nativeSubtypeItems.length,39067);
  assert.equal(facets.definitionScopeItems.length,39067);
  assert.equal(facets.browseItems.length,16176);
  assert.equal(facets.universeTags.length,67);
  assert.equal(facets.worldSourceTagItems.length,11275);
  assert(facets.universeTags.every(x=>Object.values(x.names).every(n=>typeof n==='string'&&n.length>0)));
  assert.equal(facets.craftingRecipeResultItems.length,1294);
  assert.equal(facets.craftingRecipeResultItems.reduce((n,r)=>n+r[1].length,0),1318);
  assert(facets.universeTags.some(r=>r.key==='NonIP'&&r.tagId===2000500017));
  const relations=await master.getSourceRelations();
  assert.equal(relations.collectionMenus.length,305);
  assert.equal(relations.collectionSelectors.length,262);
  assert.equal(relations.gameRuntimeMembershipVerified,false);
  const names=await master.getBrowseNames('ja');
  assert(names.length>10000);
  assert.equal(new Set(names.map(r=>r[0])).size,names.length);
  assert(requests.some(u=>u.endsWith('/locale/ja.json')));
  assert(!requests.some(u=>u.endsWith('/locale/en.json')));
  const sample=[2130000001,200000001,100000010,20300002,130000387,30000031];
  const fromReader=await master.getItems(sample);
  assert.deepEqual(fromReader,sample.map(id=>all.get(id)));
  assert.equal(fromReader[0].nativeCategory,'Condition');
  assert.equal(fromReader[0].iconGuid,null);
  assert.equal(fromReader[0].definitionScope,'other_definition');
  assert.equal(fromReader[1].nativeCategory,'Story');
  assert.equal(fromReader[2].nativeCategory,'TouchOfMagic');
  assert.deepEqual(fromReader[2].universeSetTagIds,[2000500001]);
  assert.deepEqual(fromReader[3].universeTagIds,[2000500017]);
  assert(fromReader[4].collectionExclusions.some(x=>x.setId===2120000349&&x.criterion===2001300012));
  assert(fromReader[4].artwork.maskGuid);
  assert(fromReader[5].craftingRecipeItemIds.includes(2050300095));
  assert(fromReader[5].collectionExclusions.some(x=>x.sourceRecipeItemId===2050300095));
  assert(Object.isFrozen(fromReader[5].collectionExclusions));
  assert(Object.isFrozen(fromReader[0].observedFields[0]));
  assert.equal(await master.getItem(99999999),null);
});

test('complete details use the existing DB-02 joins even for source-only IDs',async()=>{
  const {fetcher}=site();
  const details=await openPublicItemDetails('/Wand',fetcher);
  const item=await details.getCompleteItem(2130000001);
  assert.equal(item.definition.nativeCategory,'Condition');
  assert.equal(item.definition.iconGuid,null);
  assert.equal(Number(item.sourceRelations.itemId),item.itemId);
  assert.equal(Number(item.acquisition.itemId),item.itemId);
  assert.equal(item.currentAvailabilityVerified,false);
  const results=await details.getCompleteItems([30000031,99999999]);
  assert.equal(results[0].itemId,30000031);assert.equal(results[1],null);
});

test('complete source shard and browse asset digest mismatches fail closed',async()=>{
  const {fetcher}=site();
  const tamper=async url=>{
    const res=await fetcher(url);
    if(!url.endsWith('/collection-facets.json')&&!url.includes('/id/'))return res;
    const bytes=new Uint8Array(await res.arrayBuffer());
    bytes[0]^=1;
    return new Response(bytes);
  };
  const m=await openPublicItemMaster('/Wand',tamper,{scope:'complete'});
  await assert.rejects(m.getCollectionFacets(),/SHA_MISMATCH/);
  await assert.rejects(m.getItem(2130000001),/SHA_MISMATCH/);
});


test('canonical fields support selective access, sparse values and reverse lookup without row shards',async()=>{
  const {fetcher,requests}=site();
  const m=await openPublicItemMaster('/Wand',fetcher,{scope:'complete'});
  const catalog=await m.getFieldCatalog();
  assert(catalog.some(x=>x.field==='source.GridAreaData'));
  assert(catalog.some(x=>x.field==='source.Ingredients'));
  assert(catalog.some(x=>x.field==='source.Description'));
  assert.equal(catalog.find(x=>x.field==='itemId').count,m.release.count);
  const fields=['names.ja','iconGuid','source.GridAreaData'];
  const values=await m.getItemFields([40005160,2130000001,99999999,40005160],fields);
  assert.equal(values[0].values['names.ja'],'ガラスの靴');
  assert.equal(values[0].values.iconGuid,'ee85e95b0e61be642af03833a4942ae7');
  assert.equal(values[0].values['source.GridAreaData'].SizeX,1);
  assert.equal(values[1].values.iconGuid,null);
  assert(!Object.hasOwn(values[1].values,'source.GridAreaData'));
  assert.equal(values[2],null);
  assert.equal(values[3],values[0]);
  assert(Object.isFrozen(values[0].values));
  assert(Object.isFrozen(values[0].values['source.GridAreaData']));
  assert(!requests.some(x=>x.includes('/id/')||x.includes('/names.en/')||
    x.includes('/source.Ingredients/')||x.includes('/text/')));
  const grids=await m.findItemIdsByField('source.GridAreaData',{kind:'present'});
  assert.equal(grids.length,11325);
  const furniture=await m.findItemIdsByField('nativeCategory',{kind:'equals',value:'Furniture'});
  assert(furniture.includes(40005160));
  const universe=await m.findItemIdsByField('universeTagIds',{kind:'contains',value:2000500017});
  assert(universe.includes(20300002));
  const missing=await m.getItemFields([2130000001],[]);
  assert.equal(missing[0].itemId,2130000001);
  assert.deepEqual(Object.keys(missing[0].values),[]);
  await assert.rejects(m.getFieldRows('unknownField'),/UNKNOWN_FIELD/);
  await assert.rejects(m.getFieldRows('../index'),/INVALID_NAME/);
  assert(!requests.some(x=>x.includes('/id/')));
});

test('field columns equal canonical values for source fields, localized names and IDs',async()=>{
  const {fetcher}=site();
  const m=await openPublicItemMaster('/Wand',fetcher,{scope:'complete'});
  const all=await m.getFieldRows('itemId');
  assert.equal(all.length,m.release.count);
  const ids=[2050300095,40005160,30000031,130000387,2130000001];
  const rows=await m.getItems(ids);
  const fields=['names.en','nativeCategory','artwork.maskGuid','source.Ingredients',
    'source.Description','source.GridAreaData','universeTagIds','sourceFrame','observedFields'];
  const projections=await m.getItemFields(ids,fields);
  for(let i=0;i<ids.length;i++){
    const expected=rows[i],values=projections[i].values;
    for(const field of fields){
      const [group,key]=field.split('.');
      const value=group==='source'?(expected.sourceAttributes?.[key]??expected.nativeProperties[key]):
        key?expected[group]?.[key]:expected[group];
      assert.equal(Object.hasOwn(values,field),value!==undefined,field);
      if(value!==undefined)assert.deepEqual(values[field],value,field);
    }
  }
});

test('field column integrity failure rejects and retries without falling back to full rows',async()=>{
  const {fetcher,requests}=site();
  let failed=false;
  const tamper=async url=>{
    const response=await fetcher(url);
    if(failed||!url.includes('/fields/names.ja/'))return response;
    failed=true;
    const bytes=new Uint8Array(await response.arrayBuffer());
    bytes[0]^=1;
    return new Response(bytes);
  };
  const m=await openPublicItemMaster('/Wand',tamper,{scope:'complete'});
  await assert.rejects(m.getItemFields([40005160],['names.ja']),/SHA_MISMATCH/);
  assert.equal((await m.getItemFields([40005160],['names.ja']))[0].values['names.ja'],'ガラスの靴');
  assert(!requests.some(x=>x.includes('/id/')));
});


test('selective DB-01 fields and DB-02 links are independently lazy and preserve missing definitions',async()=>{
  const {fetcher,requests}=site();
  const db=await openPublicItemDetails('/Wand',fetcher);
  const ids=[40005160,2130000001,99999999,40005160];
  const fields=['names.ja','iconGuid','nativeCategory'];
  const initial=await db.getSelectedItems(ids,fields);
  assert.equal(initial[0].values['names.ja'],'ガラスの靴');
  assert.equal(initial[1].values.nativeCategory,'Condition');
  assert.equal(initial[1].values.iconGuid,null);
  assert.equal(initial[2],null);
  assert.deepEqual(initial[0],initial[3]);
  assert(!Object.hasOwn(initial[0],'acquisition'));
  assert(!Object.hasOwn(initial[0],'sourceRelations'));
  assert(!requests.some(url=>url.includes('/acquisition/')));
  const onlySources=await db.getSelectedItems(ids,fields,{sourceRelations:true});
  assert.equal(onlySources[0].sourceRelations.itemId,'40005160');
  assert(!Object.hasOwn(onlySources[0],'acquisition'));
  assert(!requests.some(url=>url.includes('db01-item-acquisition-')));
  const onlyAcquisition=await db.getSelectedItems(ids,fields,{acquisition:true});
  assert.equal(onlyAcquisition[0].acquisition.itemId,'40005160');
  assert(!Object.hasOwn(onlyAcquisition[0],'sourceRelations'));
  const both=await db.getSelectedItems(ids,fields,{sourceRelations:true,acquisition:true});
  assert.deepEqual(both[0].sourceRelations.categories,both[0].acquisition.categories);
  assert.equal(both[0].currentAvailabilityVerified,false);
  assert.equal(both[2],null);
  assert(Object.isFrozen(both)&&Object.isFrozen(both[0])&&Object.isFrozen(both[0].values));
  assert.equal(requests.filter(url=>url.includes('db01-item-acquisition-')).length,1);
  assert.equal(requests.filter(url=>url.includes('db01-item-source-relations-')).length,1);
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/fields/names.en/')));
  const fresh=site();
  const freshDb=await openPublicItemDetails('/Wand',fresh.fetcher);
  assert.deepEqual(await freshDb.getSelectedItems([99999999],fields,{sourceRelations:true,acquisition:true}),[null]);
  assert(!fresh.requests.some(url=>url.includes('/acquisition/')));
});


test('DB-01 media join is version isolated and uses only SRC-04 published Item ID mapping',async()=>{
  const local=site(),master=await openPublicItemMaster('/Wand',local.fetcher,{scope:'complete'});
  const before=local.requests.length;
  const fail=async()=>{throw Error('unexpected media request')};
  const unpublished=createPublicItemMediaReader(master,undefined,fail);
  assert.equal(unpublished.status,'unpublished');
  assert.deepEqual(await unpublished.getItemImages([40005160,99999999]),[null,null]);
  const origin='https://media.dreamwishwand.com',sha='a'.repeat(64);
  const pack=value=>{const bytes=Buffer.from(JSON.stringify(value));return {bytes,pin:{sha256:digest(bytes),bytes:bytes.length}}};
  const files={},data=new Map();
  const itemId=40005160;
  const bucket=(itemId%256).toString(16).padStart(2,'0');
  for(let i=0;i<256;i++){
    const key=i.toString(16).padStart(2,'0'),path='id/'+key+'.json';
    const items=key===bucket?[{id:itemId,original:{key:publicImageKey('original',sha),width:256,height:128},
      thumbnail:{key:publicImageKey('thumbnail',sha),width:128,height:64}}]:[];
    const p=pack({schema:'wand.media.distribution-shard@1',bucket:key,items});
    files[path]={...p.pin,count:items.length};data.set(path,p.bytes);
  }
  const manifest=pack({schema:'wand.media.distribution@1',gameVersion:'steam-1.26.2',releaseState:'published',
    bucketCount:256,totalItems:1,files,cachePolicy:'immutable_content_addressed_media'});
  data.set('manifest.json',manifest.bytes);
  const config={state:'published',publicationAuthorized:true,publicReadbackVerified:true,
    origin,gameVersion:'steam-1.26.2',manifest:manifest.pin};
  const mismatch=createPublicItemMediaReader(master,{...config,gameVersion:'steam-1.26.3'},fail);
  assert.equal(mismatch.status,'version_mismatch');
  assert.deepEqual(await mismatch.getItemImages([itemId]),[null]);
  assert.equal(local.requests.length,before,'inactive media must not load DB fields');
  const root=origin+'/index/items/'+config.gameVersion+'/'+config.manifest.sha256+'/';
  const calls=[];
  const media=createPublicItemMediaReader(master,config,async url=>{
    calls.push(url);assert(url.startsWith(root));return new Response(data.get(url.slice(root.length)));
  });
  assert.equal(media.status,'published');
  const rows=await media.getItemImages([itemId,2130000001,99999999,itemId]);
  assert.equal(rows[0].sha256,sha);
  assert.equal(rows[1],null);assert.equal(rows[2],null);assert.equal(rows[3],rows[0]);
  assert.equal((await media.getItemImage(itemId,'original')).width,256);
  assert.equal(calls.length,2);
  assert(Object.isFrozen(rows));
  assert(!local.requests.some(url=>url.includes('/id/')||url.includes('/locale/')));
  await assert.rejects(media.getItemImages([0]),/INVALID_IDS/);
});


test('normal product reads the complete current database without a game version argument',async()=>{
  const {fetcher,requests}=site();
  const current=await openCurrentItemDatabase('/Wand',fetcher);
  assert.equal(current.release.count,39067);
  assert.equal(current.release.scope,'complete');
  assert(requests[0].endsWith('/item-master-releases.json'));
  assert(requests[1].endsWith('/item-master/current/index.json'));
  const rows=await current.getItemFields([40005160,2130000001],['nativeCategory','names.en']);
  assert.equal(rows[0].values['names.en'],'Glass Shoe');
  assert.equal(rows[1].values.nativeCategory,'Condition');
  assert(requests.slice(2).every(url=>/\/item-master\/objects\/[a-f0-9]{64}\.json$/.test(url)));
  assert.equal((await current.getItem(40005160)).names.en,'Glass Shoe');
  assert(requests.slice(2).every(url=>/\/item-master\/objects\/[a-f0-9]{64}\.json$/.test(url)));
  assert(!requests.some(url=>url.includes('/id/')));
});


test('canonical acquisition projections reproduce all admitted source records and preserve source-only coverage',async()=>{
  const {fetcher,requests}=site();
  const master=await openCurrentItemDatabase('/Wand',fetcher);
  const a=await readFile('static/acquisition/public/db01-item-acquisition-1.26.2.json');
  const b=await readFile('static/acquisition/public/db01-item-source-relations-1.26.2.json');
  const original=parseDb01ItemAcquisition(JSON.parse(a));
  const links=parseDb01ItemSourceRelations(JSON.parse(b));
  const meta=master.release.acquisitionProjection;
  assert.equal(meta.sourceGameVersion,master.release.target.gameVersion);
  assert.equal(meta.summarySha256,digest(a));
  assert.equal(meta.relationsSha256,digest(b));
  assert.equal(meta.coverageComplete,false);
  const ids=new Set((await master.getFieldRows('itemId')).map(x=>x[0]));
  const sourceSummaries=original.listItemIds().map(Number);
  const sourceLinks=links.listItemIds().map(Number);
  const summaries=await master.getFieldRows('acquisition.summary');
  const relations=await master.getFieldRows('acquisition.sourceRelations');
  assert.deepEqual(summaries.map(x=>x[0]),sourceSummaries.filter(i=>ids.has(i)));
  assert.deepEqual(relations.map(x=>x[0]),sourceLinks.filter(i=>ids.has(i)));
  assert.equal(meta.summaryCount,summaries.length);
  assert.equal(meta.relationCount,relations.length);
  assert.equal(meta.sourceOnlySummaryCount,sourceSummaries.length-summaries.length);
  assert.equal(meta.sourceOnlyRelationCount,sourceLinks.length-relations.length);
  assert.equal(meta.sourceLinks,15444);
  for(const [i,v] of summaries)assert.deepEqual(v,original.getItem(i));
  for(const [i,v] of relations)assert.deepEqual(v,links.getItem(i));
  for(const category of original.categoryOrder){
    const expected=original.listItemIds(category).map(Number).filter(i=>ids.has(i));
    assert.deepEqual(await master.findItemIdsByField('acquisition.categories',{kind:'contains',value:category}),expected);
  }
  assert(!requests.some(url=>url.includes('/acquisition/public/')));
});

test('current selected details use narrow same-revision acquisition columns, not whole legacy handoffs',async()=>{
  const {fetcher,requests}=site();
  const db=await openCurrentItemDetails('/Wand',fetcher);
  const manifest=JSON.parse(await readFile('static/ddv/item-master/current/index.json'));
  const object=path=>'/Wand/ddv/item-master/objects/'+manifest.assets[path].sha256+'.json';
  const fieldObjects=field=>Object.keys(manifest.assets)
    .filter(p=>p.startsWith('fields/'+field+'/')).map(object);
  const summaryObjects=fieldObjects('acquisition.summary');
  const relationObjects=fieldObjects('acquisition.sourceRelations');
  assert(summaryObjects.length>1&&relationObjects.length>1);
  const ids=[30000031,31700021,99999999,30000031];
  const fields=['nativeCategory'];
  const initial=await db.getSelectedItems(ids,fields);
  assert.equal(initial[0].values.nativeCategory,'ActivityItem');
  assert(!requests.some(u=>summaryObjects.includes(u)||relationObjects.includes(u)));
  const only=await db.getSelectedItems([ids[0]],fields,{acquisition:true});
  assert.equal(only[0].acquisition.itemId,String(ids[0]));
  assert(only[0].acquisition.categories.includes('ordinary_gameplay'));
  assert.equal(only[0].acquisitionStatus,'current');
  assert(!requests.some(u=>relationObjects.includes(u)));
  assert(requests.filter(u=>summaryObjects.includes(u)).length<summaryObjects.length);
  const both=await db.getSelectedItems(ids,fields,{acquisition:true,sourceRelations:true});
  assert(both[0].sourceRelations.links.some(l=>l.sourceId==='2050300095'&&l.role==='crafting_result'));
  assert(both[1].sourceRelations.links.some(l=>l.sourceId==='2050300095'&&l.role==='recipe_ingredient_item'));
  assert.equal(both[2],null);
  assert.deepEqual(both[0],both[3]);
  assert.deepEqual(both[0].sourceRelations.categories,both[0].acquisition.categories);
  assert(!requests.some(u=>u.includes('/acquisition/public/')));
  assert(requests.filter(u=>relationObjects.includes(u)).length<relationObjects.length);
});


test('stall character associations are source-backed and only named families supply browse universe fallbacks',async()=>{
  const {fetcher}=site();
  const master=await openCurrentItemDatabase('/Wand',fetcher);
  const staff=await master.getFieldRows('building.stallEmployeeItemIds');
  const unlock=await master.getFieldRows('building.stallUnlockWithItemId');
  const related=await master.getFieldRows('building.characterAssociations');
  assert.equal(staff.length,90);
  assert.equal(staff.filter(([,v])=>v.some(i=>i>0)).length,56);
  assert.equal(unlock.filter(([,v])=>v!==null).length,5);
  assert.equal(related.length,58);
  const ids=[20100031,20100056,20100057,20100069,20100075,20100103];
  const fields=['universeTagIds','browse.universeTagIds','browse.universeAssociation',
    'building.stallEmployeeItemIds','building.stallUnlockWithItemId','building.characterAssociations'];
  const rows=await master.getItemFields([...ids,20100000,20100045,20100086,20100013,20100003],fields);
  const catalog=JSON.parse(await readFile(join(root,'explore.json'),'utf8'));
  const byId=new Map(catalog.items.map(i=>[i.itemId,i]));
  for(const row of rows.slice(0,6)){
    assert.deepEqual(row.values['building.stallEmployeeItemIds'],[10000115]);
    assert.deepEqual(row.values['building.characterAssociations'],[{characterItemId:10000115,
      employee:true,unlockCondition:false,universeTagIds:[2000500061]}]);
    const original=row.values.universeTagIds;
    const candidate=row.values['browse.universeAssociation'];
    assert.equal(candidate.kind,'named_stall_character_association');
    assert.equal(candidate.universeTagId,2000500061);
    assert.equal(candidate.applied,original.length===0);
    const effective=original.length?original:[2000500061];
    assert.deepEqual(row.values['browse.universeTagIds'],effective);
    assert.deepEqual(byId.get(row.itemId).universes,effective);
    assert.deepEqual((await master.getItem(row.itemId)).universeTagIds,original);
  }
  for(const row of rows.slice(6)){
    assert.equal(row.values['browse.universeAssociation'],undefined);
    assert.deepEqual(byId.get(row.itemId).universes,row.values.universeTagIds);
  }
  assert.deepEqual(rows[6].values['building.stallEmployeeItemIds'],[10000004]);
  assert.deepEqual(rows[7].values['building.characterAssociations'],[{characterItemId:10000130,
    employee:false,unlockCondition:true,universeTagIds:[2000500048]}]);
  assert.deepEqual(rows[9].values['building.stallEmployeeItemIds'],[0]);
  assert.deepEqual(rows[10].values['building.stallEmployeeItemIds'],[]);
  assert.equal(rows[10].values['building.stallUnlockWithItemId'],null);
  const all=(await master.getFieldRows('browse.universeAssociation')).filter(([,a])=>a.kind==='named_stall_character_association');
  assert.equal(all.length,20);
  for(const [id,association] of all)assert.equal(byId.get(id).universeAssociation?.universeTagId,
    association.applied?association.universeTagId:undefined);
});


test('building skins retain exact target selectors separately from browse design associations',async()=>{
  const {fetcher}=site();
  const master=await openCurrentItemDatabase('/Wand',fetcher);
  const selectors=await master.getFieldRows('building.skinTargetSelectors');
  assert.equal(selectors.length,59);
  const [lion,defaultStall,toy,well,defaultWell,beast,minnie,restaurant]=await master.getItemFields(
    [170100006,170100009,170100021,170200010,170200005,170600003,170600005,170200015],
    ['building.skinTargetSelectors','building.skinTargetUniverseTagIds','universeTagIds','browse.universeTagIds','browse.universeAssociation']);
  assert.deepEqual(lion.values['building.skinTargetSelectors'],{targetBuildingItemIds:[],allStallsWithEmployeeItems:true,employeeCharacterItemIds:[10000004]});
  assert.equal(lion.values['browse.universeAssociation'].universeTagId,2000500010);
  assert.equal(lion.values['browse.universeAssociation'].kind,'reviewed_skin_design_motif');
  assert.equal(defaultStall.values['browse.universeAssociation'],undefined);
  assert.equal(toy.values['building.skinTargetSelectors'].targetBuildingItemIds.length,14);
  assert.equal(toy.values['browse.universeAssociation'].universeTagId,2000500006);
  assert.deepEqual(well.values['building.skinTargetSelectors'],{targetBuildingItemIds:[],allWellsItemsExcept:true,excludedBuildingItemIds:[]});
  assert.equal(well.values['browse.universeAssociation'].universeTagId,2000500048);
  assert.equal(defaultWell.values['browse.universeAssociation'],undefined);
  for(const [row,parent,universe] of [[beast,20000016,2000500002],[minnie,20000046,2000500001]]){
    assert.deepEqual(row.values['building.skinTargetSelectors'],{targetBuildingItemIds:[parent]});
    assert.deepEqual(row.values['building.skinTargetUniverseTagIds'],[universe]);
    assert.equal(row.values['browse.universeAssociation'].kind,'house_skin_base_building_association');
    assert.equal(row.values['browse.universeAssociation'].buildingItemId,parent);
    assert.equal(row.values['browse.universeAssociation'].universeTagId,universe);
  }
  assert.equal(restaurant.values['building.skinTargetSelectors'].targetBuildingItemIds.length,5);
  assert.equal(restaurant.values['browse.universeAssociation'],undefined);
  const all=(await master.getFieldRows('browse.universeAssociation')).filter(([,a])=>a.kind!=='named_stall_character_association');
  assert.equal(all.length,27);
  const catalog=JSON.parse(await readFile(join(root,'explore.json'),'utf8'));
  const byId=new Map(catalog.items.map(i=>[i.itemId,i]));
  for(const [id,association] of all){
    const row=await master.getItem(id);
    const expected=row.universeTagIds.length?row.universeTagIds:[association.universeTagId];
    assert.deepEqual(byId.get(id).universes,expected);
    assert.equal(association.applied,row.universeTagIds.length===0);
    assert.equal(byId.get(id).universeAssociation?.universeTagId,association.applied?association.universeTagId:undefined);
  }
});
