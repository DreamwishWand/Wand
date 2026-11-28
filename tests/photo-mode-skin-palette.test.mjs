import test from 'node:test';
import assert from 'node:assert/strict';
import {validSkinPalette,savedSkinIndex,skinTextureFor} from '../src/lib/photo-mode/skin-palette.ts';
const palette=Array.from({length:30},(_,i)=>Object.fromEntries(['male','female'].map((b,j)=>[b,Object.fromEntries(['body','face'].map((r,k)=>[r,{texture:{sha256:(i*4+j*2+k).toString(16).padStart(64,'0'),bytes:100},format:i===1?'png':'webp'}]))])));
test('native indices are direct, branch-specific and bounded',()=>{
 const save={avatars:{male:{SkinColorIndex:0},female:{SkinColorIndex:29},maleMermaid:{SkinColorIndex:17}}};
 assert.equal(savedSkinIndex(save,'male',false),0);assert.equal(savedSkinIndex(save,'female',false),29);assert.equal(savedSkinIndex(save,'male',true),17);assert.equal(savedSkinIndex(save,'female',true),undefined);
 assert.equal(savedSkinIndex({avatars:{male:{SkinColorIndex:30}}},'male',false),undefined);
 assert.equal(savedSkinIndex(undefined,'male',false),undefined);
 assert.equal(skinTextureFor(palette,17,'male','mermaidBody'),palette[17].male.body);
 assert.equal(skinTextureFor(palette,0,'male','face'),palette[0].male.face);
 assert.equal(skinTextureFor(palette,1,'female','eyes'),undefined);assert.equal(skinTextureFor(palette,-1,'male','body'),undefined);
});
test('requires all thirty native options and unique original assets',()=>{
 assert.ok(validSkinPalette(palette));assert.equal(validSkinPalette(palette.slice(1)),false);
 const bad=structuredClone(palette);bad[3].male.body=bad[2].male.body;assert.equal(validSkinPalette(bad),false);
});
