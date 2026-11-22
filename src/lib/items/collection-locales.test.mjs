import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createDb01OriginalCollectionLocaleClient,
  DB01_ORIGINAL_COLLECTION_LOCALES,
} from './collection-locales.ts';

const SHA='a'.repeat(64);
const LOCALES=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const menus=Array.from({length:305},(_,i)=>({
  setId:2120000000+i,setKey:'SourceSet'+i,
  collectionLabelKey:'CollectionSet.SourceSet'+i+'_CollectionName',
  submenuCode:0,submenu:'Crop',groupCount:1,sortPriority:i,
  gameUiVisibilityVerified:false,
}));
const source={
  source:{gameVersion:'1.26.2',sourceItemsSha256:SHA,
    sourceCollectionSetSha256:SHA,collectionSetDefinitions:305},
  getMenus:async()=>menus,
};
function names(value){
  return Object.fromEntries(LOCALES.map(locale=>[locale,
    value===null?null:locale+': '+value]));
}
function payload(){
  return {
    schema:DB01_ORIGINAL_COLLECTION_LOCALES,
    platform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceItemsSha256:SHA,sourceCollectionSetSha256:SHA,
    sourceMenuArchiveSha256:SHA,sourceMenuManifestSha256:SHA,
    sourceMenuRowsSha256:SHA,
    localeZipSha256:Object.fromEntries(LOCALES.map(k=>[k,SHA])),
    localeMembersSha256:Object.fromEntries(LOCALES.map(k=>[
      k,{'CollectionSet.locbin':SHA,'collection.locbin':SHA},
    ])),
    coverage:{
      collectionSetDefinitions:305,sourceLocalizedSetsAllEight:304,
      originalCollectionTabTitles:21,originalCollectionAreaTitles:7,
      nonDisplaySetIds:[2120000304],
    },
    sets:menus.map((m,i)=>({
      setId:m.setId,setKey:m.setKey,
      collectionLabelKey:m.collectionLabelKey,
      names:names(i===304?null:'Set '+i),
    })),
    tabTitles:Array.from({length:21},(_,i)=>({
      key:'tab_title_'+String(i).padStart(2,'0'),
      names:names('Tab '+i),
    })),
    areaTitles:Array.from({length:7},(_,i)=>({
      key:'area_title_'+String(i).padStart(2,'0'),
      names:names('Area '+i),
    })),
    sourceLabelKeyVerified:true,originalUiTabNameVerified:true,
    originalUiAreaNameVerified:true,
    sourceSubmenuToUiTabMappingVerified:false,
    actualCollectionUiMembershipVerified:false,
    dlcEntitlementVerified:false,
  };
}
function fixture(data=payload(),original=source){
  const body=new TextEncoder().encode(JSON.stringify(data)+'\n');
  const hash=createHash('sha256').update(body).digest('hex');
  let reads=0,menuReads=0;
  return {
    client:createDb01OriginalCollectionLocaleClient({
      menus:{...original,getMenus:async()=>{menuReads++;return original.getMenus();}},
      load:async()=>{reads++;return body;},expectedSha256:hash,
    }),
    get reads(){return reads;},
    get menuReads(){return menuReads;},
    body,hash,
  };
}
test('305 exact source CollectionSet keys give 304 usable labels and one official sentinel',async()=>{
  const f=fixture();
  const ja=await f.client.getSetLabels('ja');
  assert.equal(ja.length,305);
  assert.equal(ja[0].setId,2120000000);
  assert.equal(ja[0].currentExactName,'ja: Set 0');
  assert.equal(ja[0].originalLocDbLabelVerified,true);
  assert.equal(ja[0].gameUiMembershipVerified,false);
  assert.equal(ja[304].currentExactName,null);
  assert.equal(ja[304].originalLocDbLabelVerified,false);
  const english=await f.client.getSetLabels('en');
  assert.equal(english[0].currentExactName,'en: Set 0');
  assert.equal(f.reads,1);
  assert.equal(f.menuReads,1);
  assert.equal(f.client.source.collectionSubmenuToUiTabMappingVerified,false);
  assert.equal(Object.isFrozen(ja),true);
  assert.equal(Object.isFrozen(ja[0]),true);
});
test('21 native game tab titles and seven world-area titles remain separate from submenu codes',async()=>{
  const f=fixture();
  const [tabs,areas]=await Promise.all([
    f.client.getUiTabTitles('ja'),f.client.getUiAreaTitles('ja'),
  ]);
  assert.equal(tabs.length,21);
  assert.equal(areas.length,7);
  assert.equal(tabs[0].displayName,'ja: Tab 0');
  assert.equal(areas[0].displayName,'ja: Area 0');
  assert.equal(tabs[0].sourceExactCurrentLocDbName,true);
  assert.equal(tabs[0].collectionSubmenuMappingVerified,false);
  assert.equal(f.reads,1);
  assert.equal(f.menuReads,1);
});
test('wrong source version and missing independently pinned hash fail without reading',()=>{
  const invalid={
    ...source,source:{...source.source,collectionSetDefinitions:304},
  };
  assert.throws(()=>fixture(payload(),invalid),/ORIGINAL_SOURCE_AND_TRUSTED_RELEASE_SHA_REQUIRED/);
  assert.throws(()=>createDb01OriginalCollectionLocaleClient({
    menus:source,load:async()=>new Uint8Array(),expectedSha256:'not-a-sha',
  }),/ORIGINAL_SOURCE_AND_TRUSTED_RELEASE_SHA_REQUIRED/);
});
test('correct source bytes without correct independent digest are rejected',async()=>{
  const f=fixture();
  const bad=createDb01OriginalCollectionLocaleClient({
    menus:source,load:async()=>f.body,
    expectedSha256:'b'.repeat(64),
  });
  await assert.rejects(bad.getSetLabels('ja'),/INDEPENDENT_OVERLAY_SHA_MISMATCH/);
});
test('re-signed but wrong original Set key and source localization key fail',async()=>{
  const a=payload();a.sets[0].setKey='ForgedSourceSet';
  await assert.rejects(fixture(a).client.getSetLabels('ja'),
    /COLLECTION_SET_LABEL_NOT_IN_ORIGINAL/);
  const b=payload();b.sets[0].collectionLabelKey='CollectionSet.ForgedName';
  await assert.rejects(fixture(b).client.getSetLabels('ja'),
    /COLLECTION_SET_LABEL_NOT_IN_ORIGINAL/);
});
test('missing one official locale, partial sentinel or placeholder is not verified text',async()=>{
  const wrong=payload();delete wrong.sets[0].names.ja;
  await assert.rejects(fixture(wrong).client.getSetLabels('ja'),
    /INVALID_COLLECTION_SET_ROW/);
  const marker=payload();marker.sets[0].names.ja='{DoNotTranslate}Finale';
  await assert.rejects(fixture(marker).client.getSetLabels('ja'),
    /INVALID_COLLECTION_SET_ROW/);
  const partial=payload();partial.sets[304].names.ja='ja: Item';
  await assert.rejects(fixture(partial).client.getSetLabels('ja'),
    /PARTIAL_ORIGINAL_SENTINEL/);
});
test('contradictory native menu census, duplicate IDs or forged tab labels fail closed',async()=>{
  const a=payload();a.sets[1].setId=a.sets[0].setId;
  await assert.rejects(fixture(a).client.getSetLabels('ja'),
    /INVALID_COLLECTION_SET_ROW/);
  const b=payload();b.tabTitles[1].key=b.tabTitles[0].key;
  await assert.rejects(fixture(b).client.getUiTabTitles('ja'),
    /INVALID_CURRENT_UI_LABEL/);
  const different={...source,getMenus:async()=>menus.slice(1)};
  await assert.rejects(fixture(payload(),different).client.getSetLabels('ja'),
    /ORIGINAL_MENU_COUNT/);
});
test('unsupported locale rejects before any private bytes are loaded',async()=>{
  const f=fixture();
  await assert.rejects(f.client.getSetLabels('xx'),/INVALID_LOCALE/);
  await assert.rejects(f.client.getUiTabTitles('xx'),/INVALID_LOCALE/);
  assert.equal(f.reads,0);
});
