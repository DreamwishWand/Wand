import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSharedMediaClient,parseSharedMediaIndex,sharedMediaUrl} from '../src/lib/media/shared-media.ts';
const image={kind:'Sprite',sha256:'a'.repeat(64),width:1024,height:512,bytes:1234};
const document={schema:'wand.shared-media-index@1',gameVersion:'1.26.2',group:'maps',entries:{'bg_map_test':[image]}};
const payload=Buffer.from(JSON.stringify(document));
const sha=createHash('sha256').update(payload).digest('hex');
const config={state:'published',publicationAuthorized:true,publicReadbackVerified:true,gameVersion:'1.26.2',origin:'https://media.dreamwishwand.com/',groups:{maps:{file:'maps-'+sha.slice(0,16)+'.json',sha256:sha,bytes:payload.length,nameCount:1}}};
test('unpublished mode never fetches',async()=>{
  const c=createSharedMediaClient(undefined,()=>{throw Error('unexpected network');});
  assert.equal(await c.unique('ui','icon_collection'),null);
});
test('published media loads only the requested group and shares cached index',async()=>{
  let calls=0;
  const c=createSharedMediaClient(config,async url=>{
    calls++;assert.match(url,/\/media\/shared\/index\/1\.26\.2\/maps-/);
    return new Response(payload);
  });
  assert.equal((await c.unique('maps','bg_map_test')).url,sharedMediaUrl(config.origin,image));
  assert.equal(sharedMediaUrl(config.origin,image),'https://media.dreamwishwand.com/original/aa/'+image.sha256+'.webp');
  assert.deepEqual(await c.names('maps','bg_map'),['bg_map_test']);
  assert.equal(await c.unique('ui','bg_map_test'),null);
  assert.equal(calls,1);
});
test('invalid public origin and candidate activation rejected',()=>{
  assert.throws(()=>createSharedMediaClient({...config,origin:'https://example.com/'}),/origin/);
  assert.throws(()=>createSharedMediaClient({...config,state:'candidate'}),/activation/);
});
test('tampered index, source metadata and duplicate identity rejected',async()=>{
  const c=createSharedMediaClient(config,async()=>new Response(Buffer.alloc(payload.length)));
  await assert.rejects(c.unique('maps','bg_map_test'),/SHA-256/);
  assert.throws(()=>parseSharedMediaIndex({...document,sourcePath:'private'},'maps','1.26.2',1),/identity/);
  assert.throws(()=>parseSharedMediaIndex({...document,entries:{a:[image,image]}},'maps','1.26.2',1),/duplicate/);
});
test('same-name different pixels are not silently selected',async()=>{
  const d={...document,entries:{bg_map_test:[image,{...image,sha256:'b'.repeat(64)}]}};
  const b=Buffer.from(JSON.stringify(d)), h=createHash('sha256').update(b).digest('hex');
  const c=createSharedMediaClient({...config,groups:{maps:{file:'maps-'+h.slice(0,16)+'.json',sha256:h,bytes:b.length,nameCount:1}}},async()=>new Response(b));
  assert.equal(await c.unique('maps','bg_map_test'),null);
  assert.equal((await c.find('maps','bg_map_test')).length,2);
});
