import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingDesignEligible,designCatalogCategory} from '../src/lib/world/building-design-catalog.ts';
import {emptyDesign,placeDesign,designShapeMap,designItemCounts} from '../src/lib/world/design-layout.ts';
import {layerVisible,layerSelectable} from '../src/lib/world/world-layer-state.ts';
test('only source-defined on-grid building types are design candidates',()=>{
 const d={nativeType:'Building',footprint:{sizeX:2,sizeY:2}};
 assert.equal(buildingDesignEligible(20000001,d),true);
 assert.equal(buildingDesignEligible(20300001,d),true);
 assert.equal(buildingDesignEligible(20400001,d),false);
 assert.equal(buildingDesignEligible(40000001,d),false);
 assert.equal(buildingDesignEligible(20000001,{...d,footprint:null}),false);
 assert.equal(buildingDesignEligible(20000001,{...d,editRestrictions:{select:'conditional'}}),false);
});
test('building design keeps identity in common layer controls and local timeline',()=>{
 const g={itemId:20000001,name:'House',layer:'other',nativeType:'Building',surfaceCapable:false,shapes:{'20000001:8':{width:2,height:2,cellCount:4,runs:[{x:0,y:0,width:2},{x:0,y:1,width:2}],path:'M0 0h2v2H0Z'}}};
 const t=placeDesign(emptyDesign(),g,2,2,2,10,10);assert.ok(t);
 const map=designShapeMap(t.snapshots[t.cursor],new Map([[g.itemId,g]]),{layoutId:'a',gridIdNative:1,gridDataPath:'b',factor:1});
 assert.equal(map.objects[0].nativeType,'Building');assert.equal(designCatalogCategory(g),'building');
 assert.equal(layerVisible({hidden:['building'],locked:[]},map.objects[0]),false);
 assert.equal(layerSelectable({hidden:[],locked:['building']},map.objects[0]),false);
});
