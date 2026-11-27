//! Source-correlated room resizing and native floor creation. No furniture, ownership, or unknown
//! Grid records are deleted; existing room and Grid identities remain stable.
use super::*;
use serde_json::{Value,json};
const BAD:PatchError=PatchError::InvalidTarget;
struct Shape{ name:String,prefab:String,paths:Vec<String> }
fn shapes()->Result<&'static Vec<Shape>,PatchError>{
 static CATALOG:std::sync::OnceLock<Result<Vec<Shape>,PatchError>>=std::sync::OnceLock::new();
 CATALOG.get_or_init(||{
  let catalog:Value=serde_json::from_str(include_str!("../../../src/lib/world/room-size-source.json")).map_err(|_|BAD)?;
  let rows=catalog["rooms"].as_array().filter(|a|a.len()==26).ok_or(BAD)?;
  rows.iter().map(|s|Ok(Shape{name:s["name"].as_str().ok_or(BAD)?.to_owned(),prefab:s["prefab"].as_str().ok_or(BAD)?.to_owned(),paths:s["paths"].as_array().filter(|a|a.len()==5).ok_or(BAD)?.iter().map(|p|p.as_str().map(str::to_owned).ok_or(BAD)).collect::<Result<_,_>>()?})).collect()
 }).as_ref().map_err(|e|*e)
}
fn terrain_dimensions()->&'static std::collections::HashMap<String,(i64,i64)>{
 static TERRAIN:std::sync::OnceLock<std::collections::HashMap<String,(i64,i64)>>=std::sync::OnceLock::new();
 TERRAIN.get_or_init(||{
  serde_json::from_str::<Value>(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).ok().and_then(|v|v["grids"].as_array().map(|a|a.iter().filter_map(|r|{
   let (x,y)=(r[1].as_i64()?,r[2].as_i64()?);
   if !(1..=128).contains(&x)||!(1..=128).contains(&y)||r[4].as_array()?.len()!=(x*y) as usize{return None;}
   Some((r[0].as_str()?.to_owned(),(x,y)))
  }).collect())).unwrap_or_default()
 })
}
fn available(shape:&Shape)->bool{
 shape.paths.len()==5&&shape.paths.iter().all(|p|terrain_dimensions().contains_key(p))
}
fn room_geometry(root:&Value,t:RoomFinishTarget,shapes:&[Shape])->Result<(usize,Vec<u32>),PatchError>{
 if root["GameInfo"]["Version"].as_u64()!=Some(643)||t.house_item_id/100_000!=205||t.room_slot>3||t.house_index>=128||t.floor_index>=128{return Err(BAD);}
 let r=room_value(root,t).ok_or(BAD)?;
 let walls=r["WallGridIDs"].as_object().filter(|m|m.len()==4).ok_or(BAD)?;
 let id=|v:&Value|v.as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(BAD);
 let mut ids=vec![id(&r["FloorGridID"])?];
 for i in 0..4{ids.push(id(walls.get(&i.to_string()).ok_or(BAD)?)?);}
 let unique:HashSet<_>=ids.iter().copied().collect();if unique.len()!=5{return Err(BAD);}
 let collection=&root["World"]["GridCollection"];
 let grids=collection["Grids"].as_object().ok_or(BAD)?;
 let diff=collection.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let mut paths=Vec::new();
 for n in &ids{
  let key=n.to_string();let g=grids.get(&key).ok_or(BAD)?;
  if diff.is_some_and(|m|m.contains_key(&key))||g["ID"].as_u64()!=Some(u64::from(*n))||
     g["GridDefaultLayoutPath"].as_str()!=Some("")||!matches!(g["TessellationFactor"].as_u64(),Some(1|2))||
     g["Objects"].as_object().is_none_or(|m|m.len()>5000)||
     g["NextGridObjectID"].as_u64().is_none_or(|n|n>u32::MAX as u64)||
     g.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ID"|"GridDataPath"|"GridDefaultLayoutPath"|"TessellationFactor"|"NextGridObjectID"|"Objects"))){return Err(BAD);}
  paths.push(g["GridDataPath"].as_str().ok_or(BAD)?);
 }
 let index=shapes.iter().position(|s|r["RoomPrefabAddress"].as_str()==Some(s.prefab.as_str())&&s.paths.iter().map(String::as_str).eq(paths.iter().copied())).ok_or(BAD)?;
 Ok((index,ids))
}
// In free-placement resize only, ordinary furniture records remain byte-exact
// at their existing anchors. This checks coordinate bounds, NOT footprint,
// terrain permissions or collision. Strict mode never uses this relaxation.
fn resize_door_changes(root:&Value,t:RoomFinishTarget,ids:&[u32],old:&Shape,next:&Shape,free:bool)->Option<Vec<(u32,String,i64,i64)>>{
 resize_door_changes_except(root,t,ids,old,next,free,&HashSet::new())
}
fn resize_door_changes_except(root:&Value,t:RoomFinishTarget,ids:&[u32],old:&Shape,next:&Shape,free:bool,skip:&HashSet<(u32,String)>)->Option<Vec<(u32,String,i64,i64)>>{
 let mut moves=Vec::new();
 for (i,n) in ids.iter().enumerate(){
  if old.paths[i]==next.paths[i]{continue;}
  let grid=&root["World"]["GridCollection"]["Grids"][n.to_string()];
  let objects=grid["Objects"].as_object()?;
  if objects.is_empty(){continue;}
  let structural=objects.values().any(|o|o["ItemID"].as_u64().is_some_and(|n|n/100000==403));
  let mut moving_key=None;
  let mut moving_anchor=None;
  if structural{
   if i==0||primary_house(root,t).is_none(){return None;}
   let item=if t.room_slot==0{
    let rooms=root["World"]["PlayerHouses"][t.house_index]["Floors"][t.floor_index]["Rooms"].as_object()?;
    if i==3{40300002}
    else{
     let slot=match i{1=>3,2=>2,4=>1,_=>return None};
     if !rooms.contains_key(&slot.to_string()){return None;}
     40300001
    }
   }else{
    if room_connection(t.room_slot)?.1+1!=i{return None;}
    40300001
   };
   let from=door_anchor(&old.paths[i])?;
   let to=door_anchor(&next.paths[i])?;
   let key=structural_door(grid,item,from,!free)?;
   moving_key=Some(key.clone());
   moving_anchor=Some((to,0));
   moves.push((*n,key,from,to));
  }
  if !free{
   if !structural{return None;}
   continue;
  }
  // The existing allocator validates every native object ID including zero.
  room_grid_next_object_id(grid).ok()?;
  let factor=grid["TessellationFactor"].as_i64()?;
  let (ox,oy)=*terrain_dimensions().get(&old.paths[i])?;
  let (nx,ny)=*terrain_dimensions().get(&next.paths[i])?;
  for (key,obj) in objects{
   if moving_key.as_ref()==Some(key)||skip.contains(&(*n,key.clone())){continue;}
   let item=obj["ItemID"].as_u64()?;
   if item/100000!=400{return None;}
   let (x,y)=(obj["X"].as_i64()?,obj["Y"].as_i64()?);
   let orientation=obj["Orientation"].as_str()?;
   if !EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&orientation)||x<0||y<0||x>=ox.min(nx)*factor||y>=oy.min(ny)*factor{return None;}
   // No ordinary record is moved, deleted, reparented or reserialized.
   // The recalculated door must not land on an existing anchor.
   if moving_anchor==Some((x,y)){return None;}
  }
 }
 Some(moves)
}
/// A strict option has no unverified ordinary geometry change. Free options
/// preserve all ordinary anchors and are separately identified to the user.
// Compute the exact ordinary objects whose anchors are outside the new
// raster. Recovery never deletes a stateful or unrecognized record.
fn shrink_pickups(root:&Value,ids:&[u32],old:&Shape,next:&Shape)->Option<Vec<(GridCoordinateTarget,(i32,i32),String)>>{
 let mut rows=Vec::new();
 let mut counts=std::collections::HashMap::<u64,u64>::new();
 for (i,gid) in ids.iter().enumerate(){
  if old.paths[i]==next.paths[i]{continue;}
  let g=&root["World"]["GridCollection"]["Grids"][gid.to_string()];
  let factor=g["TessellationFactor"].as_i64()?;
  let (ox,oy)=*terrain_dimensions().get(&old.paths[i])?;
  let (nx,ny)=*terrain_dimensions().get(&next.paths[i])?;
  if nx>=ox&&ny>=oy{continue;}
  room_grid_next_object_id(g).ok()?;
  for (key,o) in g["Objects"].as_object()?{
   let item=o["ItemID"].as_u64()?;
   // Structural doors are handled independently by the native resizer.
   if item/100000==403{continue;}
   let (x,y)=(o["X"].as_i64()?,o["Y"].as_i64()?);
   if x<0||y<0||x>=ox*factor||y>=oy*factor{return None;}
   if x<nx*factor&&y<ny*factor{continue;}
   let oid=key.parse::<u32>().ok()?;
   let orientation=o["Orientation"].as_str()?;
   if oid==0||item/100000!=400||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||o.get("State").is_some_and(|v|!v.is_null())||
      o.as_object()?.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")){return None;}
   let count=counts.entry(item).or_default();*count+=1;
   let stock=root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64()?;
   if stock.checked_add(*count)?>i32::MAX as u64{return None;}
   rows.push((GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.to_string(),object_id:key.clone(),item_id:item},(i32::try_from(x).ok()?,i32::try_from(y).ok()?),orientation.to_owned()));
   if rows.len()>2048{return None;}
  }
 }
 if rows.is_empty(){None}else{Some(rows)}
}
fn recovery_candidate(root:&Value,t:RoomFinishTarget,ids:&[u32],old:&Shape,next:&Shape)->Option<usize>{
 let rows=shrink_pickups(root,ids,old,next)?;
 let skipped=rows.iter().map(|(t,_,_)|Some((t.grid_id.parse::<u32>().ok()?,t.object_id.clone()))).collect::<Option<HashSet<_>>>()?;
 resize_door_changes_except(root,t,ids,old,next,true,&skipped)?;
 Some(rows.len())
}
pub fn room_resize_recovery_options(root:&Value,t:RoomFinishTarget)->Vec<(String,usize)>{
 let Ok(shapes)=shapes()else{return vec![];};let Ok((old,ids))=room_geometry(root,t,shapes)else{return vec![];};
 if !available(&shapes[old]){return vec![];}
 shapes.iter().enumerate().filter(|(i,s)|*i!=old&&available(s)).filter_map(|(_,s)|recovery_candidate(root,t,&ids,&shapes[old],s).map(|n|(s.name.clone(),n))).collect()
}
pub fn preview_room_resize_recover(source:&str,t:RoomFinishTarget,expected:&str,replacement:&str,expected_count:usize)->Result<GridCoordinateDraft,PatchError>{
 use crate::bulk_furniture::{BulkPickup,preview_bulk_furniture};
 validate_json_without_edit(source)?;
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let shapes=shapes()?;let (old,ids)=room_geometry(&root,t,shapes)?;
 let next=shapes.iter().find(|s|s.name==replacement&&available(s)).ok_or(BAD)?;
 if !available(&shapes[old])||shapes[old].name!=expected||expected==replacement{return Err(BAD);}
 // Exclude every external reference to the affected room grids before any
 // object recovery. The final resize performs the same independent check.
 let mut refs=root.clone();
 let r=refs.pointer_mut(&format!("/World/PlayerHouses/{}/Floors/{}/Rooms/{}",t.house_index,t.floor_index,t.room_slot)).and_then(Value::as_object_mut).ok_or(BAD)?;
 r.remove("FloorGridID");r.remove("WallGridIDs");
 if existing_grid_reference(&refs,&ids.iter().copied().collect(),false){return Err(BAD);}
 let rows=shrink_pickups(&root,&ids,&shapes[old],next).ok_or(BAD)?;
 if rows.len()!=expected_count{return Err(BAD);}
 let pickups=rows.iter().map(|(target,xy,orientation)|BulkPickup{target,expected:*xy,orientation}).collect::<Vec<_>>();
 let recovered=preview_bulk_furniture(source,&pickups,&[])?;
 // The intermediate result is never exported. Both stages must succeed.
 preview_room_resize_mode(&recovered.patched_json,t,expected,replacement,true)
}
pub fn room_resize_choices(root:&Value,t:RoomFinishTarget)->Option<(String,Vec<String>,Vec<String>)>{
 let shapes=shapes().ok()?;let (old,ids)=room_geometry(root,t,shapes).ok()?;
 if !available(&shapes[old]){return None;}
 let mut strict=Vec::new();let mut free=Vec::new();
 for (i,s) in shapes.iter().enumerate(){
  if i==old||!available(s){continue;}
  if resize_door_changes(root,t,&ids,&shapes[old],s,false).is_some(){strict.push(s.name.clone());}
  else if resize_door_changes(root,t,&ids,&shapes[old],s,true).is_some(){free.push(s.name.clone());}
 }
 if strict.is_empty()&&free.is_empty()&&room_resize_recovery_options(root,t).is_empty(){return None;}
 Some((shapes[old].name.clone(),strict,free))
}
pub fn room_resize_options(root:&Value,t:RoomFinishTarget)->Option<(String,Vec<String>)>{
 let (current,strict,_)=room_resize_choices(root,t)?;
 if strict.is_empty(){None}else{Some((current,strict))}
}
// Do not treat GridCollection or a GridObject counter as a Grid reference.
fn existing_grid_reference(v:&Value,ids:&HashSet<u32>,marked:bool)->bool{
 match v{
  Value::Object(m)=>m.iter().any(|(k,v)|{
   let key=k.to_ascii_lowercase();
   let grid_ref=key.split_once("grid").is_some_and(|(_,suffix)|suffix.contains("id")&&!suffix.starts_with("object"));
   let flag=marked||grid_ref&&!matches!(key.as_str(),"nextgridid"|"nextgridobjectid");
   existing_grid_reference(v,ids,flag)
  }),
  Value::Array(a)=>a.iter().any(|v|existing_grid_reference(v,ids,marked)),
  _=>marked&&v.as_u64().and_then(|n|u32::try_from(n).ok()).is_some_and(|n|ids.contains(&n))
 }
}
pub fn preview_room_resize(source:&str,t:RoomFinishTarget,expected:&str,replacement:&str)->Result<GridCoordinateDraft,PatchError>{
 preview_room_resize_mode(source,t,expected,replacement,false)
}
pub fn preview_room_resize_mode(source:&str,t:RoomFinishTarget,expected:&str,replacement:&str,free:bool)->Result<GridCoordinateDraft,PatchError>{
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let shapes=shapes()?;let (old,ids)=room_geometry(&root,t,shapes)?;
 let next=shapes.iter().find(|s|s.name==replacement).ok_or(BAD)?;
 if shapes[old].name!=expected||expected==replacement{return Err(BAD);}
 if !available(&shapes[old])||!available(next){return Err(BAD);}
 let door_moves=resize_door_changes(&root,t,&ids,&shapes[old],next,free).ok_or(BAD)?;
 // Ignore only this room's own five references; aliases from any other room,
 // support, history, mission, or other grid reference still block the edit.
 let mut refs=root.clone();
 let room_pointer=format!("/World/PlayerHouses/{}/Floors/{}/Rooms/{}",t.house_index,t.floor_index,t.room_slot);
 let room=refs.pointer_mut(&room_pointer).and_then(Value::as_object_mut).ok_or(BAD)?;
 room.remove("FloorGridID");room.remove("WallGridIDs");
 if existing_grid_reference(&refs,&ids.iter().copied().collect(),false){return Err(BAD);}
 let mut edits:Vec<(Vec<Segment>,Option<Value>,Value)>=Vec::new();
 let mut path=room_path(t);path.push(k("RoomPrefabAddress"));
 edits.push((path,Some(json!(shapes[old].prefab)),json!(next.prefab)));
 root.pointer_mut(&room_pointer).ok_or(BAD)?["RoomPrefabAddress"]=json!(next.prefab);
 for (i,n) in ids.iter().enumerate(){
  let grid=&mut root["World"]["GridCollection"]["Grids"][n.to_string()];
  if grid["GridDataPath"].as_str()!=Some(next.paths[i].as_str()){
   edits.push((vec![k("World"),k("GridCollection"),k("Grids"),k(&n.to_string()),k("GridDataPath")],Some(grid["GridDataPath"].clone()),json!(next.paths[i])));
   grid["GridDataPath"]=json!(next.paths[i]);
  }
 }
 for (gid,key,from,to) in door_moves{
  if from==to{continue;}
  let grid=&mut root["World"]["GridCollection"]["Grids"][gid.to_string()];
  edits.push((vec![k("World"),k("GridCollection"),k("Grids"),k(&gid.to_string()),k("Objects"),k(&key),k("X")],Some(json!(from)),json!(to)));
  grid["Objects"][key]["X"]=json!(to);
 }
 // The native purchased-size record is independent of the geometry. Preserve
 // all previously purchased sizes and add only the selected new path.
 let floor=&mut root["World"]["PlayerHouses"][t.house_index]["Floors"][t.floor_index];
 let slot=t.room_slot.to_string();let mut bp=vec![k("World"),k("PlayerHouses"),Segment::Index(t.house_index),k("Floors"),Segment::Index(t.floor_index),k("BoughtRooms")];
 let entry=json!({"GridDataPaths":[next.paths[0]]});
 if floor.get("BoughtRooms").is_none(){
  let mut m=serde_json::Map::new();m.insert(slot.clone(),entry.clone());let value=Value::Object(m);
  edits.push((bp,None,value.clone()));floor["BoughtRooms"]=value;
 }else{
  let bought=floor["BoughtRooms"].as_object_mut().ok_or(BAD)?;
  bp.push(k(&slot));
  if let Some(record)=bought.get_mut(&slot){
   let paths=record.get_mut("GridDataPaths").and_then(Value::as_array_mut).filter(|a|a.len()<128&&a.iter().all(|p|p.as_str().is_some_and(|s|s.starts_with("GridData/Rooms/Room")&&s.ends_with(".json")&&s.len()<256))).ok_or(BAD)?;
   if !paths.iter().any(|p|p.as_str()==Some(next.paths[0].as_str())){
    let old=Value::Array(paths.clone());paths.push(json!(next.paths[0]));bp.push(k("GridDataPaths"));edits.push((bp,Some(old),Value::Array(paths.clone())));
   }
  }else{edits.push((bp,None,entry.clone()));bought.insert(slot,entry);}
 }
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 for (p,old,_) in &edits{locator.capture.insert(p.clone(),None);if old.is_none(){locator.capture.insert(p[..p.len()-1].to_vec(),None);}}
 locator.walk_complete()?;
 let mut replacements=Vec::new();
 for(p,old,new)in edits{
  let found=locator.capture.get(&p).and_then(|v|v.clone());
  let encoded=serde_json::to_string(&new).map_err(|_|BAD)?;
  if let Some(old)=old{let span=found.ok_or(BAD)?;if serde_json::from_str::<Value>(&source[span.clone()]).map_err(|_|BAD)?!=old{return Err(BAD);}replacements.push((span,encoded));}
  else{
   if found.is_some(){return Err(BAD);}
   let span=locator.capture.get(&p[..p.len()-1]).and_then(|v|v.clone()).ok_or(BAD)?;
   let map:serde_json::Map<String,Value>=serde_json::from_str(&source[span.clone()]).map_err(|_|BAD)?;
   let Segment::Key(key)=p.last().ok_or(BAD)? else{return Err(BAD);};
   if map.contains_key(key){return Err(BAD);}
   replacements.push((span.end-1..span.end-1,format!("{}{}:{}",if map.is_empty(){""}else{","},serde_json::to_string(key).map_err(|_|BAD)?,encoded)));
  }
 }
 replacements.sort_unstable_by_key(|(r,_)|r.start);
 let mut out=String::new();let mut last=0;
 for(r,v)in replacements{if r.start<last{return Err(BAD);}out.push_str(&source[last..r.start]);out.push_str(&v);last=r.end;}
 out.push_str(&source[last..]);
 if out.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&out).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(GridCoordinateDraft{patched_json:out,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}
/// The observed native upper-floor initial layout is one 3x3 center room,
/// four walls, and the elevator on wall 2. This path appends only to the
/// ordinary primary house. The native 20-floor cap is retained by default;
/// explicitly requested experimental copies may use the editor's 128 bound.
pub fn primary_floor_count(root:&Value,house_index:usize,house_item_id:u32)->Option<usize>{
 if root["GameInfo"]["Version"].as_u64()!=Some(643)||house_item_id!=20500000||house_index!=0{return None;}
 let house=root["World"]["PlayerHouses"].as_array()?.get(house_index)?;
 if house["HouseItemID"].as_u64()!=Some(20500000)||house["InitialRoomGridLayoutPath"].as_str()!=Some(""){return None;}
 let floors=house["Floors"].as_array()?;
 if floors.is_empty()||floors.len()>=128||floors.iter().any(|f|f["Rooms"].as_object().is_none_or(|r|!r.contains_key("0")||r.len()>4||r.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3")))){return None;}
 Some(floors.len())
}
pub fn preview_append_primary_floor(source:&str,house_index:usize,house_item_id:u32,expected_count:usize)->Result<GridCoordinateDraft,PatchError>{
 preview_append_primary_floors(source,house_index,house_item_id,expected_count,1,false)
}
pub fn preview_append_primary_floors(source:&str,house_index:usize,house_item_id:u32,expected_count:usize,count:usize,extended:bool)->Result<GridCoordinateDraft,PatchError>{
 // AddPlayerHouseFloor.ApplyThis 0x467830F rejects house indices >0;
 // the elevator list loops over the saved floor count at 0x6902CD3..0x6902CDA.
 // Above-native-limit copies are explicitly experimental, not runtime proven.
 let target=expected_count.checked_add(count).filter(|n|*n<=128).ok_or(BAD)?;
 if count==0||extended!=(target>20){return Err(BAD);}
 use crate::support_clone::{checked_grid_allocator,grid_capacity,reserved_ref};
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 if primary_floor_count(&root,house_index,house_item_id)!=Some(expected_count){return Err(BAD);}
 let shape=shapes()?.iter().find(|s|s.name=="3x3").filter(|s|available(s)).ok_or(BAD)?;
 let collection=root["World"]["GridCollection"].as_object().ok_or(BAD)?;
 let fresh=checked_grid_allocator(collection)?;
 let grid_count=count.checked_mul(5).ok_or(BAD)?;
 let next=fresh.checked_add(u32::try_from(grid_count).map_err(|_|BAD)?).ok_or(BAD)?;
 if !grid_capacity(collection["Grids"].as_object().ok_or(BAD)?,collection.get("DiffGrids").and_then(Value::as_object),grid_count)||
    reserved_ref(&root,&(fresh..next).collect(),false){return Err(BAD);}
 let mut members=serde_json::Map::new();let mut new_floors=Vec::new();
 for fi in 0..count{
 let start=fresh+5*fi as u32;
 for (i,path) in shape.paths.iter().enumerate(){
  let id=start+i as u32;
  let objects=if i==3{json!({"0":{"ID":0,"ItemID":40300002,"X":2,"Y":0,"Orientation":"GridOrientation_Down","State":null}})}else{json!({})};
  members.insert(id.to_string(),json!({"ID":id,"GridDataPath":path,"GridDefaultLayoutPath":"","TessellationFactor":2,"Objects":objects,"NextGridObjectID":if i==3{1}else{0}}));
 }
 let floor=json!({"Rooms":{"0":{"Name":"","FloorGridID":start,"WallGridIDs":{"0":start+1,"1":start+2,"2":start+3,"3":start+4},"RoomPrefabAddress":shape.prefab,"Flooring":160100000,"Wallpapers":{"0":160000000,"1":160000000,"2":160000000,"3":160000000},"WallpaperOffsetById":{},"Ceiling":160100136}},"BoughtRooms":{"0":{"GridDataPaths":[shape.paths[0]]}}});
 new_floors.push(floor);
 }
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];
 let cp=vec![k("World"),k("GridCollection"),k("NextGridID")];
 let fp=vec![k("World"),k("PlayerHouses"),Segment::Index(house_index),k("Floors")];
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 for path in [&gp,&cp,&fp]{locator.capture.insert(path.clone(),None);}
 locator.walk_complete()?;
 let span=|path:&Vec<Segment>|locator.capture.get(path).and_then(|r|r.clone()).ok_or(BAD);
 let gr=span(&gp)?;let cr=span(&cp)?;let fr=span(&fp)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(fresh){return Err(BAD);}
 let old_grids=collection["Grids"].as_object().ok_or(BAD)?;
 let grid_text=members.iter().map(|(k,v)|format!("{}:{}",serde_json::to_string(k).expect("string"),v)).collect::<Vec<_>>().join(",");
 let mut patches=[(gr.end-1..gr.end-1,format!("{}{}",if old_grids.is_empty(){""}else{","},grid_text)),(cr,next.to_string()),(fr.end-1..fr.end-1,format!(",{}",new_floors.iter().map(Value::to_string).collect::<Vec<_>>().join(",")))];
 patches.sort_unstable_by_key(|(r,_)|r.start);
 let mut result=String::new();let mut last=0;
 for (range,value) in patches{if range.start<last{return Err(BAD);}result.push_str(&source[last..range.start]);result.push_str(&value);last=range.end;}
 result.push_str(&source[last..]);
 root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?.extend(members);
 root["World"]["GridCollection"]["NextGridID"]=json!(next);
 root["World"]["PlayerHouses"][house_index]["Floors"].as_array_mut().ok_or(BAD)?.extend(new_floors);
 if result.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&result).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(GridCoordinateDraft{patched_json:result,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

// Source-observed reciprocal walls and factor-2 door anchors.
fn room_connection(slot:u8)->Option<(usize,usize)>{
 match slot{1=>Some((3,1)),2=>Some((1,3)),3=>Some((0,2)),_=>None}
}
// Steam 1.26.2 native ManagePlayerHouseRoom.ApplyThis (RVA 0x466E280,
// door centering at 0x466FFB7..0x466FFD2) and AddPlayerHouseFloor.ApplyThis
// (0x4678B06..0x4678B20): X = grid.Size.X/2 - item.GridArea.SizeX*factor/2.
// The factor-2 default door/elevator width of 4 native cells is independently
// corroborated by observed 20/24-width door and 6/24-width elevator records.
// Only original HouseExpansion paths and verified raster coverage are used.
fn door_anchor(path:&str)->Option<i64>{
 let width=path.strip_prefix("GridData/Rooms/Wall")?.strip_suffix("x9-GridData.json")?.parse::<i64>().ok()?;
 if ![6,8,12,16,20,24].contains(&width){return None;}
 Some(width-4)
}
pub fn room_add_sizes()->Vec<String>{
 shapes().map(|s|s.iter().filter(|s|available(s)&&s.paths[1..].iter().all(|p|door_anchor(p).is_some())).map(|s|s.name.clone()).collect()).unwrap_or_default()
}
fn addition_target(root:&Value,t:RoomFinishTarget,slot:u8)->Option<(u32,u32,i64,usize)>{
 if t.room_slot!=0||t.house_item_id!=20500000||root["GameInfo"]["Version"].as_u64()!=Some(643){return None;}
 let h=root["World"]["PlayerHouses"].as_array()?.get(t.house_index)?;
 if h["HouseItemID"].as_u64()!=Some(20500000)||h["InitialRoomGridLayoutPath"].as_str()!=Some(""){return None;}
 let floor=h["Floors"].as_array()?.get(t.floor_index)?;
 let rooms=floor["Rooms"].as_object()?;
 if rooms.len()>=4||rooms.contains_key(&slot.to_string())||rooms.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3")){return None;}
 if let Some(bought)=floor.get("BoughtRooms"){bought.as_object()?;}
 let (parent_wall,child_wall)=room_connection(slot)?;
 let (shape,ids)=room_geometry(root,t,shapes().ok()?).ok()?;
 let gid=ids[parent_wall+1];
 let g=&root["World"]["GridCollection"]["Grids"][gid.to_string()];
 if g["TessellationFactor"].as_u64()!=Some(2)||!g["Objects"].as_object()?.is_empty(){return None;}
 let anchor=door_anchor(&shapes().ok()?[shape].paths[parent_wall+1])?;
 let counter=g["NextGridObjectID"].as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n<u32::MAX-1)?;
 Some((gid,counter,anchor,child_wall))
}
pub fn room_add_slots(root:&Value,t:RoomFinishTarget)->Vec<u8>{
 (1..=3).filter(|slot|addition_target(root,t,*slot).is_some()).collect()
}
pub fn preview_add_primary_room(source:&str,t:RoomFinishTarget,slot:u8,size:&str)->Result<GridCoordinateDraft,PatchError>{
 use crate::support_clone::{checked_grid_allocator,grid_capacity,reserved_ref};
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let (gid,counter,anchor,child_wall)=addition_target(&root,t,slot).ok_or(BAD)?;
 let shape=shapes()?.iter().find(|s|s.name==size&&available(s)&&s.paths[1..].iter().all(|p|door_anchor(p).is_some())).ok_or(BAD)?;
 let child_anchor=door_anchor(&shape.paths[child_wall+1]).ok_or(BAD)?;
 let mut refs=root.clone();
 *refs.pointer_mut(&format!("/World/PlayerHouses/{}/Floors/{}/Rooms/0/WallGridIDs/{}",t.house_index,t.floor_index,room_connection(slot).ok_or(BAD)?.0)).ok_or(BAD)?=Value::Null;
 if existing_grid_reference(&refs,&[gid].into_iter().collect(),false){return Err(BAD);}
 let collection=root["World"]["GridCollection"].as_object().ok_or(BAD)?;
 let fresh=checked_grid_allocator(collection)?;
 let next=fresh.checked_add(5).ok_or(BAD)?;
 if !grid_capacity(collection["Grids"].as_object().ok_or(BAD)?,collection.get("DiffGrids").and_then(Value::as_object),5)||reserved_ref(&root,&(fresh..next).collect(),false){return Err(BAD);}
 let oid=counter.max(1);let object_next=oid.checked_add(1).ok_or(BAD)?;
 // Conservative reference check for a fresh object in the existing wall.
 fn mentions(v:&Value,gid:u32,oid:u32)->bool{
  match v{Value::Object(m)=>((m.get("GridID").and_then(Value::as_u64)==Some(gid as u64))&&m.iter().any(|(k,v)|matches!(k.as_str(),"GridObjectID"|"ObjectID")&&v.as_u64()==Some(oid as u64)))||m.values().any(|v|mentions(v,gid,oid)),Value::Array(a)=>a.iter().any(|v|mentions(v,gid,oid)),_=>false}
 }
 if mentions(&root,gid,oid){return Err(BAD);}
 let door=|id:u32,x:i64|json!({"ID":id,"ItemID":40300001,"X":x,"Y":0,"Orientation":"GridOrientation_Down","State":null});
 let mut members=serde_json::Map::new();
 for (i,path) in shape.paths.iter().enumerate(){
  let id=fresh+i as u32;let has_door=i==child_wall+1;
  members.insert(id.to_string(),json!({"ID":id,"GridDataPath":path,"GridDefaultLayoutPath":"","TessellationFactor":2,"Objects":if has_door{json!({"0":door(0,child_anchor)})}else{json!({})},"NextGridObjectID":if has_door{1}else{0}}));
 }
 let room=json!({"Name":"","FloorGridID":fresh,"WallGridIDs":{"0":fresh+1,"1":fresh+2,"2":fresh+3,"3":fresh+4},"RoomPrefabAddress":shape.prefab,"Flooring":160100000,"Wallpapers":{"0":160000000,"1":160000000,"2":160000000,"3":160000000},"WallpaperOffsetById":{},"Ceiling":160100136});
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];
 let cp=vec![k("World"),k("GridCollection"),k("NextGridID")];
 let mut op=gp.clone();op.extend([k(&gid.to_string()),k("Objects")]);
 let mut oc=gp.clone();oc.extend([k(&gid.to_string()),k("NextGridObjectID")]);
 let fp=vec![k("World"),k("PlayerHouses"),Segment::Index(t.house_index),k("Floors"),Segment::Index(t.floor_index)];
 let mut rp=fp.clone();rp.push(k("Rooms"));
 let mut bp=fp.clone();bp.push(k("BoughtRooms"));
 let slot_key=slot.to_string();let mut ap=bp.clone();ap.extend([k(&slot_key),k("GridDataPaths")]);
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 for path in [&gp,&cp,&op,&oc,&fp,&rp,&bp,&ap]{locator.capture.insert(path.clone(),None);}
 locator.walk_complete()?;
 let span=|path:&Vec<Segment>|locator.capture.get(path).and_then(|r|r.clone()).ok_or(BAD);
 let gr=span(&gp)?;let cr=span(&cp)?;let or=span(&op)?;let ocr=span(&oc)?;let rr=span(&rp)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(fresh)||source[ocr.clone()].parse::<u32>().ok()!=Some(counter){return Err(BAD);}
 let grid_text=members.iter().map(|(k,v)|format!("\"{}\":{}",k,v)).collect::<Vec<_>>().join(",");
 let new_door=door(oid,anchor);
 let mut patches=vec![(gr.end-1..gr.end-1,format!(",{}",grid_text)),(cr,next.to_string()),(or.end-1..or.end-1,format!("\"{}\":{}",oid,new_door)),(ocr,object_next.to_string()),(rr.end-1..rr.end-1,format!(",\"{}\":{}",slot,room))];
 let floor=&mut root["World"]["PlayerHouses"][t.house_index]["Floors"][t.floor_index];
 let entry=json!({"GridDataPaths":[shape.paths[0]]});
 if let Some(bought)=floor.get_mut("BoughtRooms"){
  let bm=bought.as_object_mut().ok_or(BAD)?;
  if let Some(old)=bm.get_mut(&slot_key){
   let a=old["GridDataPaths"].as_array_mut().filter(|a|a.len()<128&&a.iter().all(Value::is_string)).ok_or(BAD)?;
   if !a.iter().any(|v|v.as_str()==Some(shape.paths[0].as_str())){
    let ar=span(&ap)?;
    patches.push((ar.end-1..ar.end-1,format!("{}{}",if a.is_empty(){""}else{","},json!(shape.paths[0]))));
    a.push(json!(shape.paths[0]));
   }
  }else{
   let br=span(&bp)?;
   patches.push((br.end-1..br.end-1,format!("{}\"{}\":{}",if bm.is_empty(){""}else{","},slot,entry)));
   bm.insert(slot_key.clone(),entry);
  }
 }else{
  let mut bm=serde_json::Map::new();bm.insert(slot_key.clone(),entry);
  let bought=Value::Object(bm);let fr=span(&fp)?;
  patches.push((fr.end-1..fr.end-1,format!(",\"BoughtRooms\":{}",bought)));
  floor["BoughtRooms"]=bought;
 }
 floor["Rooms"].as_object_mut().ok_or(BAD)?.insert(slot_key,room);
 let g=&mut root["World"]["GridCollection"]["Grids"][gid.to_string()];
 g["Objects"].as_object_mut().ok_or(BAD)?.insert(oid.to_string(),new_door);
 g["NextGridObjectID"]=json!(object_next);
 root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?.extend(members);
 root["World"]["GridCollection"]["NextGridID"]=json!(next);
 patches.sort_unstable_by_key(|(r,_)|r.start);
 let mut out=String::new();let mut last=0;
 for (range,value) in patches{if range.start<last{return Err(BAD);}out.push_str(&source[last..range.start]);out.push_str(&value);last=range.end;}
 out.push_str(&source[last..]);
 if out.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&out).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(GridCoordinateDraft{patched_json:out,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

fn removable_room_record(r:&Value)->bool{
 r.as_object().is_some_and(|m|m.keys().all(|k|matches!(k.as_str(),"Name"|"FloorGridID"|"WallGridIDs"|"RoomPrefabAddress"|"Flooring"|"Wallpapers"|"WallpaperOffsetById"|"Ceiling")))
}
fn structural_door(g:&Value,item:u64,x:i64,only:bool)->Option<String>{
 if g["TessellationFactor"].as_u64()!=Some(2){return None;}
 let objects=g["Objects"].as_object()?;
 if only&&objects.len()!=1{return None;}
 let mut candidates=objects.iter().filter(|(_,o)|o["ItemID"].as_u64().is_some_and(|n|n/100000==403));
 let (key,o)=candidates.next()?;
 if candidates.next().is_some(){return None;}
 let oid=key.parse::<u32>().ok()?;
 if key!=&oid.to_string()||o["ID"].as_u64()!=Some(oid as u64)||o["ItemID"].as_u64()!=Some(item)||o["X"].as_i64()!=Some(x)||o["Y"].as_i64()!=Some(0)||o["Orientation"].as_str()!=Some("GridOrientation_Down")||
   o.get("State").is_some_and(|v|!v.is_null())||o.as_object()?.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
   g["NextGridObjectID"].as_u64().is_none_or(|n|n<=oid as u64){return None;}
 Some(key.clone())
}
fn primary_house(root:&Value,t:RoomFinishTarget)->Option<&Value>{
 if root["GameInfo"]["Version"].as_u64()!=Some(643)||t.house_item_id!=20500000{return None;}
 let h=root["World"]["PlayerHouses"].as_array()?.get(t.house_index)?;
 if h["HouseItemID"].as_u64()!=Some(20500000)||h["InitialRoomGridLayoutPath"].as_str()!=Some(""){return None;}
 Some(h)
}
struct Removal{ids:Vec<u32>,parent:Option<(u32,String)>,pickups:Vec<(GridCoordinateTarget,(i32,i32),String)>}
fn removal_target(root:&Value,t:RoomFinishTarget,whole_floor:bool,recover:bool)->Option<Removal>{
 let h=primary_house(root,t)?;
 let floors=h["Floors"].as_array()?;
 let floor=floors.get(t.floor_index)?;
 let rooms=floor["Rooms"].as_object()?;
 if !rooms.contains_key("0")||rooms.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3")){return None;}
 let catalog=shapes().ok()?;
 let grids=root["World"]["GridCollection"]["Grids"].as_object()?;
 let center=RoomFinishTarget{room_slot:0,..t};
 let (ci,cids)=room_geometry(root,center,catalog).ok()?;
 let (slots,parent)=if whole_floor{
  if t.room_slot!=0||floors.len()<2||t.floor_index+1!=floors.len()||floor.as_object()?.keys().any(|k|!matches!(k.as_str(),"Rooms"|"BoughtRooms")){return None;}
  if let Some(b)=floor.get("BoughtRooms"){let b=b.as_object()?;if b.values().any(|v|v.as_object().is_none_or(|m|m.len()!=1)||v["GridDataPaths"].as_array().is_none_or(|a|a.iter().any(|v|!v.is_string()))){return None;}}
  (rooms.keys().map(|k|k.parse::<u8>().ok()).collect::<Option<Vec<_>>>()?,None)
 }else{
  let (pw,_)=room_connection(t.room_slot)?;
  let gid=cids[pw+1];
  let key=structural_door(grids.get(&gid.to_string())?,40300001,door_anchor(&catalog[ci].paths[pw+1])?,false)?;
  (vec![t.room_slot],Some((gid,key)))
 };
 let mut ids=Vec::new();let mut pickups=Vec::new();let mut counts=std::collections::HashMap::<u64,u64>::new();
 for slot in slots{
  let target=RoomFinishTarget{room_slot:slot,..t};
  if !removable_room_record(room_value(root,target)?){return None;}
  let (si,room_ids)=room_geometry(root,target,catalog).ok()?;
  if !available(&catalog[si]){return None;}
  for (i,gid) in room_ids.into_iter().enumerate(){
   if ids.contains(&gid)||parent.as_ref().is_some_and(|(g,_)|*g==gid){return None;}
   ids.push(gid);
   let g=grids.get(&gid.to_string())?;
   let door=if slot==0{
    if i==3{Some(40300002)}else if i>0&&[3u8,2,0,1][i-1]!=0&&rooms.contains_key(&[3u8,2,0,1][i-1].to_string()){Some(40300001)}else{None}
   }else if i==room_connection(slot)?.1+1{Some(40300001)}else{None};
   let protected=if let Some(item)=door{Some(structural_door(g,item,door_anchor(&catalog[si].paths[i])?,!recover)?)}else{None};
   let objects=g["Objects"].as_object()?;
   if !recover{
    if objects.len()!=usize::from(protected.is_some()){return None;}
    continue;
   }
   room_grid_next_object_id(g).ok()?;
   for (key,o) in objects{
    if protected.as_ref()==Some(key){continue;}
    let item=o["ItemID"].as_u64()?;
    let oid=key.parse::<u32>().ok()?;
    let orientation=o["Orientation"].as_str()?;
    if oid==0||item/100000!=400||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||o.get("State").is_some_and(|v|!v.is_null())||o.as_object()?.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")){return None;}
    let x=i32::try_from(o["X"].as_i64()?).ok()?;let y=i32::try_from(o["Y"].as_i64()?).ok()?;
    let count=counts.entry(item).or_default();*count+=1;
    let stock=root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64()?;
    if stock.checked_add(*count)?>i32::MAX as u64{return None;}
    pickups.push((GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.to_string(),object_id:key.clone(),item_id:item},(x,y),orientation.to_owned()));
    if pickups.len()>2048{return None;}
   }
  }
 }
 Some(Removal{ids,parent,pickups})
}
pub fn room_removal_offer(root:&Value,t:RoomFinishTarget)->Option<(&'static str,usize)>{
 let floor=t.room_slot==0;
 if let Some(plan)=removal_target(root,t,floor,false){return Some((if floor{"floor"}else{"room"},plan.pickups.len()));}
 let plan=removal_target(root,t,floor,true)?;
 if plan.pickups.is_empty(){return None;}
 Some((if floor{"floor"}else{"room"},plan.pickups.len()))
}
pub fn room_removal_kind(root:&Value,t:RoomFinishTarget)->Option<&'static str>{
 removal_target(root,t,t.room_slot==0,false).map(|_|if t.room_slot==0{"floor"}else{"room"})
}
pub fn preview_remove_primary_room_recover(source:&str,t:RoomFinishTarget,whole_floor:bool,count:usize)->Result<GridCoordinateDraft,PatchError>{
 use crate::bulk_furniture::{BulkPickup,preview_bulk_furniture};
 validate_json_without_edit(source)?;
 if count==0||count>2048{return Err(BAD);}
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let plan=removal_target(&root,t,whole_floor,true).ok_or(BAD)?;
 if plan.pickups.len()!=count{return Err(BAD);}
 let rows=plan.pickups.iter().map(|(target,xy,orientation)|BulkPickup{target,expected:*xy,orientation}).collect::<Vec<_>>();
 let staged=preview_bulk_furniture(source,&rows,&[])?;
 preview_remove_primary_room(&staged.patched_json,t,whole_floor)
}
pub fn preview_remove_primary_room(source:&str,t:RoomFinishTarget,whole_floor:bool)->Result<GridCoordinateDraft,PatchError>{
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let removal=removal_target(&root,t,whole_floor,false).ok_or(BAD)?;
 let ids:HashSet<_>=removal.ids.iter().copied().collect();
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];
 let fp=vec![k("World"),k("PlayerHouses"),Segment::Index(t.house_index),k("Floors")];
 let mut rp=fp.clone();rp.extend([Segment::Index(t.floor_index),k("Rooms")]);
 let mut out=source.to_owned();
 if whole_floor{
  let mut locator=JsonLocator::new(&out,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
  locator.amount_path=vec![Segment::Index(usize::MAX)];
  let mut last=fp.clone();last.push(Segment::Index(t.floor_index));
  let mut prior=fp.clone();prior.push(Segment::Index(t.floor_index-1));
  locator.capture.insert(last.clone(),None);locator.capture.insert(prior.clone(),None);locator.walk_complete()?;
  let a=locator.capture.get(&prior).and_then(|v|v.clone()).ok_or(BAD)?;
  let b=locator.capture.get(&last).and_then(|v|v.clone()).ok_or(BAD)?;
  let separator=&out[a.end..b.start];if separator.trim()!=","{return Err(BAD);}
  out.replace_range(a.end..b.end,"");
  root["World"]["PlayerHouses"][t.house_index]["Floors"].as_array_mut().ok_or(BAD)?.pop();
 }else{
  out=room_lexical_map_edit(&out,rp,&t.room_slot.to_string(),None)?;
  root["World"]["PlayerHouses"][t.house_index]["Floors"][t.floor_index]["Rooms"].as_object_mut().ok_or(BAD)?.remove(&t.room_slot.to_string());
 }
 for gid in &removal.ids{
  out=room_lexical_map_edit(&out,gp.clone(),&gid.to_string(),None)?;
  root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?.remove(&gid.to_string());
 }
 if existing_grid_reference(&root,&ids,false){return Err(BAD);}
 if let Some((gid,key))=removal.parent{
  // Only the one verified connecting door is removed. Preserve the wall
  // counter, all other objects, and reject other grid references.
  let mut refs=root.clone();
  let pw=room_connection(t.room_slot).ok_or(BAD)?.0;
  *refs.pointer_mut(&format!("/World/PlayerHouses/{}/Floors/{}/Rooms/0/WallGridIDs/{}",t.house_index,t.floor_index,pw)).ok_or(BAD)?=Value::Null;
  if existing_grid_reference(&refs,&[gid].into_iter().collect(),false){return Err(BAD);}
  let mut op=gp.clone();op.extend([k(&gid.to_string()),k("Objects")]);
  out=room_lexical_map_edit(&out,op,&key,None)?;
  root["World"]["GridCollection"]["Grids"][gid.to_string()]["Objects"].as_object_mut().ok_or(BAD)?.remove(&key);
 }
 if out.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&out).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(GridCoordinateDraft{patched_json:out,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn resize_empty_room_retains_ids_and_bought_sizes(){
  let all=shapes().unwrap();let s=all.iter().find(|r|r.name=="6x6").unwrap();
  let grids:serde_json::Map<String,Value>=s.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":1,"NextGridObjectID":0,"Objects":{}}))).collect();
  let raw=json!({"GameInfo":{"Version":643},"Player":{"Other":17},"World":{"PlayerHouses":[{"HouseItemID":20500002,"Floors":[{"Rooms":{"0":{"Name":"Library","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":s.prefab,"Flooring":160100001,"Wallpapers":{"0":160000001},"Unknown":7}},"BoughtRooms":{"0":{"GridDataPaths":[s.paths[0]]}}}]}],"GridCollection":{"Grids":grids,"NextGridID":99}}});
  let target=RoomFinishTarget{house_index:0,house_item_id:20500002,floor_index:0,room_slot:0};
  let d=preview_room_resize(&raw.to_string(),target,"6x6","10x12").unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(room_value(&v,target).unwrap()["FloorGridID"],10);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["GridDataPath"],"GridData/Rooms/Room20x24-GridData.json");
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][0]["BoughtRooms"]["0"]["GridDataPaths"],json!([s.paths[0],"GridData/Rooms/Room20x24-GridData.json"]));
  assert_eq!(room_value(&v,target).unwrap()["Unknown"],7);assert_eq!(v["Player"],raw["Player"]);
  let mut b=raw.clone();b["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]=json!({"ID":1});assert!(preview_room_resize(&b.to_string(),target,"6x6","10x12").is_err());
  let mut b=raw.clone();b["World"]["GridCollection"]["Grids"]["11"]["TessellationFactor"]=json!(2);b["World"]["GridCollection"]["Grids"]["11"]["Objects"]["0"]=json!({"ID":0,"ItemID":40300001});assert!(preview_room_resize(&b.to_string(),target,"6x6","6x8").is_ok());assert!(preview_room_resize(&b.to_string(),target,"6x6","10x12").is_err());
  let mut b=raw.clone();b["World"]["Alias"]=json!({"FloorGridID":10});assert!(preview_room_resize(&b.to_string(),target,"6x6","10x12").is_err());
  assert!(preview_room_resize(&raw.to_string(),target,"6x6","8x3").is_err());
  let mut b=raw.clone();b["World"]["GridCollection"]["Grids"]["10"]["NextGridObjectID"]=json!(11);assert!(preview_room_resize(&b.to_string(),target,"6x6","10x12").is_ok());
  let mut b=raw.clone();b["World"]["PlayerHouses"][0]["Floors"][0].as_object_mut().unwrap().remove("BoughtRooms");
  let d=preview_room_resize(&b.to_string(),target,"6x6","10x12").unwrap();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap()["World"]["PlayerHouses"][0]["Floors"][0]["BoughtRooms"]["0"]["GridDataPaths"],json!(["GridData/Rooms/Room20x24-GridData.json"]));
 }
 #[test]fn append_native_floor_preserves_source_and_allocates_fresh_grids(){
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Original","FloorGridID":10}}}]}],"GridCollection":{"NextGridID":30,"Grids":{"10":{"ID":10,"Unknown":7}}}},"Player":{"Currency":123}});
  let d=preview_append_primary_floor(&raw.to_string(),0,20500000,1).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][0],raw["World"]["PlayerHouses"][0]["Floors"][0]);
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][1]["Rooms"]["0"]["FloorGridID"],30);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["33"]["Objects"]["0"]["ItemID"],40300002);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["33"]["Objects"]["0"]["X"],2);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],35);assert_eq!(v["Player"],raw["Player"]);
  assert!(preview_append_primary_floor(&v.to_string(),0,20500000,1).is_err());
  assert!(preview_append_primary_floor(&v.to_string(),0,20500000,2).is_ok());
  let mut bad=raw.clone();bad["World"]["Alias"]=json!({"GridID":31});assert!(preview_append_primary_floor(&bad.to_string(),0,20500000,1).is_err());
 }
 #[test]fn append_room_builds_both_doors_and_retains_other_state(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="12x12").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}}))).collect();
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}},"BoughtRooms":{"1":{"GridDataPaths":["GridData/Rooms/Room6x6-GridData.json"]}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"Currency":17}});
  let t=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:0,room_slot:0};
  for (slot,parent,child) in [(1,14,92),(2,12,94),(3,11,93)]{
   let d=preview_add_primary_room(&raw.to_string(),t,slot,"10x10").unwrap();
   let v:Value=serde_json::from_str(&d.patched_json).unwrap();
   assert_eq!(v["World"]["GridCollection"]["Grids"][parent.to_string()]["Objects"]["1"]["X"],20);
   assert_eq!(v["World"]["GridCollection"]["Grids"][child.to_string()]["Objects"]["0"]["X"],16);
   assert_eq!(v["World"]["GridCollection"]["NextGridID"],95);
   assert_eq!(v["Player"],raw["Player"]);
   assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]["0"],raw["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]["0"]);
   assert!(preview_add_primary_room(&v.to_string(),t,slot,"10x10").is_err());
  }
  let mut bad=raw.clone();bad["World"]["GridCollection"]["Grids"]["14"]["Objects"]["1"]=json!({"ID":1});assert!(preview_add_primary_room(&bad.to_string(),t,1,"10x10").is_err());
  let mut bad=raw.clone();bad["World"]["Alias"]=json!({"GridID":14});assert!(preview_add_primary_room(&bad.to_string(),t,1,"10x10").is_err());
  assert!(preview_add_primary_room(&raw.to_string(),t,1,"8x3").is_err());
  for size in room_add_sizes(){assert!(preview_add_primary_room(&raw.to_string(),t,1,&size).is_ok(),"{size}");}
 }
 #[test]fn remove_appended_room_and_floor_preserves_allocator_and_purchase_history(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="12x12").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}}))).collect();
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"Currency":17}});
  let center=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:0,room_slot:0};
  let added=preview_add_primary_room(&raw.to_string(),center,1,"10x10").unwrap().patched_json;
  let target=RoomFinishTarget{room_slot:1,..center};
  let d=preview_remove_primary_room(&added,target,false).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"],raw["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],95);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["14"]["NextGridObjectID"],2);
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][0]["BoughtRooms"]["1"]["GridDataPaths"],json!(["GridData/Rooms/Room20x20-GridData.json"]));
  let mut bad:Value=serde_json::from_str(&added).unwrap();bad["World"]["GridCollection"]["Grids"]["90"]["Objects"]["1"]=json!({"ID":1,"ItemID":40000001});
  assert!(preview_remove_primary_room(&bad.to_string(),target,false).is_err());
  let mut bad:Value=serde_json::from_str(&added).unwrap();bad["World"]["Alias"]=json!({"GridID":90});
  assert!(preview_remove_primary_room(&bad.to_string(),target,false).is_err());
  let floor=preview_append_primary_floor(&raw.to_string(),0,20500000,1).unwrap().patched_json;
  let t=RoomFinishTarget{floor_index:1,..center};
  let d=preview_remove_primary_room(&floor,t,true).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["World"]["PlayerHouses"],raw["World"]["PlayerHouses"]);
  assert_eq!(v["World"]["GridCollection"]["Grids"],raw["World"]["GridCollection"]["Grids"]);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],95);
  assert!(preview_remove_primary_room(&floor,center,true).is_err());
 }
 #[test]fn native_centering_retains_default_door_ids_across_resize(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="12x12").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":if i==3{1}else{0},"Objects":if i==3{json!({"0":{"ID":0,"ItemID":40300002,"X":20,"Y":0,"Orientation":"GridOrientation_Down","State":null}})}else{json!({})}}))).collect();
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"Currency":17}});
  let t=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:0,room_slot:0};
  assert_eq!(room_add_sizes().len(),25);
  let added=preview_add_primary_room(&raw.to_string(),t,1,"10x10").unwrap().patched_json;
  let resized=preview_room_resize(&added,t,"12x12","3x3").unwrap().patched_json;
  let v:Value=serde_json::from_str(&resized).unwrap();
  assert_eq!(v["World"]["GridCollection"]["Grids"]["13"]["Objects"]["0"]["X"],2);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["14"]["Objects"]["1"]["X"],2);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["92"]["Objects"]["0"]["X"],16);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],95);
  let child=RoomFinishTarget{room_slot:1,..t};
  let resized=preview_room_resize(&resized,child,"10x10","6x6").unwrap().patched_json;
  let v:Value=serde_json::from_str(&resized).unwrap();
  assert_eq!(v["World"]["GridCollection"]["Grids"]["92"]["Objects"]["0"]["X"],8);
  let mut bad:Value=serde_json::from_str(&added).unwrap();
  bad["World"]["GridCollection"]["Grids"]["13"]["Objects"]["1"]=json!({"ID":1,"ItemID":40000001});
  assert!(preview_room_resize(&bad.to_string(),t,"12x12","3x3").is_err());
 }
 #[test]fn occupied_resize_requires_explicit_free_mode_and_preserves_records(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="6x6").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}}))).collect();
  let mut raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"Currency":17}});
  let grid=&mut raw["World"]["GridCollection"]["Grids"]["10"];
  grid["Objects"]["1"]=json!({"ID":1,"ItemID":40001039,"X":14,"Y":7,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":81,"DesignID":null}},"Unknown":7});
  grid["NextGridObjectID"]=json!(2);
  raw["World"]["GridCollection"]["Grids"]["81"]=json!({"ID":81,"UnknownSupport":true});
  let t=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:0,room_slot:0};
  let (_,strict,free)=room_resize_choices(&raw,t).unwrap();
  assert!(!strict.contains(&"12x12".into()));assert!(free.contains(&"12x12".into()));
  assert!(preview_room_resize(&raw.to_string(),t,"6x6","12x12").is_err());
  let d=preview_room_resize_mode(&raw.to_string(),t,"6x6","12x12",true).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"],raw["World"]["GridCollection"]["Grids"]["10"]["Objects"]);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["81"],raw["World"]["GridCollection"]["Grids"]["81"]);
  assert_eq!(v["Player"],raw["Player"]);
  assert!(preview_room_resize_mode(&raw.to_string(),t,"6x6","3x3",true).is_err());
  raw["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["ItemID"]=json!(40300001);
  assert!(preview_room_resize_mode(&raw.to_string(),t,"6x6","12x12",true).is_err());
 }
 #[test]fn recover_shrink_returns_only_outside_plain_furniture_and_preserves_other_objects(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="6x6").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}}))).collect();
  let mut raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001039":{"Amount":2}}}}}});
  let g=&mut raw["World"]["GridCollection"]["Grids"]["10"];
  g["Objects"]=json!({"1":{"ID":1,"ItemID":40001039,"X":14,"Y":7,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40001039,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null}});
  g["NextGridObjectID"]=json!(3);
  let t=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:0,room_slot:0};
  assert!(room_resize_recovery_options(&raw,t).contains(&("3x3".into(),1)));
  let d=preview_room_resize_recover(&raw.to_string(),t,"6x6","3x3",1).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001039"]["Amount"],3);
  assert!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"].get("1").is_none());
  assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"],raw["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]);
  assert!(preview_room_resize_recover(&raw.to_string(),t,"6x6","3x3",2).is_err());
  raw["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]=json!({"Unknown":true});
  assert!(preview_room_resize_recover(&raw.to_string(),t,"6x6","3x3",1).is_err());
 }
 #[test]fn remove_multiple_rooms_and_recover_stock_in_one_floor_edit(){
  let shape=shapes().unwrap().iter().find(|s|s.name=="12x12").unwrap();
  let grids:serde_json::Map<String,Value>=shape.paths.iter().enumerate().map(|(i,p)|((10+i).to_string(),json!({"ID":10+i,"GridDataPath":p,"GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}}))).collect();
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Center","FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"RoomPrefabAddress":shape.prefab}}}]}],"GridCollection":{"NextGridID":90,"Grids":grids}},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001039":{"Amount":2}}}}}});
  let t=RoomFinishTarget{house_index:0,house_item_id:20500000,floor_index:1,room_slot:0};
  let mut src=preview_append_primary_floor(&raw.to_string(),0,20500000,1).unwrap().patched_json;
  for slot in 1..=3{src=preview_add_primary_room(&src,t,slot,"6x6").unwrap().patched_json;}
  let mut v:Value=serde_json::from_str(&src).unwrap();
  assert_eq!(room_removal_offer(&v,t),Some(("floor",0)));
  let g=&mut v["World"]["GridCollection"]["Grids"]["95"];
  g["Objects"]["1"]=json!({"ID":1,"ItemID":40001039,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null});g["NextGridObjectID"]=json!(2);
  assert_eq!(room_removal_offer(&v,t),Some(("floor",1)));
  assert!(preview_remove_primary_room(&v.to_string(),t,true).is_err());
  let d=preview_remove_primary_room_recover(&v.to_string(),t,true,1).unwrap();
  let out:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(out["World"]["PlayerHouses"],raw["World"]["PlayerHouses"]);
  assert_eq!(out["World"]["GridCollection"]["Grids"],raw["World"]["GridCollection"]["Grids"]);
  assert_eq!(out["World"]["GridCollection"]["NextGridID"],110);
  assert_eq!(out["Player"]["ListInventories"]["0"]["Inventory"]["40001039"]["Amount"],3);
  assert!(preview_remove_primary_room_recover(&v.to_string(),t,true,2).is_err());
  v["World"]["GridCollection"]["Grids"]["95"]["Objects"]["1"]["State"]=json!({"Unknown":true});
  assert!(preview_remove_primary_room_recover(&v.to_string(),t,true,1).is_err());
 }
 #[test]fn append_multiple_floors_and_require_opt_in_above_native_max(){
  let raw=json!({"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500000,"InitialRoomGridLayoutPath":"","Floors":[{"Rooms":{"0":{"Name":"Original","FloorGridID":10}}}]}],"GridCollection":{"NextGridID":30,"Grids":{"10":{"ID":10,"Unknown":7}}}},"Player":{"Currency":123}});
  let first=preview_append_primary_floors(&raw.to_string(),0,20500000,1,19,false).unwrap().patched_json;
  let v:Value=serde_json::from_str(&first).unwrap();
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"].as_array().unwrap().len(),20);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],125);
  assert!(preview_append_primary_floor(&first,0,20500000,20).is_err());
  let d=preview_append_primary_floors(&first,0,20500000,20,2,true).unwrap();
  let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"].as_array().unwrap().len(),22);
  assert_eq!(v["World"]["PlayerHouses"][0]["Floors"][21]["Rooms"]["0"]["FloorGridID"],130);
  assert_eq!(v["World"]["GridCollection"]["NextGridID"],135);
  assert_eq!(v["Player"],raw["Player"]);
  assert!(preview_append_primary_floors(&first,0,20500000,20,109,true).is_err());
  assert!(preview_append_primary_floors(&first,0,20500000,20,0,true).is_err());
 }
}
