import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublishedWorldMapParts} from '../src/lib/media/public-world-map-parts.ts';
import {visibleMapParts} from '../src/lib/media/world-map-parts.ts';
const sha='a'.repeat(64);
const map={id:'MapA',worldCandidate:'valley',width:100,height:100,oceanMissing:true,
  visualReviewRequired:true,worldPlacementVerified:false,
  parts:[[sha,[1,0,0,1,0,0]],[sha,[-1,0,0,1,80,0]]]};
const index={schema:'wand.media.world-map-parts@1',gameVersion:'1.26.2',state:'published',
  canonicalMetadataVerified:true,maps:[map],images:{[sha]:{bytes:50,width:20,height:30}}};
test('native published map parts share one canonical original and retain ordered placements',()=>{
  const m=parsePublishedWorldMapParts(index,'1.26.2').maps[0];
  assert.equal(m.parts.length,2);
  assert.equal(m.parts[0].url,'https://media.dreamwishwand.com/images/'+sha+'.webp');
  assert.equal(m.parts[1].url,m.parts[0].url);
  assert.deepEqual(visibleMapParts(m.parts,{x:60,y:0,w:30,h:30}),[m.parts[1]]);
  assert.equal(m.oceanMissing,true);
  assert.equal(m.worldPlacementVerified,false);
});
test('unpublished, mismatched versions, unknown assets and unsupported claims are rejected',()=>{
  for(const doc of [{...index,state:'unpublished'},{...index,canonicalMetadataVerified:false},
    {...index,images:{}},{...index,images:{...index.images,['b'.repeat(64)]:index.images[sha]}},
    {...index,maps:[{...map,worldPlacementVerified:true}]},
    {...index,maps:[{...map,parts:[[sha,[0,0,0,1,0,0]]]}]},
    {...index,maps:[{...map,visualReviewRequired:false}]}])
    assert.throws(()=>parsePublishedWorldMapParts(doc,'1.26.2'));
  assert.throws(()=>parsePublishedWorldMapParts(index,'1.27.0'));
  assert.throws(()=>parsePublishedWorldMapParts(index,'1.26.2','https://example.com'));
});

import {readWorldMapRelease,loadWorldMapRelease} from '../src/lib/media/world-map-release.ts';
test('inactive map release does not resolve artwork and unsupported versions are absent',async()=>{
  assert.equal(readWorldMapRelease({state:'unpublished'},'1.26.2'),null);
  assert.equal(await loadWorldMapRelease('1.27.0'),null);
  assert.throws(()=>readWorldMapRelease({state:'published',canonicalMetadataVerified:false},'1.26.2'));
});
