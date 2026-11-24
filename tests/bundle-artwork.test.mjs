import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundleArtworkUrl,parseBundleArtwork} from '../src/lib/media/bundle-artwork.ts';
const origin='https://media.dreamwishwand.com';
const artwork={original:{sha256:'a'.repeat(64),width:1200,height:600,bytes:1000},thumbnail:{sha256:'b'.repeat(64),width:512,height:256,bytes:300}};
test('bundle artwork uses thumbnail by default and original only on detail',()=>{
  assert.equal(bundleArtworkUrl(origin,artwork),origin+'/images/'+'b'.repeat(64)+'.webp');
  assert.equal(bundleArtworkUrl(origin,artwork,true),origin+'/images/'+'a'.repeat(64)+'.webp');
});
test('oversized or missing thumbnail never falls back to original',()=>{
  assert.equal(parseBundleArtwork({...artwork,thumbnail:{...artwork.thumbnail,width:513}}),null);
  assert.equal(bundleArtworkUrl(origin,{original:artwork.original}),null);
});
