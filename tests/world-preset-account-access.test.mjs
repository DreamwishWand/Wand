import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {wandAccountAccess,registerWandAccountAccess,clearWandAccountAccess} from '../src/lib/ui/wand-account-access.ts';
test('community services share one revocable access provider without storing tokens',async()=>{
 const release=registerWandAccountAccess({origin:'https://example.invalid',accessToken:async()=> 'token'});
 const access=get(wandAccountAccess);assert.equal(await access.accessToken(),'token');
 const replacement=registerWandAccountAccess({origin:'https://example.invalid',accessToken:async()=> 'new'});
 release();assert.equal(await get(wandAccountAccess).accessToken(),'new');
 await assert.rejects(access.accessToken(),/SESSION_CHANGED/);replacement();assert.equal(get(wandAccountAccess),null);clearWandAccountAccess();
});
