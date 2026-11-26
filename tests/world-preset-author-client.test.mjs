import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicationDraft,publishPreset,retirePreset} from '../src/lib/presets/preset-author-client.ts';
const id='12345678-1234-4234-8234-123456789abc';
const draft={title:'Garden',description:'',creatorProfileId:id,mediaIds:[id],ownWorkConfirmed:true,idempotencyKey:id};
test('publication requires explicit rights acknowledgement and owner image selections',()=>{
 assert.doesNotThrow(()=>assertPublicationDraft(draft));
 for(const change of [{ownWorkConfirmed:false},{mediaIds:[]},{mediaIds:[id,id]},{title:' '},{creatorProfileId:'bad'}])assert.throws(()=>assertPublicationDraft({...draft,...change}),/PRESET_DRAFT/);
});
test('private and imported presets never enter a publication network request',async()=>{
 let calls=0;const t={origin:'https://example.invalid',accessToken:async()=>{calls++;return 'token';},fetcher:async()=>{calls++;throw Error('network')}};
 for(const change of [{privateBackup:true},{domain:'tom'},{domain:'game'},{publicSource:{workId:id}}])await assert.rejects(publishPreset(t,{domain:'wand',privateBackup:false,...change},draft,''),/PRESET_NOT_OWN_WORK/);
 assert.equal(calls,0);
});
test('lifecycle uses verified account token and stable caller idempotency key',async()=>{
 let body;
 const t={origin:'https://example.invalid',accessToken:async()=> 'token',fetcher:async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer token');body=JSON.parse(opts.body);return Response.json({contract:'wand.preset-lifecycle@2',publication:{lifecycleState:'unpublished'}});}};
 assert.deepEqual(await retirePreset(t,'unpublish',id,id),{lifecycleState:'unpublished'});
 assert.deepEqual(body,{action:'unpublish',presetArtifactId:id,idempotencyKey:id});
});
