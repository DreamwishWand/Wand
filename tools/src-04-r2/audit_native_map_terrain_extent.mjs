// Offline source audit; never changes registration or placement legality.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {bindMainland} from '../../src/lib/world/mainland-world-coordinates.ts';
const scopes={Village04:'MapVillage04',VillageExpansion01:'MapVillageExpansion1',VillageExpansion02:'MapVillageExpansion2',VillageExpansion03:'MapVillageExpansion3',VillageExpansion04:'MapVillageExpansion4',VillageWinnieDLC:'MapVillageWinnieDLCMini01'};
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function auditGrid(g,m,width,height){
 const [a,b,c,d,e,f]=m;
 check(m.length===6&&m.every(Number.isFinite)&&a>0&&d>0&&b===0&&c===0,'Unsupported candidate axes');
 check(Number.isSafeInteger(g.sizeX)&&Number.isSafeInteger(g.sizeY)&&g.sizeX>0&&g.sizeY>0&&g.sizeX*g.sizeY<=250000,'Invalid dimensions');
 const size=g.sizeX*g.sizeY;
 check(Array.isArray(g.palette)&&g.palette.length>0&&g.palette.length<=256&&g.palette.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff&&(i===0||v>g.palette[i-1]))&&Array.isArray(g.counts)&&g.counts.length===g.palette.length,'Invalid palette');
 const bytes=inflateSync(Buffer.from(g.data,'base64'),{maxOutputLength:size});
 check(bytes.length===size&&hash(bytes)===g.sha256,'Terrain bytes mismatch');
 const rows=g.palette.map(v=>({value:v,total:0,outsideEdge:0,outsideCenter:0}));
 const x0=2*g.origin.position[0],y0=-2*g.origin.position[2];
 for(let i=0;i<size;i++){
  const row=rows[bytes[i]];check(row,'Invalid palette index');row.total++;
  if(row.value===0)continue;
  const x=x0+i%g.sizeX,y=y0-Math.floor(i/g.sizeX);
  const left=a*x+e,right=left+a,bottom=d*y+f,top=bottom-d;
  if(left<0||right>width||top<0||bottom>height)row.outsideEdge++;
  const cx=(left+right)/2,cy=(top+bottom)/2;
  if(cx<0||cx>width||cy<0||cy>height)row.outsideCenter++;
 }
 check(rows.every((r,i)=>r.total===g.counts[i]),'Terrain histogram mismatch');
 // 262144 is the source GridFloorType.BlockAutomaticSpawning flag, not a terrain class.
 return {key:g.key,layoutId:g.layoutId,gridDataPath:g.gridDataPath,nativeGridId:g.gridIdNative,byFloorValue:rows,
  nonzeroOutside:rows.reduce((n,r)=>n+r.outsideEdge,0),
  spawnFlagOnlyOutside:rows.find(r=>r.value===262144)?.outsideEdge??0,
  otherFloorFlagsOutside:rows.filter(r=>r.value!==0&&r.value!==262144).reduce((n,r)=>n+r.outsideEdge,0)};
}
function main(){
 const [registrationPath,geometryPath,terrainDir,outPath]=process.argv.slice(2);
 check(outPath,'Usage: node --experimental-strip-types audit_native_map_terrain_extent.mjs REGISTRATION GEOMETRY TERRAIN_DIR PRIVATE_OUT');
 const out=resolve(outPath);
 for(let p=dirname(out);;p=dirname(p)){check(!existsSync(join(p,'.git')),'Private output outside Git required');if(dirname(p)===p)break;}
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 const registration=read(registrationPath),geometry=read(geometryPath),index=read(join(terrainDir,'index.json'));
 check(registration.schema==='wand.src04.native-map-registration-candidate@1'&&geometry.schema==='wand.src04.native-map-geometry-candidate@1'&&registration.worldPlacementVerified===false&&geometry.worldPlacementVerified===false&&registration.privateOnly===true&&geometry.privateOnly===true,'Unexpected private candidates');
 check(index.schema==='wand.db04.terrain-release@1'&&index.platform==='Steam'&&index.gameVersion==='1.26.2','Terrain version mismatch');
 const maps=[];
 for(const [scope,prefab] of Object.entries(scopes)){
  const m=registration.maps.find(m=>m.prefab===prefab),g=geometry.maps.find(g=>g.id===prefab),entry=index.entries.find(r=>r.scope===scope);
  check(m&&g&&entry&&JSON.stringify(m.rootToCanvas)===JSON.stringify(g.rootToCanvas),'Missing map or extent');
  check(entry.path===scope.toLowerCase()+'.json','Unexpected terrain path');
  const raw=readFileSync(join(terrainDir,entry.path));check(hash(raw)===entry.sha256,'Terrain bundle digest mismatch');
  const bundle=JSON.parse(raw);check(bundle.schema==='wand.db04.terrain-projection@1'&&bundle.platform==='Steam'&&bundle.gameVersion==='1.26.2'&&bundle.coordinateBasis==='source_grid_local_y_major','Terrain format changed');
  check(bundle.grids.length===entry.gridCount&&bundle.grids.every((r,i)=>['key','layoutId','gridDataPath','gridIdNative','sizeX','sizeY','factor'].every(k=>r[k]===entry.grids[i][k])),'Terrain index mismatch');
  const bound=bindMainland(bundle.grids);check(bound,'Unresolved source Grid origin');
  const rows=bound.map((r,i)=>auditGrid({...bundle.grids[i],...r},m.halfWorldTicksToCanvasCandidate,g.width,g.height));
  maps.push({scope,prefab,width:g.width,height:g.height,rows});
 }
 const rows=maps.flatMap(m=>m.rows);
 const totals={grids:rows.length,nonzeroOutside:rows.reduce((n,r)=>n+r.nonzeroOutside,0),spawnFlagOnlyOutside:rows.reduce((n,r)=>n+r.spawnFlagOnlyOutside,0),otherFloorFlagsOutside:rows.reduce((n,r)=>n+r.otherFloorFlagsOutside,0)};
 writeFileSync(out,JSON.stringify({schema:'wand.src04.native-map-terrain-extent-audit@1',privateOnly:true,publicationAuthorized:false,worldPlacementVerified:false,placementLegalityVerified:false,totals,maps}),{flag:'wx'});
 console.log(totals);
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main();
