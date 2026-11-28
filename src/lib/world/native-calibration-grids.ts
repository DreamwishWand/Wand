import {nativeMapSourceScope} from '../media/native-local-preview.ts';
import {bindMainland,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';

// Steam 1.26.2 MapGridLocks -> GridScript -> exact local origin PPtr.
// Original GridScript origin and all ancestors have identity rotation/scale;
// ancestors have zero translation. GridData paths and IDs are matched to DB04.
// These three independent scenes must never share a placement coordinate plane.
const scope='VillageExpansion04UnderwaterAreas';
type Row=readonly [number,string,number,number,number,number,number];
const sources:Readonly<Record<string,{folder:string;layout:string;rows:readonly Row[]}>>={
 MapVillageExpansion4Underwater02:{folder:'UnderwaterPirate',layout:'UnderwaterPirate-DefaultLayout-UnderwaterPiratesGrids.json',rows:[
  [9,'UndewaterPirate_01',-53.5,-1.0395889282226562,-48,241,198],
  [5,'UndewaterPirate_05',-11,10.960411071777344,19.5,96,60],
  [6,'UndewaterPirate_02',-50.5,6.960411071777344,-45,76,82],
  [8,'UndewaterPirate_08',23,2.953897476196289,-45,85,73]]},
 MapVillageExpansion4Underwater03:{folder:'UnderwaterCandy',layout:'UnderwaterCandy-DefaultLayout-UnderwaterCandyGrids.json',rows:[
  [0,'UnderwaterCandy_01',-4,-8.449999809265137,-46.5,225,180],
  [3,'UnderwaterCandy_04',44,-4.493000030517578,14.5,128,56],
  [2,'UnderwaterCandy_02',-4.5,-.5,-46.5,72,106],
  [1,'UnderwaterCandy_03',59.5,3.630000114440918,-45,95,72]]},
 MapVillageExpansion4Underwater04:{folder:'UnderwaterKingdom',layout:'UnderwaterKingdom-DefaultLayout-UnderwaterKingdomGrids.json',rows:[
  [3,'UnderwaterKingdom_04',-4,-8.5,-44.5,223,122],
  [1,'UnderwaterKingdom_02',28.5,3.5,20.5,101,47],
  [0,'UnderwaterKingdom_01',-4,-4.5,-13,47,112],
  [2,'UnderwaterKingdom_03',88,-4.5,-13,39,111]]}
};
export function nativeCalibrationScope(mapId:string):string|null{
 return Object.hasOwn(sources,mapId)?scope:nativeMapSourceScope(mapId);
}
export function bindNativeCalibrationGrids(mapId:string,grids:readonly PublicTerrainGridRef[]):MainlandGrid[]|null{
 if(!Object.hasOwn(sources,mapId))return nativeMapSourceScope(mapId)?bindMainland(grids):null;
 const source=sources[mapId],layoutId='SceneLayouts/'+scope+'/'+source.folder+'/'+source.layout;
 const candidates=grids.filter(g=>g.layoutId===layoutId);
 if(candidates.length!==4||new Set(candidates.map(g=>g.key)).size!==4)return null;
 const result:MainlandGrid[]=[];
 for(const [id,name,x,y,z,w,h] of source.rows){
  const gridDataPath='GridData/OffGridBuildings/Expansion04/'+source.folder+'/'+name+'-GridData.json';
  const g=candidates.find(g=>g.key===layoutId+'#'+id&&g.gridIdNative===id&&g.gridDataPath===gridDataPath&&g.factor===1&&g.sizeX===w&&g.sizeY===h);
  if(!g)return null;
  result.push({...g,origin:{gridDataPath,position:[x,y,z]},bounds:{x:2*x,y:-2*z-h,w,h}});
 }
 return result;
}
