import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createLootSourceDisplayClient,DB02_LOOT_SOURCE_DISPLAY_SCHEMA
} from '../src/lib/acquisition/loot-source-display.ts';
import {
  nativeLootObjectReferenceIndex,
  DB02_LOOT_OBJECT_REFERENCES_SCHEMA
} from '../src/lib/acquisition/native-loot-object-references.ts';

const RELEASE=new URL(
  '../static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/',
  import.meta.url);
const originals=Array.from({length:14},(_,i)=>JSON.parse(readFileSync(
  new URL('items-'+String(i).padStart(3,'0')+'.json',RELEASE),'utf8')));
const published=new Map(originals.flatMap(x=>x.items).map(x=>[x.id,x]));
const publicSha='496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b';
const privateItemSha='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2';
function catalog(){
  const lookup=raw=>{
    const id=String(raw);
    const item=published.get(id)??null;
    return {
      itemId:id,catalogItem:item,
      catalogClassification:item?'published_db00_item':'outside_published_db00_item_scope'
    };
  };
  return {
    schema:'wand.db02.current-db00-origins@1',gameVersion:'1.26.2',
    source:'verified_public_db00_and_local_private_src02_r5',
    db00:{sourceVersion:'1.26.2',lookup},
    lookup,lootObjectSources:nativeLootObjectReferenceIndex,
    getItemPotentialLootObjects(itemId){
      if(String(itemId)!=='31200000')return [];
      const ref=nativeLootObjectReferenceIndex.getLootTableReferrers('2090000111')[0];
      return [{
        itemId:'31200000',lootOriginId:'native:path:loot:2090000111:0:0',
        lootTableId:'2090000111',nativeNameKey:'Mission!Story!DonaldBag',
        sourceObject:ref,sourceDefinitionRefVerified:true,
        staticLootProvenance:{kind:'verified_game_native'},
        actualDropVerified:false,currentAvailabilityVerified:false
      }];
    }
  };
}
const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
function privateRow(overrides={}){
  const names=Object.fromEntries(locales.map(x=>[x,null]));
  names.en='Private source English';
  names.ja='原本の日本語';
  return {itemId:31400007,nativeCategory:'ActivityItem',
    catalogDomain:'item',sourceSha256:privateItemSha,
    nativeKey:'ActivityItem!DonaldBag',verifiedIconGuid:'guid:'+'a'.repeat(32),
    names,...overrides};
}
function privateCatalog(row=privateRow(),sha=publicSha){
  return {
    source:{
      privateOnly:true,platform:'Steam',gameVersion:'1.26.2',
      nativeSourceManifestSha256:sha,
      sourceItemsSha256:'c'.repeat(64)
    },
    async getItems(ids){return ids.map(x=>x===31400007?row:null);}
  };
}

test('Full real DB-00 v1.26.2 catalog includes all 375 native source object IDs',()=>{
  const index=nativeLootObjectReferenceIndex;
  assert.equal(index.schema,DB02_LOOT_OBJECT_REFERENCES_SCHEMA);
  const references=[
    ...new Set(Array.from({length:0},()=>0))
  ];
  // Iterate actual original definition links, without embedding a second ID list.
  const unique=new Set();
  const families=new Map();
  for(const item of published.values()){
    const linked=index.getObjectLootTableReferences(item.id);
    if(!linked.length)continue;
    unique.add(item.id);
    assert.equal(linked.length,1);
    assert.equal(linked[0].sourceObjectItemId,item.id);
    const expected=linked[0].sourceFamily==='ActivityItem'?
      'Source Activity Items':'Furniture';
    assert.equal(item.category,expected);
    families.set(expected,(families.get(expected)??0)+1);
  }
  assert.equal(unique.size,375);
  assert.deepEqual(Object.fromEntries(families),{
    'Source Activity Items':203,Furniture:172
  });
  const withJapanese=[...unique].filter(id=>published.get(id).names.ja);
  const withEnglish=[...unique].filter(id=>published.get(id).names.en);
  assert.equal(withJapanese.length,114);
  assert.equal(withEnglish.length,114);
  assert.equal([...unique].filter(id=>!Object.values(published.get(id).names).some(Boolean)).length,261);
});

