import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDb01CollectionNativeUiAxesClient,
  DB01_ORIGINAL_COLLECTION_AREAS,
  DB01_ORIGINAL_COLLECTION_SUBMENUS,
  DB01_COLLECTION_UI_AXES,
  DB01_COLLECTION_UI_IL2CPP_SHA256,
} from './collection-ui-axes.ts';

const SHA='a'.repeat(64);
function fixture(){
  const calls={menus:0,tabs:[],areas:[],sets:[]};
  const used=DB01_ORIGINAL_COLLECTION_SUBMENUS.filter(x=>x.code!==17&&x.code!==19);
  const rows=Array.from({length:305},(_,i)=>{
    const enumRow=used[i%used.length];
    return {
      setId:2120000001+i,setKey:'SourceSet'+i,
      collectionLabelKey:'CollectionSet.SourceSet'+i+'_CollectionName',
      submenuCode:enumRow.code,submenu:enumRow.enumName,
      sortPriority:304-i,groupCount:1,
      directListedItemCount:i%2,dynamicSelectorsUnresolved:1,
      gameUiVisibilityVerified:false,
    };
  });
  const menus={
    source:{
      gameVersion:'1.26.2',sourceItemsSha256:SHA,
      sourceCollectionSetSha256:SHA,
      sourceIl2cppDumpSha256:DB01_COLLECTION_UI_IL2CPP_SHA256,
      collectionSetDefinitions:305,
    },
    getMenus:async()=>{calls.menus++;return rows;},
  };
  const labelRow=(key,locale)=>({
    originalLocDbKey:key,locale,
    displayName:locale+' '+key,
    sourceExactCurrentLocDbName:true,
    collectionSubmenuMappingVerified:false,
  });
  const tabs=[...DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>x.locDbKey),
    'tab_title_critters'];
  const labels={
    source:{
      platform:'Steam',gameVersion:'1.26.2',
      sourceItemsSha256:SHA,sourceCollectionSetSha256:SHA,
      privateOverlaySha256:SHA,privateOnly:true,
      originalGameUiTabLabelsVerified:true,
      originalGameUiAreaLabelsVerified:true,
      collectionSubmenuToUiTabMappingVerified:false,
      actualCollectionUiMembershipVerified:false,
    },
    getSetLabels:async locale=>{
      calls.sets.push(locale);
      return rows.map((menu,i)=>({
        setId:menu.setId,setKey:menu.setKey,
        collectionLabelKey:menu.collectionLabelKey,locale,
        currentExactName:i===304?null:locale+' set '+i,
        originalLocDbLabelVerified:i!==304,
        gameUiMembershipVerified:false,
      }));
    },
    getUiTabTitles:async locale=>{
      calls.tabs.push(locale);
      return tabs.map(key=>labelRow(key,locale));
    },
    getUiAreaTitles:async locale=>{
      calls.areas.push(locale);
      return DB01_ORIGINAL_COLLECTION_AREAS.map(x=>labelRow(x.locDbKey,locale));
    },
  };
  return {menus,labels,calls,rows};
}
test('original 7 CollectionArea enum codes retain 4097 Honeywood and exact current locale labels',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  const result=await client.getAreaOptions('ja');
  assert.deepEqual(result.map(x=>[x.areaCode,x.originalEnumName]),[
    [0,'AllAreas'],[1,'DreamlightValley'],[2,'EternityIsle'],
    [3,'StorybookVale'],[4,'WishblossomRanch'],
    [5,'SeaOfSecrets'],[4097,'Honeywood'],
  ]);
  assert.equal(result[6].originalLocDbKey,'area_title_honeywood');
  assert.equal(result[6].displayName,'ja area_title_honeywood');
  assert.equal(result[6].nativeCollectionAreaEnumVerified,true);
  assert.equal(result[6].collectionAreaTabButtonFieldVerified,true);
  assert.equal(result[6].codeToRuntimeLabelBindingVerified,false);
  assert.equal(result[6].itemWorldAvailabilityVerified,false);
  assert.equal(client.source.sourceIl2cppDumpSha256,
    DB01_COLLECTION_UI_IL2CPP_SHA256);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(f.calls.menus,0);
});
test('20 enum categories distinguish positive source Set count and two zero-Set enum entries',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  const result=await client.getCategoryOptions('ja');
  assert.equal(result.length,20);
  assert.equal(result.find(x=>x.submenuCode===0).originalEnumName,'Crop');
  assert.equal(result.find(x=>x.submenuCode===14).originalLocDbKey,
    'tab_title_lorekeeper_tales');
  assert.equal(result.find(x=>x.submenuCode===17).originalCollectionSetCount,0);
  assert.equal(result.find(x=>x.submenuCode===19).originalCollectionSetCount,0);
  assert.equal(result.filter(x=>x.originalCollectionSetCount>0).length,18);
  assert.equal(result.reduce((a,x)=>a+x.originalCollectionSetCount,0),305);
  assert.equal(result[0].collectionCategoryFilterFieldVerified,true);
  assert.equal(result[0].runtimeCategoryVisibleVerified,false);
  assert.equal(result[0].itemGameUiMembershipVerified,false);
  assert.equal(result[0].codeToRuntimeLabelBindingVerified,false);
  assert.equal(client.contract,DB01_COLLECTION_UI_AXES);
  assert.equal(f.calls.menus,1);
});
test('unmatched Critters locale text is NOT fabricated as a CollectionSubMenu enum',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  const unmatched=await client.getUnmatchedTabLabels('en');
  assert.deepEqual(unmatched.map(x=>[
    x.originalLocDbKey,x.collectionSubMenuEnumAssociation,x.displayName,
  ]),[['tab_title_critters',null,'en tab_title_critters']]);
  assert.equal(unmatched[0].runtimeVisibilityVerified,false);
});
test('locale index caches per language and source menu scan runs once',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  await Promise.all([
    client.getAreaOptions('en'),client.getCategoryOptions('en'),
    client.getUnmatchedTabLabels('en'),
  ]);
  await client.getAreaOptions('ja');
  await client.getCategoryOptions('ja');
  assert.deepEqual(f.calls.tabs.sort(),['en','ja']);
  assert.deepEqual(f.calls.areas.sort(),['en','ja']);
  assert.equal(f.calls.menus,1);
});
test('version, private locale status and independently pinned dump hash required',()=>{
  const f=fixture();
  assert.throws(()=>createDb01CollectionNativeUiAxesClient(
    {...f.menus,source:{...f.menus.source,
      sourceIl2cppDumpSha256:'f'.repeat(64)}},f.labels),
  /PINNED_ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,source:{...f.labels.source,
      actualCollectionUiMembershipVerified:true}}),
  /PINNED_ORIGINAL_SOURCE_REQUIRED/);
  assert.throws(()=>createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,source:{...f.labels.source,
      sourceItemsSha256:'f'.repeat(64)}}),
  /PINNED_ORIGINAL_SOURCE_REQUIRED/);
});
test('malformed original category enum identity fails rather than using an inferred code',async()=>{
  const f=fixture(),rows=f.rows.map((x,i)=>
    i===0?{...x,submenu:'InventedType'}:x);
  const client=createDb01CollectionNativeUiAxesClient(
    {...f.menus,getMenus:async()=>rows},f.labels);
  await assert.rejects(client.getCategoryOptions('ja'),
    /UNKNOWN_OR_MISMATCHED_ORIGINAL_SUBMENU/);
});
test('missing one source tab or forged Critters collision fails closed',async()=>{
  const f=fixture(),rawGet=f.labels.getUiTabTitles;
  const client=createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,getUiTabTitles:async locale=>
      (await rawGet(locale)).filter(x=>x.originalLocDbKey!=='tab_title_critters')});
  await assert.rejects(client.getAreaOptions('ja'),
    /CURRENT_LOCALE_TITLE_CENSUS/);
  const corrupted=createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,getUiTabTitles:async locale=>{
      const rows=await rawGet(locale);
      return rows.map((x,i)=>i===20?
        {...x,originalLocDbKey:'tab_title_another'}:x);
    }});
  await assert.rejects(corrupted.getCategoryOptions('ja'),
    /ORIGINAL_LOCDB_ENUM_NAME_CORRELATION/);
});
test('non-source locale rejected before any private reads',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  await assert.rejects(client.getCategoryOptions('zz'),/INVALID_LOCALE/);
  await assert.rejects(client.getAreaOptions('zz'),/INVALID_LOCALE/);
  assert.equal(f.calls.menus,0);
  assert.equal(f.calls.tabs.length,0);
});

