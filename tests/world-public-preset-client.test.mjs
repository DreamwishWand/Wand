import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicEntry,presetPublicEndpoint,listPublicPresets} from '../src/lib/presets/public-preset-client.ts';
const id='12345678-1234-4234-8234-123456789abc';
const row={workId:id,revisionId:id,artifactId:id,creatorProfileId:id,title:'Garden',creatorName:'Creator',publishedAt:'2026-11-27T00:00:00Z',mediaId:null,receipt:{schemaVersion:2,schema:'wand.preset.scene@1',kind:'scene',gameVersion:'1.26.2',byteSize:123,contentType:'application/gzip',checksumSha256:'a'.repeat(64),distinctObjectTypes:1,totalObjects:2}};
test('public catalog only accepts current receipt and no private format',()=>{
 assert.deepEqual(parsePublicEntry(row),row);
 assert.throws(()=>parsePublicEntry({...row,receipt:{...row.receipt,schema:'wand.preset.native-backup@1'}}));
 assert.throws(()=>parsePublicEntry({...row,receipt:{...row.receipt,byteSize:16_000_001}}));
 assert.equal(presetPublicEndpoint(undefined,'dreamwishwand.github.io'),'https://ptpdoxhrqopvczpclcij.supabase.co');
 assert.equal(presetPublicEndpoint(undefined,'dreamwishwand.com'),null);
 assert.equal(presetPublicEndpoint('http://bad.example','dreamwishwand.com'),null);
});
test('empty public result differs from network failure; duplicate work fails',async()=>{
 const mock=v=>async()=>Response.json(v);
 const origin='https://example.invalid';
 assert.deepEqual(await listPublicPresets(origin,'',null,0,mock({contract:'wand.public-preset-list@2',entries:[],nextOffset:null})),{entries:[],nextOffset:null});
 await assert.rejects(listPublicPresets(origin,'',null,0,mock({contract:'wand.public-preset-list@2',entries:[row,row],nextOffset:null})),/DUPLICATE/);
 await assert.rejects(listPublicPresets(origin,'',null,0,async()=>new Response('',{status:503})));
});
