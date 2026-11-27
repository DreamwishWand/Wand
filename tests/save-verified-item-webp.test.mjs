import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  saveItemMediaUrl,fetchVerifiedSaveItemWebp,fetchCurrentSaveItemWebp
} from '../src/lib/save/verified-save-item-webp.ts';

const data=new Uint8Array(20);
data.set([82,73,70,70],0);
new DataView(data.buffer).setUint32(4,12,true);
data.set([87,69,66,80,86,80,56,76],8);
const digest=createHash('sha256').update(data).digest('hex');
const path='ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.webp';
const media={path,sha256:digest};
const reply=(bytes=data,mime='image/webp',status=200)=>
  new Response(bytes,{status,headers:{'content-type':mime}});
const fixture=()=>new Uint8Array(data);

test('source-qualified WebP is returned only after checking actual public bytes',async()=>{
  const calls=[];
  const result=await fetchVerifiedSaveItemWebp('/Wand',media,async(url,opts)=>{
    calls.push({url,credentials:opts.credentials});
    return reply();
  });
  assert.equal(Buffer.from(result).toString('hex'),Buffer.from(data).toString('hex'));
  assert.deepEqual(calls,[{url:'/Wand/'+path,credentials:'same-origin'}]);
  assert.equal(saveItemMediaUrl('',media),'/'+path);
});

test('wrong hash, wrong content type, missing bytes or malformed WebP fails closed',async()=>{
  const noHash={...media,sha256:'0'.repeat(64)};
  assert.equal(await fetchVerifiedSaveItemWebp('',noHash,async()=>reply()),null);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>reply(data,'text/html')),null);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>reply(data,'image/webp',404)),null);
  const invalid=fixture();invalid[0]=0;
  const sha=createHash('sha256').update(invalid).digest('hex');
  assert.equal(await fetchVerifiedSaveItemWebp('',{...media,sha256:sha},async()=>reply(invalid)),null);
  const oversized=fixture();
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>new Response(data,{
    headers:{'content-type':'image/webp','content-length':String(4*1024*1024)}
  })),null);
  assert.equal(oversized.length,20);
  assert.equal(await fetchVerifiedSaveItemWebp('',media,async()=>{throw Error('offline');}),null);
});

test('legacy media fetch never follows Item ID paths, traversal or arbitrary external URLs',async()=>{
  for(const invalid of [
    {...media,path:'https://example.com/tracker.webp'},
    {...media,path:'ddv/item-images/../foo.webp'},
    {...media,path:'/ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.webp'},
    {...media,path:'ddv/item-images/steam-1.26.2-source/ab/'+'a'.repeat(64)+'.png'},
    {...media,sha256:'invalid'}
  ]){
    assert.equal(saveItemMediaUrl('/Wand',invalid),null);
    let called=false;
    assert.equal(await fetchVerifiedSaveItemWebp('/Wand',invalid,async()=>{
      called=true;throw Error('must not fetch');
    }),null);
    assert.equal(called,false);
  }
  assert.equal(saveItemMediaUrl('//other',media),null);
  assert.equal(saveItemMediaUrl('/Wand/../x',media),null);
});

const context={itemId:'30000031',match:'current_db00',media:null};
const publicImage={url:'https://media.dreamwishwand.com/images/'+digest+'.webp',sha256:digest,width:128,height:64};
test('current catalog uses shared public hash-addressed thumbnail, without credentials or referrer',async()=>{
  const calls=[];
  const result=await fetchCurrentSaveItemWebp('/Wand',context,'1.26.2',async(url,opts)=>{
    calls.push({url,credentials:opts.credentials,redirect:opts.redirect,referrerPolicy:opts.referrerPolicy});return reply();
  },undefined,async id=>{assert.equal(id,30000031);return publicImage;});
  assert.equal(Buffer.from(result).toString('hex'),Buffer.from(data).toString('hex'));
  assert.deepEqual(calls,[{url:publicImage.url,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}]);
});
test('unknown, unsafe or mismatched catalog IDs never request current media',async()=>{
  for(const [row,version] of [[{...context,match:'not_in_db00_snapshot'},'1.26.2'],[{...context,itemId:'030000031'},'1.26.2'],[context,'1.27.0'],[context,null]]){
    assert.equal(await fetchCurrentSaveItemWebp('',row,version,async()=>{throw Error('network');},undefined,async()=>{throw Error('lookup');}),null);
  }
});
test('invalid public URL, bad bytes, or aborted image does not reach the renderer',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return reply();};
  for(const image of [{...publicImage,url:'https://evil.test/images/'+digest+'.webp'},{...publicImage,width:513}]){
    assert.equal(await fetchCurrentSaveItemWebp('',context,'1.26.2',fetcher,undefined,async()=>image),null);
  }
  assert.equal(calls,0);
  assert.equal(await fetchCurrentSaveItemWebp('',context,'1.26.2',async()=>reply(new Uint8Array(20)),undefined,async()=>publicImage),null);
  const controller=new AbortController();controller.abort();
  assert.equal(await fetchCurrentSaveItemWebp('',context,'1.26.2',fetcher,controller.signal,async()=>publicImage),null);
  assert.equal(calls,0);
});
test('retain previously verified same-release fallback when shared media fails',async()=>{
  const result=await fetchCurrentSaveItemWebp('/Wand',{...context,media},'1.26.2',async(url)=>{
    assert.equal(url,'/Wand/'+path);return reply();
  },undefined,async()=>null);
  assert.equal(Buffer.from(result).toString('hex'),Buffer.from(data).toString('hex'));
});
