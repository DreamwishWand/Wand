/** Build-only compact source context for shared decoration filters.
 * Enum names and bit positions are from the original Steam IL2CPP dump.
 * This does not evaluate grid legality, player ownership or save state.
 */
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const FURNITURE='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const BUILDING='e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0';
const names=['Beach','Wetland','Meadow','Urban','Savannah','Forest','DarkMountains','Cliff','Shore','Water',
 'Floor','Wall','Surface','AtlanteanOutpost','Desert','Jungle','Mythology','FairyTales','BlockAutomaticSpawning',
 'Library','Puzzle','PuzzleSurface','Rockies','Fashion','Wishland','OutsideFloor','Honeywood','Pirates','Candy','Kingdom'];
const terrainMask=names.reduce((m,n,i)=>['Floor','Wall','Surface','BlockAutomaticSpawning','Puzzle','PuzzleSurface'].includes(n)?m:m|2**i,0)>>>0;
const roomMask=1024|2048, surfaceMask=4096, specialMask=262144|1048576|2097152;
const sceneNames=['Main','Village','Castle','PlayerHouse','House','DisneyWorld','Restaurant','IntroScene','Store','Cave','BoardGame','Boutique','FloatingIsland','Exhibition','VillageArea'];
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const u32=v=>Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const id=v=>Number.isSafeInteger(v)&&v>0;
const check=(ok,code)=>{if(!ok)throw Error('DB01_PLACEMENT_CONTEXT_'+code);};
export function buildPlacementContexts(source,rows){
  const result=new Map();
  if(source.target.platform!=='Steam'||source.sourceIl2cppDumpSha256!==DUMP)return result;
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const counts={Furniture:{},Building:{}};
  for(const r of rows){
    if(!['Furniture','Building'].includes(r.nativeCategory))continue;
    const attrs=r.sourceAttributes??{}, g=attrs.GridAreaData, restriction=attrs.GridEditRestriction;
    let floor=null;
    if(obj(g)&&Object.hasOwn(g,'AcceptedFloorTypesFlag')){
      const mask=g.AcceptedFloorTypesFlag;
      check(u32(mask),'MASK');
      const terrain=(mask&terrainMask)!==0, room=(mask&roomMask)!==0;
      const surface=(mask&surfaceMask)!==0, special=(mask&specialMask)!==0;
      const unknown=(mask&0xc0000000)>>>0;
      const kind=terrain&&room?'terrain_and_floor_wall':terrain?'terrain_only':room?'floor_wall_only':
        surface||special||unknown?'surface_or_special':'zero';
      floor={mask,kind,terrain,room,surface,special,unknownBits:unknown,
        floorTypes:names.filter((_,i)=>(mask&2**i)!==0)};
      counts[r.nativeCategory][kind]=(counts[r.nativeCategory][kind]??0)+1;
    }
    let scene=null;
    const place=restriction?.CanPlace;
    if(obj(place)){
      const selectors=['Scene','SceneType','SceneWithTag','SceneWithoutTag'].filter(k=>Object.hasOwn(place,k));
      check(selectors.length<=1,'PLACE_ONEOF');
      const key=selectors[0]??null, value=key===null?null:place[key];
      const hasUnresolved=Array.isArray(place._unresolvedFields)&&place._unresolvedFields.length>0;
      const custom=place.CustomRestrictions;
      check(custom===undefined||Array.isArray(custom),'CUSTOM');
      let sceneTypeCode=null,sceneItemId=null,sceneTagItemId=null;
      if(key==='Scene'){
        check(id(value),'SCENE_ID');
        sceneItemId=value;
        const target=byId.get(value);
        if(target?.nativeCategory==='Scene'){
          const code=target.sourceAttributes?.SceneType??target.nativeProperties?.SceneType;
          if(Number.isSafeInteger(code)&&code>=0&&code<sceneNames.length)sceneTypeCode=code;
        }
      }else if(key==='SceneType'){
        check(Number.isSafeInteger(value)&&value>=0&&value<sceneNames.length,'SCENE_TYPE');
        sceneTypeCode=value;
      }else if(key==='SceneWithTag'||key==='SceneWithoutTag'){
        check(id(value),'SCENE_TAG');sceneTagItemId=value;
      }
      scene={kind:hasUnresolved?'unresolved':key??(custom?.length?'custom_only':'empty'),
        sceneItemId,sceneTypeCode,sceneTypeName:sceneTypeCode===null?null:sceneNames[sceneTypeCode],
        sceneTagItemId,customRestrictionCount:custom?.length??0,hasUnresolved};
    }
    if(floor||scene){
      result.set(r.itemId,{floor,scene,placementLegalityVerified:false});
    }
  }
  // Complete native file scan, including non-browse requests and blockers.
  // A future changed source is not assigned the old counts.
  if(source.sourceFilesSha256?.Furniture===FURNITURE)
    check(counts.Furniture.terrain_and_floor_wall===4009&&counts.Furniture.terrain_only===2028&&
      counts.Furniture.floor_wall_only===661&&counts.Furniture.surface_or_special===48,'FURNITURE_CENSUS');
  if(source.sourceFilesSha256?.Building===BUILDING)
    check(counts.Building.terrain_and_floor_wall===45&&counts.Building.terrain_only===347&&
      counts.Building.floor_wall_only===2,'BUILDING_CENSUS');
  return result;
}