test('Public-only consumer returns correct Japanese source label without invented icon URLs',async()=>{
  const client=createLootSourceDisplayClient(catalog());
  assert.equal(client.schema,DB02_LOOT_SOURCE_DISPLAY_SCHEMA);
  const links=await client.getItemPotentialSourceObjects('31200000');
  assert.equal(links.length,1);
  const card=links[0];
  assert.equal(card.sourceObjectItemId,'31400007');
  assert.equal(card.sourceFamily,'ActivityItem');
  assert.equal(card.nativeCategory,'ActivityItem');
  assert.equal(card.name,'ドナルドの巾着');
  assert.equal(card.nameLocale,'ja');
  assert.equal(card.nameEvidence,'db00_current_verified');
  assert.equal(card.matchedItemId,'31200000');
  assert.equal(card.matchedLootOriginId,'native:path:loot:2090000111:0:0');
  assert.equal(card.verifiedIconGuid,null);
  assert.equal(card.thumbnail,null);
  assert.equal(card.staticLootItemCandidateOnly,true);
  assert.equal(card.sourceDefinitionRefVerified,true);
  assert.equal(card.actualDropVerified,false);
  assert.equal(card.currentAvailabilityVerified,false);
  assert.equal(card.collectionOwnershipVerified,false);
  assert(Object.isFrozen(links));
  assert(Object.isFrozen(card));
  assert.equal((await client.readVerifiedThumbnail(31400007,async()=>new Uint8Array())).valueOf(),null);
});

test('Unlocalized original object retains source Item ID instead of a fabricated name',async()=>{
  const client=createLootSourceDisplayClient(catalog());
  const cards=await client.getLootTableSourceObjects(2090000292,'ja');
  assert.equal(cards.length,1);
  assert.equal(cards[0].sourceObjectItemId,'40600126');
  assert.equal(cards[0].nativeCategory,'Furniture');
  assert.equal(cards[0].name,null);
  assert.equal(cards[0].nameLocale,null);
  assert.equal(cards[0].nameEvidence,'missing');
  assert.equal(cards[0].thumbnail,null);
  assert.equal(cards[0].matchedItemId,null);
  assert.equal((await client.getObjectLootTableSources(31300021,'en'))[0].name,
    'Night Thorn Trapping Pua');
  assert.deepEqual(await client.getLootTableSourceObjects(2090000272),[]);
  assert.deepEqual(await client.getItemPotentialSourceObjects(31400007),[]);
});

test('Private SHA-pinned DB-01 adds current localization, native key and verified icon GUID',async()=>{
  const db01=privateCatalog();
  const client=createLootSourceDisplayClient(catalog(),db01);
  const [card]=await client.getItemPotentialSourceObjects(31200000,'ja');
  assert.equal(card.name,'原本の日本語');
  assert.equal(card.nameEvidence,'db01_current_exact_locdb');
  assert.equal(card.nativeKey,'ActivityItem!DonaldBag');
  assert.equal(card.verifiedIconGuid,'guid:'+'a'.repeat(32));
  assert.equal(card.thumbnail,null);
  assert.equal(client.imagesRequirePrivateVerifiedBytes,true);
});

test('Requested-language DB-00 is preferred over private DB-01 English fallback',async()=>{
  const partial=privateRow({names:Object.fromEntries(
    locales.map(x=>[x,x==='en'?'Only English private':null]))});
  const client=createLootSourceDisplayClient(catalog(),privateCatalog(partial));
  const [card]=await client.getItemPotentialSourceObjects(31200000,'ja');
  assert.equal(card.name,'ドナルドの巾着');
  assert.equal(card.nameLocale,'ja');
  assert.equal(card.nameEvidence,'db00_current_verified');
  assert.equal(card.displayLanguageFallbackUsed,false);
});

