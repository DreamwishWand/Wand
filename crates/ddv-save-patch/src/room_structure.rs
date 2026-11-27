//! Source-correlated empty-room resizing. No furniture, ownership, or unknown
//! Grid records are deleted; existing room and Grid identities remain stable.
use super::*;
use serde_json::{Value,json};
const BAD:PatchError=PatchError::InvalidTarget;
#[derive(serde::Deserialize)]
struct Shape{ name:String,prefab:String,paths:Vec<String> }
#[derive(serde::Deserialize)]
struct Catalog{ rooms:Vec<Shape> }
fn shapes()->Result<Vec<Shape>,PatchError>{
 let catalog:Catalog=serde_json::from_str(include_str!("../../../src/lib/world/room-size-source.json")).map_err(|_|BAD)?;
 if catalog.rooms.len()!=26{return Err(BAD);}
 Ok(catalog.rooms)
}
fn available(shape:&Shape,terrain:&Value)->bool{
 shape.paths.len()==5&&shape.paths.iter().all(|p|terrain["grids"].as_array().is_some_and(|a|a.iter().any(|r|r[0].as_str()==Some(p.as_str()))))
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
     g["GridDefaultLayoutPath"].as_str()!=Some("")||g["TessellationFactor"].as_u64()!=Some(1)||
     g["Objects"].as_object().is_none_or(|m|!m.is_empty())||
     g["NextGridObjectID"].as_u64().is_none_or(|n|n>u32::MAX as u64)||
     g.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ID"|"GridDataPath"|"GridDefaultLayoutPath"|"TessellationFactor"|"NextGridObjectID"|"Objects"))){return Err(BAD);}
  paths.push(g["GridDataPath"].as_str().ok_or(BAD)?);
 }
 let index=shapes.iter().position(|s|r["RoomPrefabAddress"].as_str()==Some(s.prefab.as_str())&&s.paths.iter().map(String::as_str).eq(paths.iter().copied())).ok_or(BAD)?;
 Ok((index,ids))
}
/// UI witness only: mutation independently checks identity and all references.
pub fn room_resize_options(root:&Value,t:RoomFinishTarget)->Option<(String,Vec<String>)>{
 let shapes=shapes().ok()?;let (old,_)=room_geometry(root,t,&shapes).ok()?;
 let terrain:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).ok()?;
 if !available(&shapes[old],&terrain){return None;}
 Some((shapes[old].name.clone(),shapes.iter().enumerate().filter(|(i,s)|*i!=old&&available(s,&terrain)).map(|(_,s)|s.name.clone()).collect()))
}
pub fn preview_room_resize(source:&str,t:RoomFinishTarget,expected:&str,replacement:&str)->Result<GridCoordinateDraft,PatchError>{
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let shapes=shapes()?;let (old,ids)=room_geometry(&root,t,&shapes)?;
 let next=shapes.iter().find(|s|s.name==replacement).ok_or(BAD)?;
 if shapes[old].name!=expected||expected==replacement{return Err(BAD);}
 let terrain:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).map_err(|_|BAD)?;
 if !available(&shapes[old],&terrain)||!available(next,&terrain){return Err(BAD);}
 // Ignore only this room's own five references; aliases from any other room,
 // support, history, mission, or other grid reference still block the edit.
 let mut refs=root.clone();
 let room_pointer=format!("/World/PlayerHouses/{}/Floors/{}/Rooms/{}",t.house_index,t.floor_index,t.room_slot);
 let room=refs.pointer_mut(&room_pointer).and_then(Value::as_object_mut).ok_or(BAD)?;
 room.remove("FloorGridID");room.remove("WallGridIDs");
 if crate::support_clone::reserved_ref(&refs,&ids.iter().copied().collect(),false){return Err(BAD);}
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
  let mut b=raw.clone();b["World"]["Alias"]=json!({"FloorGridID":10});assert!(preview_room_resize(&b.to_string(),target,"6x6","10x12").is_err());
  assert!(preview_room_resize(&raw.to_string(),target,"6x6","8x3").is_err());
  let mut b=raw.clone();b["World"]["PlayerHouses"][0]["Floors"][0].as_object_mut().unwrap().remove("BoughtRooms");
  let d=preview_room_resize(&b.to_string(),target,"6x6","10x12").unwrap();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap()["World"]["PlayerHouses"][0]["Floors"][0]["BoughtRooms"]["0"]["GridDataPaths"],json!(["GridData/Rooms/Room20x24-GridData.json"]));
 }
}
