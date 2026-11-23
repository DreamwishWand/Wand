import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeObliqueSourceLocalPosition,GRIDAREA_ROT_COS,GRIDAREA_ROT_SIN
} from '../src/lib/world/native-oblique.ts';
import {
  getOriginalGridAreaLocalWindow,getOriginalGridAreaDisplayDimensions
} from '../src/lib/world/native-gridarea-local-window.ts';

const cardinal=new Set([0,4,8,12]);
const fp={
  sizeX:3,sizeY:2,layerValues:[11,12,21,22,31,32],
  acceptedFloorTypesFlag:4,
  cellIndexToXYVerified:false,layerMaskSemanticsVerified:false,
  nativeWireFields:{
    sizeX:'6.1',sizeY:'6.2',layerValues:'6.3',acceptedFloorTypesFlag:'6.4'
  }
};
const source={
  manifest:{gameVersion:'1.26.2',platform:'Steam'},
  objects:new Map([['100',{itemId:100,nativeType:'Furniture',footprint:fp}]])
};

test('single signed-int32 coefficient table is shared for all 12 noncardinal local orientations',()=>{
  assert.equal(GRIDAREA_ROT_COS.length,16);
  assert.equal(GRIDAREA_ROT_SIN.length,16);
  assert.deepEqual(GRIDAREA_ROT_COS.slice(0,8),[-100,-92,-71,-38,0,38,71,92]);
  assert.throws(()=>{GRIDAREA_ROT_COS[1]=0},TypeError);
  for(let orientation=0;orientation<16;orientation++){
    if(cardinal.has(orientation))continue;
    const dims=getOriginalGridAreaDisplayDimensions(fp.sizeX,fp.sizeY,orientation);
    const view=getOriginalGridAreaLocalWindow(source,100,orientation,
      0,0,dims.width,dims.height);
    assert.equal(view.status,'source_native_local_layers');
    let mapped=0;
    for(let y=0;y<dims.height;y++){
      for(let x=0;x<dims.width;x++){
        const point=nativeObliqueSourceLocalPosition(3,2,x,y,orientation);
        assert.equal(point.orientedSizeX,dims.width);
        assert.equal(point.orientedSizeY,dims.height);
        const expected=point.inside?fp.layerValues[point.originalFlatIndex]:null;
        assert.equal(view.rows[y][x],expected,
          'orientation='+orientation+' x='+x+' y='+y);
        if(point.inside){
          mapped++;
          assert.equal(point.originalFlatIndex,point.originalLocalX*2+point.originalLocalY);
          assert.throws(()=>{point.originalLocalX=999},TypeError);
        }
      }
    }
    assert.equal(mapped+view.unmappedOriginalLocalCellCount,
      dims.width*dims.height);
  }
});

test('factor-two source cell sampling preserves identical 1:1 results for oblique local cells',()=>{
  for(let orientation=1;orientation<16;orientation++){
    if(cardinal.has(orientation))continue;
    const dims=getOriginalGridAreaDisplayDimensions(3,2,orientation);
    const big=getOriginalGridAreaLocalWindow(source,100,orientation,0,0,
      dims.width*2,dims.height*2,2);
    for(let y=0;y<big.rows.length;y++)
      for(let x=0;x<big.rows[y].length;x++){
        const p=nativeObliqueSourceLocalPosition(3,2,
          Math.floor(x/2),Math.floor(y/2),orientation);
        assert.equal(big.rows[y][x],p.inside?fp.layerValues[p.originalFlatIndex]:null);
      }
  }
});

test('strict oblique source shape and position bounds reject invalid input',()=>{
  for(const input of [
    [3,2,0,0,0],[3,2,0,0,4],[3,2,0,0,8],[3,2,0,0,12],
    [0,2,0,0,1],[257,2,0,0,1],[3,2,0,0,16],
    [3,2,0,0,2.5],[3,2,0.25,0,1],[3,2,0,2147483648,1],
    [3,2,-2147483649,0,1],
  ])assert.throws(()=>nativeObliqueSourceLocalPosition(...input),TypeError);
  assert.equal(nativeObliqueSourceLocalPosition(3,2,-1,0,1).inside,false);
  assert.equal(nativeObliqueSourceLocalPosition(3,2,0,999,1).inside,false);
});