test('Private SRC-04 data is an image reference only until the existing verified reader authenticates bytes',async()=>{
  const db01=privateCatalog();
  const image={
    itemId:31400007,iconGuid:'guid:'+'a'.repeat(32),status:'verified',
    image:{thumbnail:{
      path:'images-v2/thumbnail/bb/'+'b'.repeat(64)+'.webp',
      sha256:'b'.repeat(64),bytes:123,width:128,height:96
    }}
  };
  let read=0;
  const media={
    privateOnly:true,publicationAuthorized:false,
    sourceItemsSha256:'c'.repeat(64),
    async getItemIcon(id){return id===31400007?image:null;},
    async readVerifiedImage(icon,kind,loader){
      assert.equal(icon,image);
      assert.equal(kind,'thumbnail');
      assert.equal(typeof loader,'function');
      read++;return new Uint8Array([82,73,70,70]);
    }
  };
  const client=createLootSourceDisplayClient(catalog(),db01,media);
  const [card]=await client.getItemPotentialSourceObjects(31200000,'en');
  assert.equal(card.name,'Private source English');
  assert.equal(card.nameEvidence,'db01_current_exact_locdb');
  assert.equal(card.thumbnail.privatePath,image.image.thumbnail.path);
  assert.equal(card.thumbnail.bytesReadAndVerified,false);
  assert.equal(card.thumbnail.source,'sha_pinned_private_src04_manifest');
  assert.equal(card.thumbnail.sha256,'b'.repeat(64));
  assert.equal(read,0);
  const bytes=await client.readVerifiedThumbnail(31400007,async()=>new Uint8Array());
  assert.equal(bytes.byteLength,4);
  assert.equal(read,1);
  await assert.rejects(client.readVerifiedThumbnail(30000031,async()=>new Uint8Array()),
    /PUBLISHED_DB00_SOURCE_OBJECT_REQUIRED/);
});

test('Reject wrong DB-01 version, SHA chain, source Item ID, category and media index',async()=>{
  assert.throws(()=>createLootSourceDisplayClient(catalog(),privateCatalog(null,'f'.repeat(64))),
    /EXACT_PRIVATE_DB01_REQUIRED/);
  assert.throws(()=>createLootSourceDisplayClient(catalog(),null,{
    privateOnly:true,publicationAuthorized:false,sourceItemsSha256:'c'.repeat(64),
    getItemIcon:async()=>null,readVerifiedImage:async()=>new Uint8Array()
  }),/MATCHING_PRIVATE_SRC04_REQUIRED/);
  const db01=privateCatalog();
  assert.throws(()=>createLootSourceDisplayClient(catalog(),db01,{
    privateOnly:true,publicationAuthorized:false,sourceItemsSha256:'e'.repeat(64),
    getItemIcon:async()=>null,readVerifiedImage:async()=>new Uint8Array()
  }),/MATCHING_PRIVATE_SRC04_REQUIRED/);
  const inconsistent=createLootSourceDisplayClient(
    catalog(),privateCatalog(privateRow({nativeCategory:'Furniture'})));
  await assert.rejects(inconsistent.getItemPotentialSourceObjects(31200000),
    /PRIVATE_DB01_IDENTITY_MISMATCH/);
  const badSha=createLootSourceDisplayClient(
    catalog(),privateCatalog(privateRow({sourceSha256:'9'.repeat(64)})));
  await assert.rejects(badSha.getItemPotentialSourceObjects(31200000),
    /PRIVATE_DB01_IDENTITY_MISMATCH/);
  await assert.rejects(createLootSourceDisplayClient(catalog())
    .getLootTableSourceObjects('2090000111','invalid'),/INVALID_LOCALE/);
});
