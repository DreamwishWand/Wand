//! Source-confirmed PlayerHouse room/finish references. Read-only local view;
//! never infer wall orientation or room dimensions from ordinal or item poses.
use crate::CodecError;
use serde_json::{Value,json};
use std::collections::{BTreeMap,HashMap};
fn id(v:&Value)->Option<u64>{v.as_u64().filter(|n|*n<=u32::MAX as u64)}
fn key_id(s:&str)->Option<i32>{s.parse::<i32>().ok().filter(|n|n.to_string()==s)}
fn finish(v:Option<&Value>)->Option<u64>{v.and_then(id).filter(|n|*n<=i32::MAX as u64)}
fn room_terrain(catalog:&Value,path:&str,kind:&str)->Option<Value>{
 if !(kind=="floor"&&path.starts_with("GridData/Rooms/Room")||kind=="wall"&&path.starts_with("GridData/Rooms/Wall")){return None;}
 let row=catalog.get("grids")?.as_array()?.iter().find(|r|r.get(0).and_then(Value::as_str)==Some(path))?;
 let sx=row.get(1)?.as_u64()?;let sy=row.get(2)?.as_u64()?;
 let values=row.get(4)?.as_array()?;
 if sx==0||sy==0||sx>256||sy>256||values.len()!=(sx*sy) as usize{return None;}
 Some(json!({"sizeX":sx,"sizeY":sy,"values":values}))
}
fn terrain_catalog()->Result<Value,CodecError>{
 serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).map_err(|_|CodecError::Json)
}
pub(super) fn project(source:&[u8])->Result<String,CodecError>{
 let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
 let world=root.get("World").and_then(Value::as_object).ok_or(CodecError::Json)?;
 let houses=match world.get("PlayerHouses"){None=>&[][..],Some(v)=>v.as_array().ok_or(CodecError::Json)?.as_slice()};
 if houses.len()>128{return Err(CodecError::Bounds);}
 let collection=world.get("GridCollection");
 let grids=collection.and_then(|v|v.get("Grids")).and_then(Value::as_object);
 let diffs=collection.and_then(|v|v.get("DiffGrids"));
 let mut rooms=Vec::new();let mut references=HashMap::<u64,usize>::new();
 for (h,house) in houses.iter().enumerate(){
  let floors=match house.get("Floors"){None=>&[][..],Some(v)=>v.as_array().ok_or(CodecError::Json)?.as_slice()};
  if floors.len()>128{return Err(CodecError::Bounds);}
  for(f,floor)in floors.iter().enumerate(){
   let Some(value)=floor.get("Rooms") else{continue;};let map=value.as_object().ok_or(CodecError::Json)?;
   for(k,room)in map{
    if key_id(k).is_none()||!room.is_object()||rooms.len()>=2048{return Err(CodecError::Json);}
    let floor_id=room.get("FloorGridID").and_then(id);
    let empty=serde_json::Map::new();let walls=match room.get("WallGridIDs"){None=>&empty,Some(v)=>v.as_object().ok_or(CodecError::Json)?};
    if walls.len()>64{return Err(CodecError::Bounds);}
    let paper=room.get("Wallpapers").and_then(Value::as_object);
    let mut surfaces=vec![("floor",None,floor_id,finish(room.get("Flooring")))];
    for(key,value)in walls{
     let wall=key_id(key).ok_or(CodecError::Json)?;
     surfaces.push(("wall",Some(wall),id(value),finish(paper.and_then(|p|p.get(key)))));
    }
    surfaces.sort_by_key(|s|s.1);
    for(_,_,grid,_)in &surfaces{if let Some(n)=grid{*references.entry(*n).or_default()+=1;}}
    rooms.push((h+1,f+1,room,surfaces));
   }
  }
 }
 let mut out=Vec::new();let mut total=0usize;let mut terrain_total=0usize;let catalog=terrain_catalog()?;
 for(h,f,room,surfaces)in rooms{
  let mut rows=Vec::new();
  for(kind,native_wall,grid,material)in surfaces{
   let mut counts=BTreeMap::<u64,usize>::new();let mut state="unresolved";
   let mut positions=Vec::new();let mut missing=0usize;let mut factor=None;let mut terrain=None;
   if let Some(n)=grid{
    let key=n.to_string();
    if references.get(&n).copied()!=Some(1){state="shared";}
    else if diffs.is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&key))){state="diff";}
    else if let Some(g)=grids.and_then(|m|m.get(&key)){
     if g.get("ID").and_then(id)==Some(n){
      if let Some(objects)=g.get("Objects").and_then(Value::as_object){
       state="full";
       if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)==Some(643){factor=g.get("TessellationFactor").and_then(Value::as_u64).filter(|n|matches!(*n,1|2));}
       if factor.is_some(){terrain=g.get("GridDataPath").and_then(Value::as_str).and_then(|p|room_terrain(&catalog,p,kind));}
       total=total.checked_add(objects.len()).ok_or(CodecError::Bounds)?;
       if total>100000{return Err(CodecError::Bounds);}
       for(key,obj)in objects{
        let oid=obj.get("ID").and_then(id);let item=obj.get("ItemID").and_then(id).filter(|n|*n>0);
        if oid.map(|n|n.to_string()).as_deref()!=Some(key.as_str())||item.is_none(){state="unresolved";counts.clear();positions.clear();missing=0;factor=None;break;}
        let item=item.unwrap();*counts.entry(item).or_default()+=1;
        let coord=|k:&str|obj.get(k).and_then(Value::as_i64).filter(|n|(-1_000_000..=1_000_000).contains(n));
        if let (Some(x),Some(y))=(coord("X"),coord("Y")){let orientation=match obj.get("Orientation").and_then(Value::as_str){Some("GridOrientation_Up")=>Some(0),Some("GridOrientation_Right")=>Some(4),Some("GridOrientation_Down")=>Some(8),Some("GridOrientation_Left")=>Some(12),_=>None};positions.push(json!({"itemId":item,"x":x,"y":y,"orientationCode":orientation}));}else{missing+=1;}
       }
      }
     }
    }
   }
   let mut row=json!({"kind":kind,"ordinal":rows.len()+1,"wallPosition":native_wall,"finish":material,"gridStatus":state,"positions":positions,"factor":factor,"missingPositions":missing,"items":counts.into_iter().map(|(item,quantity)|json!({"itemId":item,"quantity":quantity})).collect::<Vec<_>>() });
   if state=="full"&&factor.is_some(){if let Some(t)=terrain{terrain_total+=t.get("values").and_then(Value::as_array).map_or(0,Vec::len);if terrain_total<=1_000_000{row["terrain"]=t;}}}
   rows.push(row);
  }
  let name=room.get("Name").and_then(Value::as_str).filter(|s|s.chars().count()<=128).unwrap_or("");
  out.push(json!({"ordinal":out.len()+1,"house":h,"floor":f,"name":name,"ceiling":finish(room.get("Ceiling")),"surfaces":rows}));
 }
 Ok(json!({"contract":"wand.db05.indoor-rooms@1","rooms":out,"geometryVerified":false,"writerAuthorized":false,"ownedFinishIds":owned_finishes(&root)}).to_string())
}

