/** Source: all eight base-village DefaultVillageLayout01-*Grids.
 * GridCollection.Grids -> Grid.Objects -> State.WeedData.Treasure.ItemID
 * PullWeed.Response.ApplyThis 4690B60 calls WeedController.PullWeed 49E6740.
 * Explicit treasure branch checks GridState case 8 and WeedData case 2
 * then calls GiveItem at 49E6F5F with amount=1 and original ItemState.
 * Memory item type 13 goes to SpawnRewardOnGrid (call 49E7BD4).
 * A configured initial layout is not proof of a current player's state.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const check=(v,c)=>{if(!v)throw Error('DB01_INITIAL_VILLAGE_MEMORY_'+c)};
export function buildInitialVillageMemoryTreasures(project,rows,source,memories){
 const result=new Map(),sha=source.sourceFilesSha256;
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||sha.MemoryShard!=='e5c017b208dc50e3e4b543a143fe57400429d67151d5fd68938fbda0a4ef5367'||sha.ActivityItem!=='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2'||source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08')return result;
 const d=JSON.parse(readFileSync(join(project,'data/ddv/item-master/initial-village-memory-treasures-steam-1.26.2.json'),'utf8'));
 check(d.schema==='wand.db01.initial-village-memory-treasures@1'&&d.source.platform==='Steam'&&d.source.gameVersion===source.target.gameVersion&&d.source.memorySha256===sha.MemoryShard&&d.source.activitySha256===sha.ActivityItem&&d.source.dumpSha256===source.sourceIl2cppDumpSha256&&d.source.nativeAssemblySha256==='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'&&d.rows.length===8,'SOURCE');
 const known=new Map(rows.map(r=>[r.itemId,r]));
 const names=new Set();let occurrences=0;
 for(const [file,layoutSha,entries] of d.rows){
   const biome=/^DefaultVillageLayout01-(Beach|Cliff|DarkMountains|Forest|Meadow|Savannah|Urban|Wetland)Grids\.json$/.exec(file)?.[1];
   check(biome&&!names.has(biome)&&/^[a-f0-9]{64}$/.test(layoutSha),'LAYOUT');
   names.add(biome);const objectIds=new Set();
   for(const [gridId,objectId,sourceItemId,x,y,targetItemId,shardIndex,shardCount] of entries){
     const memory=memories.get(targetItemId);
     check(gridId===0&&Number.isSafeInteger(objectId)&&objectId>0&&!objectIds.has(objectId)&&Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&
       sourceItemId===31300038&&known.get(sourceItemId)?.nativeKey==='Mission!Story!PageOfDiary'&&
       memory?.appearanceConditionCode===9&&memory.configuredShardCount===shardCount&&shardCount===1&&shardIndex===0&&!result.has(targetItemId),'ENTRY');
     objectIds.add(objectId);occurrences++;
     result.set(targetItemId,[{kind:'initial_village_memory_treasure',category:'ordinary_gameplay',sourceItemId,targetItemId,
       sourcePath:'Grids['+gridId+'].Objects['+objectId+'].State.WeedData.Treasure.ItemID',
       sourceFile:file,sourceFileSha256:layoutSha,sourceBiome:biome,gridId,objectId,x,y,shardIndex,configuredShardCount:shardCount,configuredAmount:1,
       sourceGameVersion:source.target.gameVersion,sourceMemorySha256:sha.MemoryShard,sourceActivityItemSha256:sha.ActivityItem,
       nativeAssemblySha256:d.source.nativeAssemblySha256,nativeRewardActionVerified:true,guaranteedGrantVerified:false,currentAvailabilityVerified:false}]);
   }
 }
 check(names.size===8&&occurrences===19&&result.size===19,'CENSUS');
 console.log('DB01_INITIAL_VILLAGE_MEMORY_TREASURES '+JSON.stringify({biomes:names.size,occurrences,items:result.size}));
 return result;
}
