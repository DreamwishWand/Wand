import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublicQuestIndex} from '../src/lib/guide/public-guide.mjs';
import {
  GUIDE_CHARACTER_LABEL_CENSUS,derivePublicGuideCharacters,
  sourceCharacterName,filterPublicGuideCharacters,findPublicCharacterByLink
} from '../src/lib/guide/public-characters.mjs';

const filename=new URL('../static/guide/public/quest-index.json',import.meta.url);
const read=async()=>verifyPublicQuestIndex(JSON.parse(await readFile(filename,'utf8')));

test('current original Steam Guide character dictionary has 142 localized labels and 733 directly linked quests',async()=>{
  const index=await read(),directory=derivePublicGuideCharacters(index);
  assert.deepEqual(directory.counts,GUIDE_CHARACTER_LABEL_CENSUS);
  assert.equal(directory.rows.length,142);
  assert.equal(directory.byId.size,142);
  assert.equal(directory.byId.get('10000049').quests.length,0);
  assert.equal(directory.byId.get('10000050').quests.length,0);
  assert.equal(sourceCharacterName(directory.byId.get('10000049'),'ja'),'フランダー');
  assert.equal(sourceCharacterName(directory.byId.get('10000050'),'en'),'Sebastian');
  assert.equal(directory.byId.get('10000100').internal,true);
  assert.equal(directory.byId.get('10000102').internal,true);
  assert.equal(directory.byId.get('10000138').internal,true);
  for(const row of directory.rows)assert.equal(Object.keys(row.names).length,8);
  assert.equal(directory.rows.flatMap(r=>r.quests).length,733);
  const quests=new Set(directory.rows.flatMap(row=>row.quests.map(q=>q.id)));
  assert.equal(quests.size,733,'each quest must be directly assigned to one source label');
});
test('eight-locale search handles source labels, normalized names, IDs and scoped quest-link filters',async()=>{
  const directory=derivePublicGuideCharacters(await read());
  assert.equal(filterPublicGuideCharacters(directory,{}).total,142);
  assert.equal(filterPublicGuideCharacters(directory,{mode:'withQuests'}).total,86);
  assert.equal(filterPublicGuideCharacters(directory,{mode:'withoutQuests'}).total,56);
  assert.equal(filterPublicGuideCharacters(directory,{query:'セバスチャン'}).total,1);
  assert.equal(filterPublicGuideCharacters(directory,{query:'Sebastian',locale:'ja'}).total,1);
  assert.equal(filterPublicGuideCharacters(directory,{query:'１０００００５０'}).rows[0].id,'10000050');
  assert.equal(filterPublicGuideCharacters(directory,{query:'フランダー',mode:'withQuests'}).total,0);
  assert.equal(filterPublicGuideCharacters(directory,{query:'Flounder',mode:'withoutQuests'}).total,1);
  assert.equal(filterPublicGuideCharacters(directory,{query:'Mickey Mouse',locale:'en'}).rows[0].id,'10000003');
  assert.equal(filterPublicGuideCharacters(directory,{query:'__NO_MATCH__'}).total,0);
  assert.equal(filterPublicGuideCharacters(directory,{limit:20}).rows.length,20);
  assert.equal(filterPublicGuideCharacters(directory,{limit:20,offset:140}).rows.length,2);
  assert.throws(()=>filterPublicGuideCharacters(directory,{locale:'xx'}),/search input/);
  assert.throws(()=>filterPublicGuideCharacters(directory,{mode:'unknown'}),/search input/);
  assert.throws(()=>filterPublicGuideCharacters(directory,{query:'x'.repeat(121)}),/search input/);
});
test('deep links only resolve one exact source label ID; malformed or duplicate IDs never select a record',async()=>{
  const directory=derivePublicGuideCharacters(await read());
  assert.equal(findPublicCharacterByLink(directory,'?character=10000049')?.id,'10000049');
  assert.equal(findPublicCharacterByLink(directory,'?utm_source=guide&character=10000003')?.id,'10000003');
  for(const query of ['?character=999999999','?character=10000049&character=10000003',
    '?character=10000049%20','?character=00010000049','?character=<script>','?quest=2070000620']){
    assert.equal(findPublicCharacterByLink(directory,query),null,query);
  }
  assert.equal(findPublicCharacterByLink(directory,'x'.repeat(2049)),null);
});
test('source label or quest-link tampering fails closed before a directory is displayed',async()=>{
  const index=await read();
  const missing=structuredClone(index);delete missing.characters['10000049'];
  assert.throws(()=>derivePublicGuideCharacters(missing),/source label census/);
  const bogus=structuredClone(index);bogus.characters['10000049'].ja='';
  assert.throws(()=>derivePublicGuideCharacters(bogus),/malformed source label/);
  const missingLang=structuredClone(index);delete missingLang.characters['10000049'].fr;
  assert.throws(()=>derivePublicGuideCharacters(missingLang),/malformed source label/);
  const forged=structuredClone(index);forged.quests[0].characterId='9999999';
  assert.throws(()=>derivePublicGuideCharacters(forged),/unknown source label/);
  assert.equal(sourceCharacterName(null,'ja'),'');
  assert.equal(sourceCharacterName({names:{ja:'A'}},'unknown'),'');
});