/// Exact positive ownership in a unique compatible Trimming route. An
/// unrecognized route makes the picker empty, not a fabricated unlock.
fn owned_finishes(root:&Value)->Vec<u32>{
 let Some(map)=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(Value::as_object)else{return vec![];};
 let mut routes=map.iter().filter(|(_,v)|v.get("CompatibleItemType").and_then(Value::as_str)==Some("ItemType_Trimming"));
 let Some((key,route))=routes.next()else{return vec![];};
 if routes.next().is_some()||route.get("ID").and_then(Value::as_u64).is_none_or(|n|n.to_string()!=*key)||route.as_object().is_none_or(|o|o.keys().any(|k|k.starts_with("Compatible")&&k!="CompatibleItemType")){return vec![];}
 let Some(items)=route.get("Inventory").and_then(Value::as_object)else{return vec![];};
 let mut result=Vec::new();
 for(k,v)in items{if let Ok(n)=k.parse::<u32>(){if n.to_string()==*k&&matches!(n/100000,1600|1601)&&v.get("Amount").and_then(Value::as_u64).is_some_and(|a|a>0&&a<=i32::MAX as u64){result.push(n);}}}
 if result.len()>20000{return vec![];}result.sort_unstable();result
}
pub(super) fn finish_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 use ddv_save_patch::{RoomFinishTarget,RoomFinishAction,preview_room_finish};
 if plan.len()>2048{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
 let value:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 let p=value.as_object().ok_or(CodecError::Json)?;
 if p.len()!=5||p.keys().any(|k|!matches!(k.as_str(),"roomOrdinal"|"itemId"|"kind"|"wall"|"expected")){return Err(CodecError::Json);}
 let ordinal=p.get("roomOrdinal").and_then(Value::as_u64).filter(|n|*n>0&&*n<=2048).ok_or(CodecError::Json)?;
 let item=p.get("itemId").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
 if !owned_finishes(&root).contains(&item){return Err(CodecError::Patch);}
 let houses=root.get("World").and_then(|v|v.get("PlayerHouses")).and_then(Value::as_array).ok_or(CodecError::Json)?;
 if houses.len()>128{return Err(CodecError::Bounds);}
 let mut seen=0u64;let mut target=None;
 'find:for(h,house)in houses.iter().enumerate(){
  let Some(floors)=house.get("Floors")else{continue;};let floors=floors.as_array().ok_or(CodecError::Json)?;
  if floors.len()>128{return Err(CodecError::Bounds);}
  for(f,floor)in floors.iter().enumerate(){
   let Some(rooms)=floor.get("Rooms")else{continue;};let rooms=rooms.as_object().ok_or(CodecError::Json)?;
   for key in rooms.keys(){seen+=1;if seen==ordinal{
    let slot=key_id(key).and_then(|n|u8::try_from(n).ok()).filter(|n|*n<=3).ok_or(CodecError::Json)?;
    let house_item_id=house.get("HouseItemID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(CodecError::Json)?;
    target=Some(RoomFinishTarget{house_index:h,house_item_id,floor_index:f,room_slot:slot});break 'find;
   }}
  }
 }
 let target=target.ok_or(CodecError::Json)?;
 let wall=p.get("wall").ok_or(CodecError::Json)?;
 let action=match p.get("kind").and_then(Value::as_str){
  Some("floor") if wall.is_null()=>RoomFinishAction::Flooring{expected:p.get("expected").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?},
  Some("wall")=>{
   let wall=if wall.is_null(){None}else{Some(wall.as_u64().and_then(|n|u8::try_from(n).ok()).filter(|n|*n<4).ok_or(CodecError::Json)?)};
   let old=p.get("expected").and_then(Value::as_array).filter(|v|v.len()==4).ok_or(CodecError::Json)?;
   let mut expected=[None;4];for(i,v)in old.iter().enumerate(){if !v.is_null(){expected[i]=Some(v.as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?);}}
   RoomFinishAction::Wallpaper{wall,expected}
  },
  _=>return Err(CodecError::Json)
 };
 preview_room_finish(std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?,target,item,action).map_err(|_|CodecError::Patch)
}

