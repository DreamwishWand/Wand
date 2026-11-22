import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

// Wholly synthetic, small native DB-04 package. Never includes player data.
export const TEST_DB04_LAYOUT='SceneLayouts/Village04/Synthetic.json';
export const TEST_DB04_GRID='GridData/Village04/Synthetic.json';
export function makeCollectionDb04ZipFixture(options={}){
  const gameVersion=options.gameVersion??'1.26.2';
  const row=(id,itemId)=>({
    layoutObjectId:TEST_DB04_LAYOUT+`#grid=0#object=${id}`,
    layoutId:TEST_DB04_LAYOUT,gridIdNative:0,gridObjectIdNative:id,
    itemId,x:1,y:1,orientationCode:0,
    worldCoordinatesVerified:false,fixedImmovableVerified:false
  });
  const source={
    objects:[],scenes:[],worlds:[],areas:[],
    grids:[{gridId:TEST_DB04_GRID,sizeX:10,sizeY:10,
      terrainDecoding:{decoded:false,status:'native_packing_not_verified_for_game_version'}}],
    layouts:[{layoutId:TEST_DB04_LAYOUT,layoutKind:'nativeGridCollection',
      nativeGridEntries:[{gridIdNative:0,gridDataPath:TEST_DB04_GRID,
        defaultObjectCount:3}],defaultObjectCount:3}],
    layoutObjects:[row(7,40005160),row(8,40006110),row(9,50000001)]
  };
  const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
  const entries=new Map(Object.entries(source).map(([name,value])=>
    [name+'.json',Buffer.from(JSON.stringify(value))]));
  entries.set('report.json',Buffer.from('{"status":"native_partial_world_extraction"}'));
  const manifest={
    schema:'wand.db04.world@1',status:'partial_game_native_evidence',
    platform:'Steam',gameVersion,sourceScopeVerified:false,
    outputSha256:Object.fromEntries([...entries].map(([name,data])=>[name,sha(data)]))
  };
  entries.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
  const localChunks=[],centralChunks=[];
  let offset=0;
  for(const [name,payload] of entries){
    const fileName=Buffer.from(name);
    const packed=deflateRawSync(payload);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
    local.writeUInt32LE(packed.length,18);
    local.writeUInt32LE(payload.length,22);
    local.writeUInt16LE(fileName.length,26);
    localChunks.push(local,fileName,packed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(8,10);
    central.writeUInt32LE(packed.length,20);
    central.writeUInt32LE(payload.length,24);
    central.writeUInt16LE(fileName.length,28);
    central.writeUInt32LE(offset,42);
    centralChunks.push(central,fileName);
    offset+=local.length+fileName.length+packed.length;
  }
  const centralSize=centralChunks.reduce((sum,b)=>sum+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...localChunks,...centralChunks,end]);
}
