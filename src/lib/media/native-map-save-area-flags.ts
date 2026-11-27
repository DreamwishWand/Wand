// MapMenu's original scene-to-prefab references, Steam 1.26.2.
// This lookup identifies a scene, not the runtime IsLocked predicate.
const sceneIds:Readonly<Record<string,number>>=Object.freeze({
 MapVillage04:1540000000,MapVillageExpansion1:1540000101,MapVillageExpansion2:1540000119,MapVillageExpansion3:1540000162,
 MapVillageExpansion4:1540000209,MapVillageWinnieDLCMini01:1540000210,MapVillageExpansion4Underwater01:1540000233,
 MapVillageExpansion4Underwater02:1540000225,MapVillageExpansion4Underwater03:1540000226,MapVillageExpansion4Underwater04:1540000227
});
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function savedNativeAreaFlags(mapId:string,areaTypes:readonly number[],projection:unknown){
 const id=Object.hasOwn(sceneIds,mapId)?sceneIds[mapId]:null;
 const scenes=record(projection)&&projection.schema==='wand.db05.saved-area-flags@1'&&projection.runtimeLockPredicateVerified===false&&record(projection.scenes)?projection.scenes:null;
 const scene=id!==null&&scenes?scenes[String(id)]:null;
 return areaTypes.map(areaType=>{const v=record(scene)?scene[String(areaType)]:null;return {areaType,unlocked:typeof v==='boolean'?v:null};});
}
export function explicitSavedPreviewStates(rows:ReturnType<typeof savedNativeAreaFlags>):Map<number,boolean>|null{
 if(!rows.length||rows.some(r=>r.unlocked===null)||new Set(rows.map(r=>r.areaType)).size!==rows.length)return null;
 return new Map(rows.map(r=>[r.areaType,!r.unlocked]));
}
