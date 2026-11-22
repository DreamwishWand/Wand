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
  const calls={menus:0,tabs:[],areas:[]};
  const used=DB01_ORIGINAL_COLLECTION_SUBMENUS.filter(x=>x.code!==17&&x.code!==19);
  const rows=Array.from({length:305},(_,i)=>{
    const enumRow=used[i%used.length];
    return {
      setId:2120000001+i,setKey:'SourceSet'+i,
      submenuCode:enumRow.code,submenu:enumRow.enumName,
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
