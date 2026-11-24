import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  verifyPublicQuestIndex,filterPublicQuests,publicQuestSection,
  publicQuestStoryArc,publicQuestNativeOrder,publicFriendshipCharacters
} from '../src/lib/guide/public-guide.ts';

const dataUrl=new URL('../static/guide/public/quest-index.json',import.meta.url);
async function catalog(){
  return verifyPublicQuestIndex(JSON.parse(await readFile(dataUrl,'utf8')));
}
test('all 733 native Quests are accounted for without Story/Realm conflation',async()=>{
  const data=await catalog();
  const counts={story:166,realm:61,friendship:341,event:66,daily:9,special:70,premium:19,tutorial:1,other:0};
  for(const [kind,count] of Object.entries(counts)){
    assert.equal(filterPublicQuests(data,{section:kind}).total,count,kind);
  }
  assert.equal(Object.values(counts).reduce((x,y)=>x+y,0),733);
  assert.equal(filterPublicQuests(data,{section:'all'}).total,733);
  assert.equal(publicQuestSection({internalName:'Story!MRQS010_Welcome'}),'story');
  assert.equal(publicQuestSection({internalName:'Realm!WallE!WallE!RLM_WallEIP_Wall_010'}),'realm');
  assert.equal(publicQuestSection({internalName:'Village!Mickey!Goofy!VLG_Goof_010'}),'friendship');
  assert.equal(publicQuestSection({internalName:'Repeatable!Event!Park'}),'event');
  assert.equal(publicQuestSection({internalName:'Repeatable!Ratatouille!Remy'}),'daily');
  assert.equal(publicQuestSection({internalName:'Secret!Mickey!Goofy'}),'special');
  assert.equal(publicQuestSection({internalName:'Premium!LilMermaid!Ursula'}),'premium');
  assert.equal(publicQuestSection({internalName:'FTUE!FTUE_Merl_StarPath_010'}),'tutorial');
  assert.equal(publicQuestSection({internalName:'Unknown!foo'}),'other');
});

test('166 original Story Quests split into source-named Valley, expansion and adventure arcs',async()=>{
  const data=await catalog();
  const arcs={valley:43,rift:30,storybook:29,ranch:20,honeyglow:19,keepsake:25};
  for(const [arc,total] of Object.entries(arcs)){
    const found=filterPublicQuests(data,{section:'story',arc,limit:100});
    assert.equal(found.total,total,arc);
    for(const q of found.rows){
      assert.equal(publicQuestSection(q),'story');
      assert.equal(publicQuestStoryArc(q),arc,q.internalName);
    }
  }
  assert.equal(Object.values(arcs).reduce((a,b)=>a+b,0),166);
  assert.throws(()=>filterPublicQuests(data,{section:'story',arc:'invented'}),/invalid search/);
  assert.equal(publicQuestStoryArc({internalName:'Village!Mickey!Goofy'}),null);
  const valley=filterPublicQuests(data,{section:'story',arc:'valley',limit:100}).rows;
  const numbers=valley.filter(q=>/^Story!MRQS[0-9]{3}/.test(q.internalName))
    .map(publicQuestNativeOrder);
  assert.equal(numbers.length,31);
  assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));
  const intro=valley.slice(0,6).map(q=>q.id);
  assert.deepEqual(intro,[
    '2070000620','2070000718','2070000629','2070000738','2070000622','2070000750'
  ],'original MRQS 010/015/020/025/030/035 series order must not be alphabetical');
});

test('all six Story arcs use source-native main-quest sequence, not Item ID publication order',async()=>{
  const data=await catalog();
  const mainCounts={valley:31,rift:29,storybook:29,ranch:19,honeyglow:19,keepsake:24};
  for(const [arc,count] of Object.entries(mainCounts)){
    const rows=filterPublicQuests(data,{section:'story',arc,limit:100}).rows;
    const mains=rows.filter(q=>publicQuestNativeOrder(q)!==null);
    assert.equal(mains.length,count,arc+' original MRQS count');
    const numbers=mains.map(publicQuestNativeOrder);
    assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b),
      arc+' must sort native MRQS sequence before optional ORQS lines');
    assert(rows.slice(count).every(q=>publicQuestNativeOrder(q)===null),
      arc+' additional ORQS lines stay visibly separate from sequenced main quests');
  }
  // Each pair is source-authenticated. Their Item ID/publication order differs
  // from their original MRQS sequence, which carries the intended browse order.
  for(const [arc,first,second] of [
    ['rift','2070000995','2070000990'],            // E01_100 before E01_110
    ['storybook','2070001164','2070001141'],       // E02_030 before E02_031
    ['ranch','2070001351','2070001363'],           // E03_036 before E03_040
    ['honeyglow','2070001617','2070001474'],       // M01_012 before M01_020
    ['keepsake','2070001610','2070001507']         // E04_000 before E04_010
  ]){
    const ids=filterPublicQuests(data,{section:'story',arc,limit:100})
      .rows.map(q=>q.id);
    assert(ids.indexOf(first)!==-1&&ids.indexOf(second)!==-1,arc);
    assert(ids.indexOf(first)<ids.indexOf(second),
      arc+' original main storyline must not be ordered by numeric Item ID');
  }
  assert.equal(publicQuestNativeOrder({
    id:'2070001507',internalName:'Story!Expansion02!MRQS_E04_010_WrongArc'
  }),null,'a mismatched expansion and mission sequence must not invent an order');
});