test('source category groups expose original sorted Set IDs and exact locale labels',async()=>{
  const f=fixture();
  const client=createDb01CollectionNativeUiAxesClient(f.menus,f.labels);
  const category=await client.getCategoryOptions('ja');
  const crop=await client.getCategorySourceSets('ja',0);
  assert.equal(crop.length,category.find(x=>x.submenuCode===0).originalCollectionSetCount);
  assert.deepEqual(crop.map(x=>x.setId),[288,270,252,234,216,198,180,162,144,126,108,90,72,54,36,18,0].map(i=>2120000001+i));
  assert.equal(crop[0].originalSetSortPriority,304-288);
  assert.equal(crop[0].currentExactSetName,'ja set 288');
  assert.equal(crop[0].currentOriginalLocDbLabelVerified,true);
  assert.equal(crop[0].sourceGroupCount,1);
  assert.equal(crop[0].nativeCollectionSubMenuAssociationVerified,true);
  assert.equal(crop[0].sourceCategoryIsGameScreenMembershipVerified,false);
  assert.equal(crop[0].nativeCollectionAreaCode,null);
  assert.equal(crop[0].worldAvailabilityVerified,false);
  assert.equal(crop[0].dlcEntitlementVerified,false);
  assert.equal(Object.isFrozen(crop),true);
  assert.equal(Object.isFrozen(crop[0]),true);
  assert.equal(f.calls.menus,1);
});
test('zero-source-set category returns empty and a non-display original label stays null',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  assert.deepEqual(await client.getCategorySourceSets('ja',17),[]);
  assert.deepEqual(await client.getCategorySourceSets('ja',19),[]);
  const puzzles=await client.getCategorySourceSets('ja',18);
  assert.equal(puzzles[0].currentExactSetName,null);
  assert.equal(puzzles[0].currentOriginalLocDbLabelVerified,false);
  assert.equal(puzzles[0].setId,2120000305);
});
test('original source category aliases cannot inherit a different source Set localized name',async()=>{
  const f=fixture(),raw=f.labels.getSetLabels;
  const corrupted=createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,getSetLabels:async locale=>
      (await raw(locale)).map((row,i)=>i===0?
        {...row,setKey:'ForgedSet'}:row)});
  await assert.rejects(corrupted.getCategorySourceSets('ja',0),
    /SOURCE_SET_LOCALE_IDENTITY_MISMATCH/);
});
test('invalid category and unsupported locale never start any private source read',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  await assert.rejects(client.getCategorySourceSets('ja',5),
    /UNKNOWN_ORIGINAL_COLLECTION_SUBMENU_CODE/);
  await assert.rejects(client.getCategorySourceSets('ja',999),
    /UNKNOWN_ORIGINAL_COLLECTION_SUBMENU_CODE/);
  await assert.rejects(client.getCategorySourceSets('xx',0),
    /INVALID_LOCALE/);
  assert.equal(f.calls.menus,0);
  assert.equal(f.calls.sets.length,0);
});
test('native source Set group cardinality mismatch rejects old/unverified area shortcuts',async()=>{
  const f=fixture();
  const corrupted=createDb01CollectionNativeUiAxesClient(
    {...f.menus,getMenus:async()=>f.rows.map((row,i)=>
      i===0?{...row,groupCount:2}:row)},f.labels);
  await assert.rejects(corrupted.getCategorySourceSets('ja',0),
    /UNKNOWN_OR_MISMATCHED_ORIGINAL_SUBMENU/);
});
test('locale source full 305-set census cannot silently contain an unknown duplicated ID',async()=>{
  const f=fixture(),raw=f.labels.getSetLabels;
  const bad=createDb01CollectionNativeUiAxesClient(
    f.menus,{...f.labels,getSetLabels:async locale=>
      (await raw(locale)).map((row,i)=>i===1?
        {...row,setId:2120000001}:row)});
  await assert.rejects(bad.getCategorySourceSets('ja',1),
    /INVALID_OR_DUPLICATE_ORIGINAL_SET_LOCALE/);
});
test('all 305 current original CollectionSets fall under exactly one of 18 source categories',async()=>{
  const f=fixture(),client=createDb01CollectionNativeUiAxesClient(
    f.menus,f.labels);
  const all=await Promise.all(DB01_ORIGINAL_COLLECTION_SUBMENUS.map(x=>
    client.getCategorySourceSets('en',x.code)));
  assert.equal(all.reduce((n,a)=>n+a.length,0),305);
  assert.equal(new Set(all.flatMap(a=>a.map(x=>x.setId))).size,305);
  assert.deepEqual(f.calls.sets,['en']);
  assert.equal(f.calls.menus,1);
});
