import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyShopQuestSeeds} from '../src/lib/media/shop-quest-seeds.ts';
const pairs=[[170000014,[2070000927,2070000928,2070000929]],[170000021,[2070000951,2070000952,2070000953]],[170000081,[2070001335]]];
const rows=pairs.flatMap(([Skin,missions])=>missions.map(m=>[m,[{CharacterSkin:{Skin}}]]));
const ids=[...rows.map(r=>r[0]),...Array.from({length:1023},(_,i)=>2000000000+i)];
test('native direct seed census must match every original identity, not only count',()=>{
 assert.deepEqual([...verifyShopQuestSeeds(ids,rows)],[170000014,170000021,170000081]);
 assert.equal(verifyShopQuestSeeds(ids.slice(1),rows),null);
 assert.equal(verifyShopQuestSeeds(ids,rows.slice(1)),null);
 assert.equal(verifyShopQuestSeeds(ids,[...rows,[ids.at(-1),[{CharacterSkin:{Skin:170000099}}]]]),null);
 assert.equal(verifyShopQuestSeeds(ids,rows.map(([m,v],i)=>i===0?[m,[{CharacterSkin:{Skin:170000099}}]]:[m,v])),null);
});