test('341 native Village Quests are grouped by exactly 77 original-character IDs',async()=>{
  const data=await catalog();
  const roster=publicFriendshipCharacters(data,'ja');
  assert.equal(roster.length,77);
  assert.equal(roster.reduce((sum,row)=>sum+row.quests,0),341);
  assert.equal(new Set(roster.map(row=>row.id)).size,77);
  assert.deepEqual(roster.map(row=>row.name),[...roster.map(row=>row.name)].sort(
    (a,b)=>a.localeCompare(b,'ja')));
  const goofy=data.quests.find(q=>q.internalName==='Village!Mickey!Goofy!VLG_Goof_010');
  assert(goofy);
  const goofys=filterPublicQuests(data,{
    section:'friendship',character:goofy.characterId,limit:100
  });
  assert.equal(goofys.total,5);
  assert.deepEqual(goofys.rows.map(q=>publicQuestNativeOrder(q)),[10,30,40,50,70]);
  assert(goofys.rows.every(q=>q.characterId===goofy.characterId));
  assert.equal(roster.find(x=>x.id===goofy.characterId).quests,5);
  assert.equal(filterPublicQuests(data,{section:'friendship',character:'invalid'}).total,0,
    'an unknown character never gains a fabricated original Quest');
});

test('unpublished Quest names never become internal Mission identifiers presented as names',async()=>{
  const data=await catalog();
  const unknown=data.quests.filter(row=>!row.names.ja&&!row.names.en);
  assert.equal(unknown.length,26);
  const page=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  assert.match(page,/名称未確認（ID/);
  assert.doesNotMatch(page,/label\(row.names,row.internalName/);
  assert.match(page,/questBrowseGroups\(catalog,section,locale,relatedEventSource\)/);
  assert.match(page,/selectArc\(arc.id\)/);
  assert.match(page,/class:with-character-rail/);
  assert.match(page,/arc:section==='story'&&!query.trim\(\)\?storyArc:'all'/);
});

test('source Special quests must not be called 70 hidden Quests or 341 complete character quest lines',async()=>{
 const data=await catalog();
 const extra=filterPublicQuests(data,{section:'special',limit:100});
 assert.equal(extra.total,70);
 assert(extra.rows.some(q=>q.internalName.startsWith('Secret!Mickey!Donald!')),
   'original character follow-ups are included in Secret and cannot all be called hidden');
 const premium=filterPublicQuests(data,{section:'premium'});
 assert.equal(premium.total,19);
 assert(premium.rows.every(q=>q.internalName.startsWith('Premium!')));
 assert.equal(filterPublicQuests(data,{section:'tutorial'}).total,1);
 assert.equal(filterPublicQuests(data,{section:'other'}).total,0);
});

test('Steam 1.26.2 Quest Log Japanese labels are exact native localization strings',async()=>{
  const page=await readFile(new URL('../src/routes/guide/quests/+page.svelte',import.meta.url),'utf8');
  const official=page.split('<nav class="quest-sections" aria-label="ゲーム内のクエスト分類">')[1]
    ?.split('</nav>')[0];
  assert(official,'localized Quest Log category navigation must exist');
  // Verified from raw Steam v1.26.2 LocDB_ja.zip/menu.locbin:
  // SHA-256 c334dd9d1b6f896ac784c33b28d1103b8de8cf5cdfd0b5f8ce4ebd7b917ff5bb
  const nativeLabels={
    story:'ストーリークエスト',realm:'世界クエスト',
    friendship:'友情クエスト',event:'イベントクエスト',
    daily:'デイリークエスト',premium:'ドリームパッククエスト'
  };
  for(const [kind,name] of Object.entries(nativeLabels))
    assert(official.includes("['"+kind+"','"+name+"']"),kind+': expected exact original Japanese label');
  for(const wrong of ['王国','レルム','フレンドシップ','ドリームバンドル'])
    assert(!official.includes("'"+wrong+"'"),wrong+' is not the raw in-game Japanese Quest Log category');
  assert(!official.includes("['special'")&&!official.includes("['tutorial'"),
    'Secret/FTUE must not be represented as an original in-game Quest Log category');
  assert(page.includes('<summary>分類確認中のクエスト</summary>'),
    'unverified source-native groups remain accessible and clearly marked');
});
