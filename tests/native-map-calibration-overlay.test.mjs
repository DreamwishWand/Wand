import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMapSourceScope} from '../src/lib/media/native-local-preview.ts';
import {nativeCalibrationGridTransform,nativeCalibrationPixels} from '../src/lib/world/native-map-calibration-overlay.ts';
test('only known connected worlds get a source overlay',()=>{
 assert.equal(nativeMapSourceScope('MapVillage04'),'Village04');
 assert.equal(nativeMapSourceScope('MapVillageExpansion4'),'VillageExpansion04');
 assert.equal(nativeMapSourceScope('MapVillageWinnieDLCMini01'),'VillageWinnieDLC');
 assert.equal(nativeMapSourceScope('MapVillageUnderwater01'),null);
 assert.equal(nativeMapSourceScope('unknown'),null);
});
test('terrain uses original source north-up transform and excludes spawn-only flags',()=>{
 assert.equal(nativeCalibrationGridTransform({bounds:{x:-74,y:-10,w:2,h:2},origin:{position:[-37,9,4]}}),'translate(-74 -8) scale(1 -1)');
 const p=nativeCalibrationPixels({sizeX:2,sizeY:2,nativeFloorValues:Uint32Array.from([0,262144,4,512|262144])});
 assert.deepEqual([p[3],p[7],p[11],p[15]],[0,0,255,255]);
 assert.throws(()=>nativeCalibrationPixels({sizeX:2,sizeY:2,nativeFloorValues:new Uint32Array(1)}));
});