/// Resolve a unique explicit room surface and exact existing plain objects.
/// With no source room raster, only identical-footprint rotation/swap (UI
/// geometry witness) and stock pickup are enabled. No arbitrary new cells.
/// Resolve a cut witness from an exact owned floor, independently of UI state.
fn resolve_room_cut_source(source:&[u8],root:&Value,row:&Value,item:u64,expected:(i32,i32),old:&str)->Result<ddv_save_patch::GridCoordinateTarget,CodecError>{
 use ddv_save_patch::{GridCoordinateTarget,GridObjectKind};
 let bad=CodecError::Json;
 let w=row.as_object().filter(|r|r.len()==2&&r.keys().all(|k|matches!(k.as_str(),"roomOrdinal"|"index"))).ok_or(bad)?;
 let ordinal=w.get("roomOrdinal").and_then(Value::as_u64).filter(|n|*n>0&&*n<=2048).ok_or(bad)? as usize;
 let index=w.get("index").and_then(Value::as_u64).filter(|n|*n<5000).ok_or(bad)? as usize;
 let report:Value=serde_json::from_str(&project(source)?).map_err(|_|bad)?;
 let face=report.get("rooms").and_then(|v|v.get(ordinal-1)).and_then(|v|v.get("surfaces")).and_then(|v|v.get(0)).ok_or(bad)?;
 if face.get("gridStatus").and_then(Value::as_str)!=Some("full")||face.get("missingPositions").and_then(Value::as_u64)!=Some(0)||face.get("terrain").is_none()||face.get("factor").and_then(Value::as_u64).is_none(){return Err(bad);}
 let world=root.get("World").ok_or(bad)?;
 let mut rooms=Vec::new();
 for house in world.get("PlayerHouses").and_then(Value::as_array).ok_or(bad)?{
  if let Some(floors)=house.get("Floors"){for floor in floors.as_array().ok_or(bad)?{
   if let Some(m)=floor.get("Rooms"){rooms.extend(m.as_object().ok_or(bad)?.values());}
  }}
 }
 let gid=rooms.get(ordinal-1).and_then(|r|r.get("FloorGridID")).and_then(id).filter(|n|*n>0).ok_or(bad)?.to_string();
 let collection=world.get("GridCollection").ok_or(bad)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 for scope in [Some(grids),collection.get("DiffGrids").and_then(Value::as_object)].into_iter().flatten(){
  for grid in scope.values(){for field in ["Objects","ModifiedObjects"]{if let Some(rows)=grid.get(field).and_then(Value::as_object){if rows.values().any(|o|o.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(id).is_some_and(|n|n.to_string()==gid)){return Err(bad);}}}}
 }
 let objects=grids.get(&gid).and_then(|g|g.get("Objects")).and_then(Value::as_object).filter(|o|o.len()<=5000).ok_or(bad)?;
 let (key,obj)=objects.iter().nth(index).ok_or(bad)?;
 let at=|v:&Value|v.get("X").and_then(Value::as_i64)==Some(i64::from(expected.0))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(expected.1));
 if item/100_000!=400||obj.get("ID").and_then(id).filter(|n|*n>0).is_none_or(|n|n.to_string()!=*key)||obj.get("ItemID").and_then(id)!=Some(item)||!at(obj)||obj.get("Orientation").and_then(Value::as_str)!=Some(old)||
 !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||obj.get("State").is_some_and(|s|!s.is_null())||
 obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||objects.values().filter(|o|at(o)).count()!=1{return Err(bad);}
 let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid,object_id:key.clone(),item_id:item};
 let refs=crate::grid_instance_preview::grid_identity_dependencies(source,&target)?;
 if refs.blocking()>0||refs.historical>0{return Err(bad);}
 Ok(target)
}
pub(super) fn room_to_outdoor_candidate(source:&[u8],row:&Value)->Result<String,CodecError>{
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let o=row.as_object().filter(|r|r.len()==9&&r.keys().all(|k|matches!(k.as_str(),"roomSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"))).ok_or(bad)?;
 let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
 let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let expected=(int("expectedX")?,int("expectedY")?);
 let target=resolve_room_cut_source(source,&root,o.get("roomSource").ok_or(bad)?,item,expected,o.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?)?;
 let d=crate::grid_instance_preview::resolve_plain_grid_destination(source,o.get("destination").ok_or(bad)?)?;
 let xy=(int("x")?,int("y")?);
 let orientation=o.get("orientation").and_then(Value::as_str).ok_or(bad)?;
 let dest=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&d.grid_id)).and_then(|v|v.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 if dest.values().any(|v|v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(bad);}
 let draft=ddv_save_patch::preview_indoor_to_outdoor_transfer(std::str::from_utf8(source).map_err(|_|bad)?,&target,expected,&d,xy,orientation).map_err(|_|CodecError::Patch)?;
 if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(CodecError::Patch);}
 Ok(draft.patched_json)
}
pub(super) fn furniture_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 use ddv_save_patch::{GridCoordinateTarget,GridObjectKind,GridMixedEdit,FurnitureStockAction};
 let bad=CodecError::Json;
 if plan.len()>8192{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let p=v.as_object().filter(|p|p.len()==3&&p.keys().all(|k|matches!(k.as_str(),"roomOrdinal"|"surfaceOrdinal"|"edits"|"pickup"|"place"|"transfer"))&&["edits","pickup","place","transfer"].iter().filter(|k|p.contains_key(**k)).count()==1).ok_or(bad)?;
 let ordinal=p.get("roomOrdinal").and_then(Value::as_u64).filter(|n|*n>0&&*n<=2048).ok_or(bad)? as usize;
 let surface=p.get("surfaceOrdinal").and_then(Value::as_u64).filter(|n|*n>0&&*n<=65).ok_or(bad)? as usize;
 let report:Value=serde_json::from_str(&project(source)?).map_err(|_|bad)?;
 let face=report.get("rooms").and_then(|r|r.get(ordinal-1)).and_then(|r|r.get("surfaces")).and_then(|r|r.get(surface-1)).ok_or(bad)?;
 if face.get("gridStatus").and_then(Value::as_str)!=Some("full")||face.get("missingPositions").and_then(Value::as_u64)!=Some(0)||face.get("factor").and_then(Value::as_u64).is_none(){return Err(bad);}
 let world=root.get("World").ok_or(bad)?;
 let mut rooms=Vec::new();
 for house in world.get("PlayerHouses").and_then(Value::as_array).ok_or(bad)?{
  if let Some(floors)=house.get("Floors"){for floor in floors.as_array().ok_or(bad)?{
   if let Some(m)=floor.get("Rooms"){rooms.extend(m.as_object().ok_or(bad)?.values());}
  }}
 }
 let room=rooms.get(ordinal-1).ok_or(bad)?;
 let gid=if surface==1{room.get("FloorGridID").and_then(id)}else{
  let wall=face.get("wallPosition").and_then(Value::as_i64).ok_or(bad)?.to_string();
  room.get("WallGridIDs").and_then(|m|m.get(&wall)).and_then(id)
 }.filter(|n|*n>0).ok_or(bad)?.to_string();
 let collection=world.get("GridCollection").ok_or(bad)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 // A room surface must not also be owned by a saved support object.
 for scope in [Some(grids),collection.get("DiffGrids").and_then(Value::as_object)].into_iter().flatten(){
  for grid in scope.values(){for field in ["Objects","ModifiedObjects"]{if let Some(rows)=grid.get(field).and_then(Value::as_object){if rows.values().any(|o|o.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(id).is_some_and(|n|n.to_string()==gid)){return Err(bad);}}}}
 }
 let grid=grids.get(&gid).ok_or(bad)?;
 let objects=grid.get("Objects").and_then(Value::as_object).ok_or(bad)?;
 let factor=face.get("factor").and_then(Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
 let terrain=face.get("terrain");
 let on_terrain=|(x,y):(i32,i32)|->bool{
  let Some(t)=terrain else{return false;};
  let Some(sx)=t.get("sizeX").and_then(Value::as_u64)else{return false;};
  let Some(sy)=t.get("sizeY").and_then(Value::as_u64)else{return false;};
  if x<0||y<0||x as u64>=sx*u64::from(factor)||y as u64>=sy*u64::from(factor){return false;}
  t.get("values").and_then(|v|v.get((y as usize/factor as usize)*sx as usize+x as usize/factor as usize)).and_then(Value::as_u64).is_some_and(|n|n!=0)
 };
 let empty_anchor=|(x,y):(i32,i32),except:Option<&str>|!objects.iter().any(|(k,v)|Some(k.as_str())!=except&&v.get("X").and_then(Value::as_i64)==Some(i64::from(x))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(y)));

 if objects.len()>5000{return Err(CodecError::Bounds);}
 let coord=|row:&Value,key:&str|row.get(key).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let resolve=|row:&Value|->Result<(GridCoordinateTarget,(i32,i32),String),CodecError>{
  let index=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
  let (key,obj)=objects.iter().nth(index).ok_or(bad)?;
  let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let expected=(coord(row,"expectedX")?,coord(row,"expectedY")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
  if obj.get("ID").and_then(id).filter(|n|*n>0).is_none_or(|n|n.to_string()!=*key)||obj.get("ItemID").and_then(id)!=Some(item)||
     (coord(obj,"X")?,coord(obj,"Y")?)!=expected||obj.get("Orientation").and_then(Value::as_str)!=Some(old)||
     !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||obj.get("State").is_some_and(|s|!s.is_null())||
     obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
     objects.values().filter(|o|coord(o,"X").ok()==Some(expected.0)&&coord(o,"Y").ok()==Some(expected.1)).count()!=1{return Err(bad);}
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:item};
  if crate::grid_instance_preview::grid_identity_dependencies(source,&target)?.blocking()>0{return Err(bad);}
  Ok((target,expected,old.to_owned()))
 };
 let json=std::str::from_utf8(source).map_err(|_|bad)?;
 if let Some(row)=p.get("transfer"){
  if surface!=1||row.as_object().is_none_or(|r|r.len()!=8||r.contains_key("localOrdinal")==r.contains_key("roomSource")||r.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"roomSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"))){return Err(bad);}
  let room_source=row.get("roomSource");
  let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let expected=(coord(row,"expectedX")?,coord(row,"expectedY")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
  let target=if let Some(w)=room_source{resolve_room_cut_source(source,&root,w,item,expected,old)?}else{
   let source_ordinal=row.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   crate::grid_instance_preview::resolve_grid_orientation_target(source,source_ordinal,item,expected,"full",old)?
  };
  let refs=crate::grid_instance_preview::grid_identity_dependencies(source,&target)?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let from=grids.get(&target.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
  if from.values().filter(|v|coord(v,"X").ok()==Some(expected.0)&&coord(v,"Y").ok()==Some(expected.1)).count()!=1{return Err(bad);}
  let xy=(coord(row,"x")?,coord(row,"y")?);
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if !on_terrain(xy)||!empty_anchor(xy,None)||objects.len()>=512{return Err(bad);}
  let t=terrain.ok_or(bad)?;
  let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)? as u32;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)? as u32;
  let next=grid.get("NextGridObjectID").and_then(Value::as_u64).filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
  let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(source,&gid,&[next.to_string()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:grid.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?.to_owned(),tessellation:factor,size:(sx,sy)};
  return (if room_source.is_some(){ddv_save_patch::preview_indoor_to_indoor_transfer(json,&target,expected,&d,xy,orientation)}else{ddv_save_patch::preview_outdoor_to_indoor_transfer(json,&target,expected,&d,xy,orientation)}).map_err(|_|CodecError::Patch);
 }
 if let Some(row)=p.get("place"){
  if row.as_object().is_none_or(|r|r.len()!=5||r.keys().any(|k|!matches!(k.as_str(),"itemId"|"expectedStock"|"x"|"y"|"orientation"))){return Err(bad);}
  let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let amount=row.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  let xy=(coord(row,"x")?,coord(row,"y")?);let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if !on_terrain(xy)||!empty_anchor(xy,None)||objects.len()>=512{return Err(bad);}
  let t=terrain.ok_or(bad)?;
  let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)? as u32;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)? as u32;
  let next=grid.get("NextGridObjectID").and_then(Value::as_u64).filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
  let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(source,&gid,&[next.to_string()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:grid.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?.to_owned(),tessellation:factor,size:(sx,sy)};
  return ddv_save_patch::preview_indoor_grid_stock_place(json,&d,item,xy,orientation,amount).map_err(|_|CodecError::Patch);
 }
 if let Some(row)=p.get("pickup"){
  if row.as_object().is_none_or(|r|r.len()!=6||r.keys().any(|k|!matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"expectedStock"))){return Err(bad);}
  let (target,expected,_)=resolve(row)?;
  let amount=row.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  return ddv_save_patch::preview_furniture_stock_transaction(json,amount,FurnitureStockAction::Pickup{target:&target,expected}).map_err(|_|CodecError::Patch);
 }
 let rows=p.get("edits").and_then(Value::as_array).filter(|a|matches!(a.len(),1|2)).ok_or(bad)?;
 let mut edits=Vec::new();
 for row in rows{
  if row.as_object().is_none_or(|r|r.len()!=8||r.keys().any(|k|!matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"))){return Err(bad);}
  let (target,expected,old)=resolve(row)?;
  let xy=(coord(row,"x")?,coord(row,"y")?);let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(bad);}
  if rows.len()==1{
   if xy==expected&&old==orientation{return Err(bad);}
   if xy!=expected&&(!on_terrain(expected)||!on_terrain(xy)||!empty_anchor(xy,Some(target.object_id.as_str()))){return Err(bad);}
   if terrain.is_some()&&(!on_terrain(expected)||!on_terrain(xy)){return Err(bad);}
  }else if xy==expected||old!=orientation{return Err(bad);}
  edits.push(GridMixedEdit{target,expected,position:(xy!=expected).then_some(xy),orientation:(old!=orientation).then(||(old,orientation.to_owned()))});
 }
 if edits.len()==2&&(edits[0].position!=Some(edits[1].expected)||edits[1].position!=Some(edits[0].expected)){return Err(bad);}
 ddv_save_patch::preview_existing_grid_mixed_batch(json,&edits).map_err(|_|CodecError::Patch)
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn indoor_furniture_rotates_swaps_and_picks_up_only_exact_plain_records(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":0,"Y":0,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000002,"X":2,"Y":0,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let a=json!({"index":0,"itemId":40000001,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_Left"});
  let mut p=json!({"roomOrdinal":1,"surfaceOrdinal":1,"edits":[a]});
  let d=furniture_candidate(raw,&p.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Left");
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);assert!(d.patched_json.contains("\"Marker\":1e2"));
  p["edits"][0]["x"]=Value::from(1);assert!(furniture_candidate(raw,&p.to_string()).is_err());
  p["edits"][0]["x"]=Value::from(2);p["edits"][0]["orientation"]=Value::from("GridOrientation_Down");
  p["edits"].as_array_mut().unwrap().push(json!({"index":1,"itemId":40000002,"expectedX":2,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_Down"}));
  assert!(furniture_candidate(raw,&p.to_string()).is_ok());
  let pickup=json!({"roomOrdinal":1,"surfaceOrdinal":1,"pickup":{"index":0,"itemId":40000001,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","expectedStock":0}});
  let d=furniture_candidate(raw,&pickup.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],1);
  let mut shared:Value=serde_json::from_slice(raw).unwrap();shared["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]["0"]["WallGridIDs"]=json!({"0":42});
  assert!(furniture_candidate(&serde_json::to_vec(&shared).unwrap(),&pickup.to_string()).is_err());
 }
 #[test]
 fn outdoor_to_room_transfer_preserves_stock_and_rejects_stale_or_shared_targets(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"transfer":{"localOrdinal":1,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":2,"y":2,"orientation":"GridOrientation_Left"}});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["Orientation"],"GridOrientation_Left");
  assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"],6);
  assert!(d.patched_json.contains("\"Marker\":1e2"));
  let mut stale:Value=serde_json::from_slice(raw).unwrap();
  stale["World"]["SpawnedObjects"]=json!([{"GridID":42,"GridObjectID":1}]);
  assert!(furniture_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
  let mut shared:Value=serde_json::from_slice(raw).unwrap();
  shared["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]["1"]=json!({"FloorGridID":43});
  assert!(furniture_candidate(&serde_json::to_vec(&shared).unwrap(),&plan.to_string()).is_err());
  plan["transfer"]["expectedX"]=json!(9);assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn decoded_room_source_masks_bind_only_exact_path_and_allow_stock_place(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let report:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();
  assert_eq!(report["rooms"][0]["surfaces"][0]["terrain"]["sizeX"],8);
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"place":{"itemId":40000001,"expectedStock":2,"x":3,"y":3,"orientation":"GridOrientation_Down"}});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["X"],3);
  assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],1);
  plan["place"]["x"]=Value::from(8);assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  let mut p=json!({"roomOrdinal":1,"surfaceOrdinal":1,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":4,"y":4,"orientation":"GridOrientation_Left"}]});
  assert!(furniture_candidate(raw,&p.to_string()).is_ok());p["edits"][0]["y"]=Value::from(-1);assert!(furniture_candidate(raw,&p.to_string()).is_err());
 }
 #[test]
 fn exact_room_finishes_and_surface_counts_without_native_grid_ids(){
  let raw=br#"{"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"Name":"Test room","FloorGridID":3001,"WallGridIDs":{"0":3002,"1":3003},"Flooring":40000001,"Wallpapers":{"0":40000002,"1":0},"Ceiling":40000003}}}]}],"GridCollection":{"Grids":{"3001":{"ID":3001,"Objects":{"82":{"ID":82,"ItemID":40000004},"83":{"ID":83,"ItemID":40000004,"X":3,"Y":-2,"Orientation":"GridOrientation_Down"}}},"3002":{"ID":3002,"Objects":{}}},"DiffGrids":{"3003":{"ID":3003}}}}}"#;
  let report=project(raw).unwrap();let j:Value=serde_json::from_str(&report).unwrap();let room=&j["rooms"][0];assert_eq!(room["name"],"Test room");assert_eq!(room["surfaces"][0]["items"][0]["quantity"],2);assert_eq!(room["surfaces"][0]["positions"],json!([{"itemId":40000004,"x":3,"y":-2,"orientationCode":8}]));assert_eq!(room["surfaces"][0]["missingPositions"],1);assert_eq!(room["surfaces"][1]["finish"],40000002);assert_eq!(room["surfaces"][2]["gridStatus"],"diff");assert_eq!(room["surfaces"][2]["finish"],0);assert_eq!(j["writerAuthorized"],false);assert!(!report.contains("3001")&&!report.contains("3002")&&!report.contains("3003"));
 }
 #[test]
 fn shared_reference_is_not_projected_twice(){
  let raw=br#"{"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42,"WallGridIDs":{"0":42}}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"Objects":{"1":{"ID":1,"ItemID":40000001}}}}}}}"#;
  let j:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();
  for row in j["rooms"][0]["surfaces"].as_array().unwrap(){assert_eq!(row["gridStatus"],"shared");assert_eq!(row["items"],json!([]));}
 }
}
