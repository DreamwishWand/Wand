//! Source-confirmed PlayerHouse room/finish references. Read-only local view;
//! never infer wall orientation or room dimensions from ordinal or item poses.
use crate::CodecError;
use serde_json::{Value,json};
use std::collections::{BTreeMap,HashMap};
fn id(v:&Value)->Option<u64>{v.as_u64().filter(|n|*n<=u32::MAX as u64)}
fn key_id(s:&str)->Option<i32>{s.parse::<i32>().ok().filter(|n|n.to_string()==s)}
fn finish(v:Option<&Value>)->Option<u64>{v.and_then(id).filter(|n|*n<=i32::MAX as u64)}
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
 let mut out=Vec::new();let mut total=0usize;
 for(h,f,room,surfaces)in rooms{
  let mut rows=Vec::new();
  for(kind,native_wall,grid,material)in surfaces{
   let mut counts=BTreeMap::<u64,usize>::new();let mut state="unresolved";
   let mut positions=Vec::new();let mut missing=0usize;let mut factor=None;
   if let Some(n)=grid{
    let key=n.to_string();
    if references.get(&n).copied()!=Some(1){state="shared";}
    else if diffs.is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&key))){state="diff";}
    else if let Some(g)=grids.and_then(|m|m.get(&key)){
     if g.get("ID").and_then(id)==Some(n){
      if let Some(objects)=g.get("Objects").and_then(Value::as_object){
       state="full";
       if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)==Some(1262){factor=g.get("TessellationFactor").and_then(Value::as_u64).filter(|n|matches!(*n,1|2));}
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
   rows.push(json!({"kind":kind,"ordinal":rows.len()+1,"wallPosition":native_wall,"finish":material,"gridStatus":state,"positions":positions,"factor":factor,"missingPositions":missing,"items":counts.into_iter().map(|(item,quantity)|json!({"itemId":item,"quantity":quantity})).collect::<Vec<_>>() }));
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

#[cfg(test)]
mod tests{
 use super::*;
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
