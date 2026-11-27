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
fn available(shape:&Shape)->bool{
 static TERRAIN:std::sync::OnceLock<HashSet<String>>=std::sync::OnceLock::new();
 let paths=TERRAIN.get_or_init(||{
  serde_json::from_str::<Value>(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).ok().and_then(|v|v["grids"].as_array().map(|a|a.iter().filter_map(|r|r[0].as_str().map(str::to_owned)).collect())).unwrap_or_default()
 });
 shape.paths.len()==5&&shape.paths.iter().all(|p|paths.contains(p))
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
// Occupied surfaces retain their exact geometry and object bytes. Only
// empty surfaces may change their geometry, including native factor-2 grids.
fn resize_eligible(root:&Value,ids:&[u32],old:&Shape,next:&Shape)->bool{
 ids.iter().enumerate().all(|(i,n)|old.paths[i]==next.paths[i]||
  root["World"]["GridCollection"]["Grids"][n.to_string()]["Objects"].as_object().is_some_and(|m|m.is_empty()))
}
/// UI witness only: mutation independently checks identity and all references.
pub fn room_resize_options(root:&Value,t:RoomFinishTarget)->Option<(String,Vec<String>)>{
 let shapes=shapes().ok()?;let (old,ids)=room_geometry(root,t,shapes).ok()?;
 if !available(&shapes[old]){return None;}
 let options:Vec<_>=shapes.iter().enumerate().filter(|(i,s)|*i!=old&&available(s)&&resize_eligible(root,&ids,&shapes[old],s)).map(|(_,s)|s.name.clone()).collect();
 if options.is_empty(){return None;}
 Some((shapes[old].name.clone(),options))
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
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let shapes=shapes()?;let (old,ids)=room_geometry(&root,t,shapes)?;
 let next=shapes.iter().find(|s|s.name==replacement).ok_or(BAD)?;
 if shapes[old].name!=expected||expected==replacement{return Err(BAD);}
 if !available(&shapes[old])||!available(next)||!resize_eligible(&root,&ids,&shapes[old],next){return Err(BAD);}
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
/// ordinary primary house, with the native 20-floor cap for this first route.
pub fn primary_floor_count(root:&Value,house_index:usize,house_item_id:u32)->Option<usize>{
 if root["GameInfo"]["Version"].as_u64()!=Some(643)||house_item_id!=20500000{return None;}
 let house=root["World"]["PlayerHouses"].as_array()?.get(house_index)?;
 if house["HouseItemID"].as_u64()!=Some(20500000)||house["InitialRoomGridLayoutPath"].as_str()!=Some(""){return None;}
 let floors=house["Floors"].as_array()?;
 if floors.is_empty()||floors.len()>=20||floors.iter().any(|f|f["Rooms"].as_object().is_none_or(|r|!r.contains_key("0")||r.len()>4||r.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3")))){return None;}
 Some(floors.len())
}
pub fn preview_append_primary_floor(source:&str,house_index:usize,house_item_id:u32,expected_count:usize)->Result<GridCoordinateDraft,PatchError>{
 use crate::support_clone::{checked_grid_allocator,grid_capacity,reserved_ref};
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 if primary_floor_count(&root,house_index,house_item_id)!=Some(expected_count){return Err(BAD);}
 let shape=shapes()?.iter().find(|s|s.name=="3x3").filter(|s|available(s)).ok_or(BAD)?;
 let collection=root["World"]["GridCollection"].as_object().ok_or(BAD)?;
 let fresh=checked_grid_allocator(collection)?;
 let next=fresh.checked_add(5).ok_or(BAD)?;
 if !grid_capacity(collection["Grids"].as_object().ok_or(BAD)?,collection.get("DiffGrids").and_then(Value::as_object),5)||
    reserved_ref(&root,&(fresh..next).collect(),false){return Err(BAD);}
 let mut members=serde_json::Map::new();
 for (i,path) in shape.paths.iter().enumerate(){
  let id=fresh+i as u32;
  let objects=if i==3{json!({"0":{"ID":0,"ItemID":40300002,"X":2,"Y":0,"Orientation":"GridOrientation_Down","State":null}})}else{json!({})};
  members.insert(id.to_string(),json!({"ID":id,"GridDataPath":path,"GridDefaultLayoutPath":"","TessellationFactor":2,"Objects":objects,"NextGridObjectID":if i==3{1}else{0}}));
 }
 let floor=json!({"Rooms":{"0":{"Name":"","FloorGridID":fresh,"WallGridIDs":{"0":fresh+1,"1":fresh+2,"2":fresh+3,"3":fresh+4},"RoomPrefabAddress":shape.prefab,"Flooring":160100000,"Wallpapers":{"0":160000000,"1":160000000,"2":160000000,"3":160000000},"WallpaperOffsetById":{},"Ceiling":160100136}},"BoughtRooms":{"0":{"GridDataPaths":[shape.paths[0]]}}});
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
 let mut patches=[(gr.end-1..gr.end-1,format!("{}{}",if old_grids.is_empty(){""}else{","},grid_text)),(cr,next.to_string()),(fr.end-1..fr.end-1,format!(",{}",floor))];
 patches.sort_unstable_by_key(|(r,_)|r.start);
 let mut result=String::new();let mut last=0;
 for (range,value) in patches{if range.start<last{return Err(BAD);}result.push_str(&source[last..range.start]);result.push_str(&value);last=range.end;}
 result.push_str(&source[last..]);
 root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?.extend(members);
 root["World"]["GridCollection"]["NextGridID"]=json!(next);
 root["World"]["PlayerHouses"][house_index]["Floors"].as_array_mut().ok_or(BAD)?.push(floor);
 if result.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&result).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(GridCoordinateDraft{patched_json:result,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

// Source-observed reciprocal walls and factor-2 door anchors.
fn room_connection(slot:u8)->Option<(usize,usize)>{
 match slot{1=>Some((3,1)),2=>Some((1,3)),3=>Some((0,2)),_=>None}
}
fn door_anchor(path:&str)->Option<i64>{
 match path{"GridData/Rooms/Wall20x9-GridData.json"=>Some(16),"GridData/Rooms/Wall24x9-GridData.json"=>Some(20),_=>None}
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
 let shape=shapes()?.iter().find(|s|s.name==size&&matches!(size,"10x10"|"12x12")&&available(s)).ok_or(BAD)?;
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
struct Removal{ids:Vec<u32>,parent:Option<(u32,String)>}
fn removal_target(root:&Value,t:RoomFinishTarget,whole_floor:bool)->Option<Removal>{
 let h=primary_house(root,t)?;
 let floors=h["Floors"].as_array()?;
 let floor=floors.get(t.floor_index)?;
 let rooms=floor["Rooms"].as_object()?;
 if !rooms.contains_key("0")||rooms.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3")){return None;}
 let r=room_value(root,t)?;
 if !removable_room_record(r){return None;}
 let shapes=shapes().ok()?;
 let (si,ids)=room_geometry(root,t,shapes).ok()?;
 let grids=root["World"]["GridCollection"]["Grids"].as_object()?;
 let get=|i:usize|grids.get(&ids[i].to_string());
 let (door_surface,door_item,anchor,parent)=if whole_floor{
  if t.room_slot!=0||floors.len()<2||t.floor_index+1!=floors.len()||rooms.len()!=1||
    floor.as_object()?.keys().any(|k|!matches!(k.as_str(),"Rooms"|"BoughtRooms")){return None;}
  if let Some(b)=floor.get("BoughtRooms"){let b=b.as_object()?;if b.values().any(|v|v.as_object().is_none_or(|m|m.len()!=1)||v["GridDataPaths"].as_array().is_none_or(|a|a.iter().any(|v|!v.is_string()))){return None;}}
  let a=match shapes[si].paths[3].as_str(){"GridData/Rooms/Wall6x9-GridData.json"=>2,p=>door_anchor(p)?};
  (3,40300002,a,None)
 }else{
  let (pw,cw)=room_connection(t.room_slot)?;
  let center=RoomFinishTarget{room_slot:0,..t};
  let (ci,cids)=room_geometry(root,center,shapes).ok()?;
  let gid=cids[pw+1];
  if ids.contains(&gid){return None;}
  let parent_key=structural_door(grids.get(&gid.to_string())?,40300001,door_anchor(&shapes[ci].paths[pw+1])?,false)?;
  (cw+1,40300001,door_anchor(&shapes[si].paths[cw+1])?,Some((gid,parent_key)))
 };
 for i in 0..5{
  let g=get(i)?;
  if i==door_surface{structural_door(g,door_item,anchor,true)?;}
  else if !g["Objects"].as_object()?.is_empty(){return None;}
 }
 Some(Removal{ids,parent})
}
pub fn room_removal_kind(root:&Value,t:RoomFinishTarget)->Option<&'static str>{
 if t.room_slot==0{removal_target(root,t,true).map(|_|"floor")}else{removal_target(root,t,false).map(|_|"room")}
}
pub fn preview_remove_primary_room(source:&str,t:RoomFinishTarget,whole_floor:bool)->Result<GridCoordinateDraft,PatchError>{
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let removal=removal_target(&root,t,whole_floor).ok_or(BAD)?;
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
  assert!(preview_add_primary_room(&raw.to_string(),t,1,"8x8").is_err());
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
}
