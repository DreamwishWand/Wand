import test from 'node:test';
import assert from 'node:assert/strict';
import {computeNativeCanvasAlpha} from '../src/lib/media/native-map-canvas-alpha.ts';
const nodes=[{rectTransform:'1',parent:'0'},{rectTransform:'2',parent:'1'},{rectTransform:'3',parent:'1'}];
const group=(pathID,node,alpha)=>({pathID,node,alpha,enabled:true,ignoreParentGroups:false});
const groups=[group('g','2',1),group('n','3',.65)];
const ref=pathID=>({cab:'CAB',pathID});
const area={areaType:60,enabled:true,mode:'canvas-group',canvasGroup:ref('g'),areaNameCanvasGroup:ref('n')};
const settings={backgroundLocked:Math.fround(.3),backgroundUnlocked:1,nameLocked:.5,nameUnlocked:.75};
test('native fallback and name alpha use distinct settings',()=>{
 const a=computeNativeCanvasAlpha(nodes,groups,[area],'CAB',settings,new Map([[60,true]]));
 assert.equal(a.get('2'),settings.backgroundLocked);assert.equal(a.get('3'),.5);
 const b=computeNativeCanvasAlpha(nodes,groups,[area],'CAB',settings,new Map([[60,false]]));
 assert.equal(b.get('2'),1);assert.equal(b.get('3'),.75);
 const c=computeNativeCanvasAlpha(nodes,groups,[{...area,mode:'overlay'}],'CAB',settings,new Map([[60,true]]));
 assert.equal(c.get('2'),1);assert.equal(c.get('3'),.5);
});
test('unknown state or unsupported graph is rejected',()=>{
 assert.throws(()=>computeNativeCanvasAlpha(nodes,groups,[area],'CAB',settings,new Map()));
 assert.throws(()=>computeNativeCanvasAlpha(nodes,[{...groups[0],ignoreParentGroups:true},groups[1]],[area],'CAB',settings,new Map([[60,true]])));
});
