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
 Some(json!({"sizeX":sx,"sizeY":sy,"values":values,"sourcePath":path}))
}
fn terrain_catalog()->Result<Value,CodecError>{
 serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/room-terrain.json")).map_err(|_|CodecError::Json)
}
use ddv_save_patch::storage_pose;
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
    rooms.push((h+1,f+1,key_id(k).ok_or(CodecError::Json)?,room,surfaces));
   }
  }
 }
 let mut out=Vec::new();let mut total=0usize;let mut terrain_total=0usize;let catalog=terrain_catalog()?;
 let mut support_parents=Vec::new();let mut support_ordinals=None;
 for(h,f,slot,room,surfaces)in rooms{
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
        if let (Some(x),Some(y))=(coord("X"),coord("Y")){let orientation=match obj.get("Orientation").and_then(Value::as_str){Some("GridOrientation_Up")=>Some(0),Some("GridOrientation_Right")=>Some(4),Some("GridOrientation_Down")=>Some(8),Some("GridOrientation_Left")=>Some(12),Some("GridOrientation_UpRight") if kind=="floor"&&factor==Some(1)=>Some(2),Some("GridOrientation_DownRight") if kind=="floor"&&factor==Some(1)=>Some(6),Some("GridOrientation_DownLeft") if kind=="floor"&&factor==Some(1)=>Some(10),Some("GridOrientation_UpLeft") if kind=="floor"&&factor==Some(1)=>Some(14),_=>None};let mut pose=json!({"itemId":item,"x":x,"y":y,"orientationCode":orientation});
         let storage_known=crate::storage_source::is_storage(item)||obj.get("State").and_then(|s|s.get("Storage")).is_some();
         if storage_known{pose["storageKnown"]=json!(true);}
         if !storage_known&&factor.is_some()&&oid.is_some_and(|n|n>0)&&item/100_000==400&&orientation.is_some()&&obj.get("State").is_none_or(Value::is_null)&&obj.as_object().is_some_and(|o|o.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){pose["plain"]=json!(true);}
         if kind=="floor"&&factor.is_some()&&oid.is_some_and(|n|n>0)&&item/100_000==400&&orientation.is_some_and(|n|n%4==0)&&storage_pose(&root,obj)&&obj.as_object().is_some_and(|o|o.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){pose["storage"]=json!(true);if ddv_save_patch::storage_pickup_eligible(&root,obj){pose["storageEmpty"]=json!(true);if crate::storage_source::restorable_empty_storage(&root,obj,item){pose["storageRestorable"]=json!(true);}}}
         if !storage_known&&terrain.is_some()&&oid==Some(0)&&orientation.is_some()&&obj.get("State").is_none_or(Value::is_null)&&obj.as_object().is_some_and(|o|o.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){pose["protected"]=json!(true);}
         positions.push(pose);}else{missing+=1;}
       }
      }
     }
    }
   }
   let mut row=json!({"kind":kind,"ordinal":rows.len()+1,"wallPosition":native_wall,"finish":material,"gridStatus":state,"positions":positions,"factor":factor,"missingPositions":missing,"items":counts.into_iter().map(|(item,quantity)|json!({"itemId":item,"quantity":quantity})).collect::<Vec<_>>() });
   if state=="full"&&factor.is_some(){if let Some(t)=terrain{terrain_total+=t.get("values").and_then(Value::as_array).map_or(0,Vec::len);if terrain_total<=1_000_000{row["terrain"]=t;}}}
   if state=="full"&&factor.is_some()&&missing==0{
    if let Some(gid)=grid.map(|n|n.to_string()){
     if let Some(objects)=grids.and_then(|m|m.get(&gid)).and_then(|g|g.get("Objects")).and_then(Value::as_object){
      for(index,(oid,obj))in objects.iter().enumerate(){
       if obj.get("State").and_then(|s|s.get("SubGrid")).is_none(){continue;}
       let map=support_ordinals.get_or_insert_with(||crate::grid_instance_preview::room_support_ordinals(source).unwrap_or_default());
       if let Some(ordinal)=map.get(&(gid.clone(),oid.clone())){
        if *ordinal<=20000&&support_parents.len()<20000{
         if let Some(pose)=row.get("positions").and_then(|p|p.get(index)){
          support_parents.push(json!({"roomOrdinal":out.len()+1,"surfaceOrdinal":rows.len()+1,"index":index,"localOrdinal":ordinal,"itemId":pose["itemId"],"x":pose["x"],"y":pose["y"]}));
         }
        }
       }
      }
     }
    }
   }
   rows.push(row);
  }
  let name=room.get("Name").and_then(Value::as_str).filter(|s|s.chars().count()<=128).unwrap_or("");
  let mut row=json!({"ordinal":out.len()+1,"house":h,"floor":f,"name":name,"ceiling":finish(room.get("Ceiling")),"surfaces":rows});
  if let Some(item)=houses[h-1].get("HouseItemID").and_then(id).filter(|n|*n/100_000==205){row["houseItemId"]=json!(item);}
  if (0..=3).contains(&slot){row["roomSlot"]=json!(slot);}
  if root["GameInfo"]["Version"].as_u64()==Some(643)&&(0..=3).contains(&slot)&&houses[h-1].get("HouseItemID").and_then(id).is_some_and(|n|n>0)&&room.get("Name").and_then(Value::as_str).is_some_and(|s|s.chars().count()<=128){row["nameEditable"]=json!(true);}
  if let Some(item)=row.get("houseItemId").and_then(id){if (0..=3).contains(&slot){if let Some((size,options,free))=ddv_save_patch::room_structure::room_resize_choices(&root,ddv_save_patch::RoomFinishTarget{house_index:h-1,house_item_id:item as u32,floor_index:f-1,room_slot:slot as u8}){row["resize"]=json!({"current":size,"options":options});if !free.is_empty(){row["resize"]["anchorOptions"]=json!(free);}let recover=ddv_save_patch::room_structure::room_resize_recovery_options(&root,ddv_save_patch::RoomFinishTarget{house_index:h-1,house_item_id:item as u32,floor_index:f-1,room_slot:slot as u8});if !recover.is_empty(){row["resize"]["recoveryOptions"]=json!(recover);}}}}
  if slot==0{if let Some(item)=row.get("houseItemId").and_then(id){if let Some(count)=ddv_save_patch::room_structure::primary_floor_count(&root,h-1,item as u32){row["appendFloorCount"]=json!(count);}}}
  if slot==0{if let Some(item)=row.get("houseItemId").and_then(id){let slots=ddv_save_patch::room_structure::room_add_slots(&root,ddv_save_patch::RoomFinishTarget{house_index:h-1,house_item_id:item as u32,floor_index:f-1,room_slot:0});if !slots.is_empty(){let sizes=ddv_save_patch::room_structure::room_add_sizes();if !sizes.is_empty(){row["addRoomSlots"]=json!(slots);row["addRoomSizes"]=json!(sizes);}}}}
  if let Some(item)=row.get("houseItemId").and_then(id){if (0..=3).contains(&slot){if let Some((kind,count))=ddv_save_patch::room_structure::room_removal_offer(&root,ddv_save_patch::RoomFinishTarget{house_index:h-1,house_item_id:item as u32,floor_index:f-1,room_slot:slot as u8}){row["removeKind"]=json!(kind);if count>0{row["removeRecoverCount"]=json!(count);}}}}
  out.push(row);
 }
 Ok(json!({"contract":"wand.db05.indoor-rooms@1","rooms":out,"geometryVerified":false,"writerAuthorized":false,"ownedFinishIds":owned_finishes(&root),"supportParents":support_parents}).to_string())
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
  Some("ceiling") if wall.is_null()=>RoomFinishAction::Ceiling{expected:p.get("expected").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?},
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

pub(super) fn rename_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 use ddv_save_patch::{RoomFinishTarget,preview_room_rename};
 if plan.len()>4096{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
 let value:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 let p=value.as_object().filter(|p|p.len()==3).ok_or(CodecError::Json)?;
 let ordinal=p.get("roomOrdinal").and_then(Value::as_u64).filter(|n|(1..=2048).contains(n)).ok_or(CodecError::Json)?;
 let expected=p.get("expected").and_then(Value::as_str).ok_or(CodecError::Json)?;
 let replacement=p.get("name").and_then(Value::as_str).ok_or(CodecError::Json)?;
 let houses=root["World"]["PlayerHouses"].as_array().filter(|a|a.len()<=128).ok_or(CodecError::Json)?;
 let mut seen=0u64;
 for(h,house)in houses.iter().enumerate(){
  let Some(floors)=house.get("Floors")else{continue;};let floors=floors.as_array().filter(|a|a.len()<=128).ok_or(CodecError::Json)?;
  for(f,floor)in floors.iter().enumerate(){
   let Some(rooms)=floor.get("Rooms")else{continue;};let rooms=rooms.as_object().ok_or(CodecError::Json)?;
   for key in rooms.keys(){seen+=1;if seen==ordinal{
    let slot=key_id(key).and_then(|n|u8::try_from(n).ok()).filter(|n|*n<=3).ok_or(CodecError::Json)?;
    let house_item_id=house.get("HouseItemID").and_then(id).filter(|n|*n>0).ok_or(CodecError::Json)? as u32;
    return preview_room_rename(std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?,RoomFinishTarget{house_index:h,house_item_id,floor_index:f,room_slot:slot},expected,replacement).map_err(|_|CodecError::Patch);
   }}
  }
 }
 Err(CodecError::Json)
}

pub(super) fn remove_room_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let p:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 if p.as_object().is_none_or(|m|(m.len()!=5&&!(m.len()==6&&p["recoverCount"].as_u64().is_some_and(|n|(1..=2048).contains(&n))))||m.keys().any(|k|!matches!(k.as_str(),"house"|"houseItemId"|"floor"|"slot"|"kind"|"recoverCount"))){return Err(CodecError::Json);}
 let house=p["house"].as_u64().filter(|n|(1..=128).contains(n)).ok_or(CodecError::Json)?;
 let item=p["houseItemId"].as_u64().filter(|n|*n==20500000).ok_or(CodecError::Json)?;
 let floor=p["floor"].as_u64().filter(|n|(1..=128).contains(n)).ok_or(CodecError::Json)?;
 let slot=p["slot"].as_u64().filter(|n|*n<=3).ok_or(CodecError::Json)?;
 let whole_floor=match p["kind"].as_str(){Some("floor") if slot==0=>true,Some("room") if slot>0=>false,_=>return Err(CodecError::Json)};
 let raw=std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?;let target=ddv_save_patch::RoomFinishTarget{house_index:house as usize-1,house_item_id:item as u32,floor_index:floor as usize-1,room_slot:slot as u8};
 if let Some(n)=p["recoverCount"].as_u64(){ddv_save_patch::room_structure::preview_remove_primary_room_recover(raw,target,whole_floor,n as usize)}else{ddv_save_patch::room_structure::preview_remove_primary_room(raw,target,whole_floor)}.map_err(|_|CodecError::Patch)
}
pub(super) fn add_room_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let p:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 if p.as_object().is_none_or(|m|m.len()!=5){return Err(CodecError::Json);}
 let house=p["house"].as_u64().filter(|n|(1..=128).contains(n)).ok_or(CodecError::Json)?;
 let item=p["houseItemId"].as_u64().filter(|n|*n==20500000).ok_or(CodecError::Json)?;
 let floor=p["floor"].as_u64().filter(|n|(1..=128).contains(n)).ok_or(CodecError::Json)?;
 let slot=p["slot"].as_u64().filter(|n|(1..=3).contains(n)).ok_or(CodecError::Json)?;
 let size=p["size"].as_str().ok_or(CodecError::Json)?;
 ddv_save_patch::room_structure::preview_add_primary_room(std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?,ddv_save_patch::RoomFinishTarget{house_index:house as usize-1,house_item_id:item as u32,floor_index:floor as usize-1,room_slot:0},slot as u8,size).map_err(|_|CodecError::Patch)
}
pub(super) fn append_floor_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let p:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 if p.as_object().is_none_or(|m|!(3..=5).contains(&m.len())||m.keys().any(|k|!matches!(k.as_str(),"house"|"houseItemId"|"expectedCount"|"count"|"extended"))){return Err(CodecError::Json);}
 let house=p["house"].as_u64().filter(|n|*n==1).ok_or(CodecError::Json)?;
 let item=p["houseItemId"].as_u64().filter(|n|*n==20500000).ok_or(CodecError::Json)?;
 let expected=p["expectedCount"].as_u64().filter(|n|(1..128).contains(n)).ok_or(CodecError::Json)?;
 let count=match p.get("count"){None=>1,Some(v)=>v.as_u64().filter(|n|(1..128).contains(n)).ok_or(CodecError::Json)?};
 let extended=match p.get("extended"){None=>false,Some(v) if v.as_bool()==Some(true)&&p.get("count").is_some()=>true,_=>return Err(CodecError::Json)};
 ddv_save_patch::room_structure::preview_append_primary_floors(std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?,house as usize-1,item as u32,expected as usize,count as usize,extended).map_err(|_|CodecError::Patch)
}
pub(super) fn resize_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 use ddv_save_patch::{RoomFinishTarget,room_structure::{preview_room_resize_mode,preview_room_resize_recover}};
 if plan.len()>4096{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
 let value:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
 let p=value.as_object().filter(|p|(p.len()==3||p.len()==4&&(p.get("preserveAnchors").and_then(Value::as_bool)==Some(true)||p.get("recoverCount").and_then(Value::as_u64).is_some_and(|n|(1..=2048).contains(&n))))&&p.keys().all(|k|matches!(k.as_str(),"roomOrdinal"|"expected"|"size"|"preserveAnchors"|"recoverCount"))).ok_or(CodecError::Json)?;
 let ordinal=p.get("roomOrdinal").and_then(Value::as_u64).filter(|n|(1..=2048).contains(n)).ok_or(CodecError::Json)?;
 let expected=p.get("expected").and_then(Value::as_str).ok_or(CodecError::Json)?;
 let replacement=p.get("size").and_then(Value::as_str).ok_or(CodecError::Json)?;
 let free=p.get("preserveAnchors").and_then(Value::as_bool)==Some(true);
 let houses=root["World"]["PlayerHouses"].as_array().filter(|a|a.len()<=128).ok_or(CodecError::Json)?;
 let mut seen=0u64;
 for(h,house)in houses.iter().enumerate(){
  let Some(floors)=house.get("Floors")else{continue;};let floors=floors.as_array().filter(|a|a.len()<=128).ok_or(CodecError::Json)?;
  for(f,floor)in floors.iter().enumerate(){
   let Some(rooms)=floor.get("Rooms")else{continue;};let rooms=rooms.as_object().ok_or(CodecError::Json)?;
   for key in rooms.keys(){seen+=1;if seen==ordinal{
    let slot=key_id(key).and_then(|n|u8::try_from(n).ok()).filter(|n|*n<=3).ok_or(CodecError::Json)?;
    let house_item_id=house.get("HouseItemID").and_then(id).filter(|n|*n>0).ok_or(CodecError::Json)? as u32;
    let raw=std::str::from_utf8(source).map_err(|_|CodecError::Utf8)?;let target=RoomFinishTarget{house_index:h,house_item_id,floor_index:f,room_slot:slot};
    return if let Some(n)=p.get("recoverCount").and_then(Value::as_u64){preview_room_resize_recover(raw,target,expected,replacement,n as usize)}else{preview_room_resize_mode(raw,target,expected,replacement,free)}.map_err(|_|CodecError::Patch);
   }}
  }
 }
 Err(CodecError::Json)
}

/// Resolve a unique explicit room surface and exact existing plain objects.
/// With no source room raster, only identical-footprint rotation/swap (UI
/// geometry witness) and stock pickup are enabled. No arbitrary new cells.
/// Resolve a cut witness from an exact owned floor, independently of UI state.
pub(super) fn resolve_room_cut_source(source:&[u8],root:&Value,row:&Value,item:u64,expected:(i32,i32),old:&str,support_factor:Option<u32>,free:bool,storage:bool)->Result<ddv_save_patch::GridCoordinateTarget,CodecError>{
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
 !(ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||free&&support_factor.is_none()&&face.get("factor").and_then(Value::as_u64)==Some(1)&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&old))||
 obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||!free&&objects.values().filter(|o|at(o)).count()!=1{return Err(bad);}
 if free{let t=face.get("terrain").ok_or(bad)?;let f=face.get("factor").and_then(Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)?;let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)?;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)?;if expected.0<0||expected.1<0||expected.0 as u64>=sx*f||expected.1 as u64>=sy*f{return Err(bad);}}
 if let Some(f)=support_factor{
  if face.get("factor").and_then(Value::as_u64)!=Some(u64::from(f))||obj.get("State").and_then(Value::as_object).is_none_or(|m|m.len()!=1||!m.contains_key("SubGrid")){return Err(bad);}
  let t=face.get("terrain").ok_or(bad)?;
  let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)?;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)?;
  let (x,y)=expected;if x<0||y<0||x as u64>=sx*u64::from(f)||y as u64>=sy*u64::from(f)||!free&&t.get("values").and_then(|v|v.get((y as usize/f as usize)*sx as usize+x as usize/f as usize)).and_then(Value::as_u64).is_none_or(|n|n==0){return Err(bad);}
  crate::grid_instance_preview::subgrid_tree(collection.as_object().ok_or(bad)?,&gid,key)?;
 }else if storage{if !storage_pose(root,obj)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old){return Err(bad);}}else if obj.get("State").is_some_and(|s|!s.is_null()){return Err(bad);}
 let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid,object_id:key.clone(),item_id:item};
 let refs=crate::grid_instance_preview::grid_identity_dependencies(source,&target)?;
 if refs.blocking()>0||refs.historical>0{return Err(bad);}
 Ok(target)
}
#[cfg(test)]
pub(super) fn room_to_outdoor_candidate(source:&[u8],row:&Value)->Result<String,CodecError>{room_to_outdoor_candidate_mode(source,row,false)}
pub(super) fn room_to_outdoor_candidate_mode(source:&[u8],row:&Value,free:bool)->Result<String,CodecError>{
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let support=row.get("supportFactor").map(|v|v.as_u64().filter(|n|matches!(n,1|2)).map(|n|n as u32).ok_or(bad)).transpose()?;
 let storage=row.get("storage").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
 if storage&&support.is_some(){return Err(bad);}
 let o=row.as_object().filter(|r|r.len()==9+usize::from(support.is_some())+usize::from(storage)&&r.keys().all(|k|matches!(k.as_str(),"roomSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"|"supportFactor"|"storage"))).ok_or(bad)?;
 let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
 let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let expected=(int("expectedX")?,int("expectedY")?);
 let target=resolve_room_cut_source(source,&root,o.get("roomSource").ok_or(bad)?,item,expected,o.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?,support,free,storage)?;
 let d=crate::grid_instance_preview::resolve_plain_grid_destination(source,o.get("destination").ok_or(bad)?)?;
 let xy=(int("x")?,int("y")?);
 let orientation=o.get("orientation").and_then(Value::as_str).ok_or(bad)?;
 if free{let (_,layout,factor,sx,sy)=crate::grid_instance_preview::house_exterior_identity(&root,&d.grid_id)?;if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}}
 let dest=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&d.grid_id)).and_then(|v|v.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 if !free&&dest.values().any(|v|v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(bad);}
 let json=std::str::from_utf8(source).map_err(|_|bad)?;
 let draft=if storage{let (_,layout,factor,sx,sy)=crate::grid_instance_preview::house_exterior_identity(&root,&d.grid_id)?;if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}ddv_save_patch::preview_storage_transfer(json,&target,expected,&d,xy,orientation,false,free).map_err(|_|CodecError::Patch)?}else if let Some(f)=support{
  if !free&&f!=d.tessellation{return Err(bad);}
  let c=root["World"]["GridCollection"].as_object().ok_or(bad)?;
  let fresh=c["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().ok_or(bad)?.to_string();
  let tree=crate::grid_instance_preview::subgrid_tree(c,&target.grid_id,&target.object_id)?;
  let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(source,&d.grid_id,&[fresh.clone()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  if free{crate::grid_instance_preview::support_pickup_references(source,c["Grids"].as_object().ok_or(bad)?,&target.grid_id,&target.object_id,&mut std::collections::HashSet::new(),&mut 0,0,512)?;}
  let result=(if free{ddv_save_patch::preview_free_support_room_transfer(json,&target,expected,&d,xy,orientation,true,false)}else{ddv_save_patch::preview_indoor_to_outdoor_support_transfer(json,&target,expected,&d,xy,orientation)}).map_err(|_|CodecError::Patch)?;
  let after:Value=serde_json::from_str(&result.patched_json).map_err(|_|bad)?;
  if crate::grid_instance_preview::subgrid_tree(after["World"]["GridCollection"].as_object().ok_or(bad)?,&d.grid_id,&fresh)?!=tree||after["Player"]!=root["Player"]{return Err(bad);}
  result
 }else if free{ddv_save_patch::preview_free_indoor_to_outdoor_transfer(json,&target,expected,&d,xy,orientation).map_err(|_|CodecError::Patch)?}else{ddv_save_patch::preview_indoor_to_outdoor_transfer(json,&target,expected,&d,xy,orientation).map_err(|_|CodecError::Patch)?};
 if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(CodecError::Patch);}
 Ok(draft.patched_json)
}
/// Apply a room design as a single unpublished candidate. Every operation
/// is restricted to the same room, exact source surface and native factor.
/// No intermediate copy is exported or committed.
/// Restore all selected rooms in an unpublished candidate. Return furniture
/// from all faces first, then reuse the existing checked placement/finish writer.
fn indoor_scope_restore(source:&[u8],v:&Value)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 let p=v.as_object().filter(|p|p.len()==2&&p.contains_key("scope")&&p.contains_key("rooms")).ok_or(bad)?;
 let scope=p["scope"].as_str().filter(|s|matches!(*s,"room"|"floor"|"building")).ok_or(bad)?;
 let rows=p["rooms"].as_array().filter(|a|!a.is_empty()&&a.len()<=2048).ok_or(bad)?;
 let report:Value=serde_json::from_str(&project(source)?).map_err(|_|bad)?;
 let all=report["rooms"].as_array().ok_or(bad)?;
 let first=rows[0]["roomOrdinal"].as_u64().filter(|n|*n>0).ok_or(bad)? as usize;
 let selected=all.get(first-1).ok_or(bad)?;
 let expected=all.iter().filter(|r|r["house"]==selected["house"]&&(scope=="building"||r["floor"]==selected["floor"]&&(scope=="floor"||r["ordinal"]==selected["ordinal"]))).collect::<Vec<_>>();
 if expected.len()!=rows.len(){return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(source).map_err(|_|bad)?.to_owned());
 let mut changed=false;let mut roots=0usize;
 for (row,room) in rows.iter().zip(expected){
  if row.as_object().is_none_or(|m|!(m.len()==2||m.len()==3&&m.contains_key("ceiling"))||m.keys().any(|k|!matches!(k.as_str(),"roomOrdinal"|"surfaces"|"ceiling")))||row["roomOrdinal"]!=room["ordinal"]{return Err(bad);}
  if let Some(f)=row.get("ceiling"){
   if f.as_object().is_none_or(|m|m.len()!=2||!m.contains_key("itemId")||!m.contains_key("expected"))||f["itemId"].as_u64().is_none_or(|n|n/100000!=1601)||f["expected"].as_u64().is_none_or(|n|n>u32::MAX as u64)||f["expected"]!=room["ceiling"]||f["itemId"]==f["expected"]{return Err(bad);}
  }
  let faces=room["surfaces"].as_array().ok_or(bad)?;
  let surfaces=row["surfaces"].as_array().filter(|s|s.len()==faces.len()&&s.len()<=9).ok_or(bad)?;
  for (s,face) in surfaces.iter().zip(faces){
   if s.as_object().is_none_or(|m|(m.len()!=6&&! (m.len()==7&&m.get("freePlacement").and_then(Value::as_bool)==Some(true)))||m.keys().any(|k|!matches!(k.as_str(),"surfaceOrdinal"|"sourcePath"|"factor"|"pickup"|"place"|"finish"|"freePlacement"))||m.contains_key("freePlacement")&&m.get("freePlacement").and_then(Value::as_bool)!=Some(true))||s["surfaceOrdinal"]!=face["ordinal"]||s["factor"]!=face["factor"]||s["sourcePath"]!=face["terrain"]["sourcePath"]||face["gridStatus"]!="full"||face["missingPositions"].as_u64()!=Some(0)||face.get("terrain").is_none(){return Err(bad);}
   let pickup=s["pickup"].as_array().filter(|a|a.len()<=32).ok_or(bad)?;
   let place=s["place"].as_array().filter(|a|a.len()<=32).ok_or(bad)?;
   roots=roots.checked_add(pickup.len()+place.len()).ok_or(CodecError::Bounds)?;if roots>4096{return Err(CodecError::Bounds);}
   if !pickup.is_empty(){
    let free=s.get("freePlacement").and_then(Value::as_bool)==Some(true);
    let mut batches=Vec::<(bool,Vec<Value>)>::new();
    let mut indices=std::collections::HashSet::new();
    for p in pickup{
     let i=p["index"].as_u64().and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
     if !indices.insert(i){return Err(bad);}
     let original=face["positions"].as_array().and_then(|a|a.get(i)).ok_or(bad)?;
     if original["storageKnown"]==true&&(p["storageEmpty"]!=true||original["storageRestorable"]!=true){return Err(bad);}
    }
    if free||pickup.iter().any(|p|p.get("storageEmpty").is_some()){
     if face["kind"]!="floor"{return Err(bad);}
     let loose=pickup.iter().filter(|p|p.get("includeSupport").is_none()).cloned().collect::<Vec<_>>();
     let removed=loose.iter().map(|p|p["index"].as_u64().ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
     let mut strict=Vec::new();
     for p in pickup.iter().filter(|p|p.get("includeSupport").is_some()){
      let i=p["index"].as_u64().ok_or(bad)?;let mut p=p.clone();
      p["index"]=json!(i-removed.iter().filter(|n|**n<i).count() as u64);strict.push(p);
     }
     batches.push((free,loose));batches.push((false,strict));
    }else{batches.push((false,pickup.clone()));}
    for (free,batch) in batches{
     if batch.is_empty(){continue;}
     let mut plan=json!({"roomOrdinal":row["roomOrdinal"],"surfaceOrdinal":s["surfaceOrdinal"],"pickup":batch});if free{plan["freePlacement"]=Value::Bool(true);}
     let mut d=furniture_candidate(working.as_bytes(),&plan.to_string())?;
     if !d.changed||!d.untouched_bytes_preserved||d.writer_authorized||d.export_authorized{d.patched_json.zeroize();return Err(CodecError::Patch);}
     working.zeroize();*working=std::mem::take(&mut d.patched_json);changed=true;
    }
   }
  }
 }
 for row in rows{
  let mut surfaces=Vec::new();
  for s in row["surfaces"].as_array().ok_or(bad)?{
   if s["place"].as_array().is_none_or(Vec::is_empty)&&s["finish"].is_null(){continue;}
   let mut face=json!({"surfaceOrdinal":s["surfaceOrdinal"],"sourcePath":s["sourcePath"],"factor":s["factor"],"place":s["place"],"finish":s["finish"]});if s.get("freePlacement").and_then(Value::as_bool)==Some(true){face["freePlacement"]=Value::Bool(true);}surfaces.push(face);
  }
  if !surfaces.is_empty(){
   let next=room_project_candidate(working.as_bytes(),&json!({"roomOrdinal":row["roomOrdinal"],"surfaces":surfaces}).to_string())?;
   working.zeroize();*working=next;changed=true;
  }
  if let Some(f)=row.get("ceiling"){
   let mut d=finish_candidate(working.as_bytes(),&json!({"roomOrdinal":row["roomOrdinal"],"itemId":f["itemId"],"kind":"ceiling","wall":null,"expected":f["expected"]}).to_string())?;
   if !d.changed||!d.untouched_bytes_preserved||d.writer_authorized||d.export_authorized{d.patched_json.zeroize();return Err(CodecError::Patch);}
   working.zeroize();*working=std::mem::take(&mut d.patched_json);changed=true;
  }
 }
 if !changed{return Err(bad);}
 Ok(std::mem::take(&mut *working))
}

pub(super) fn room_project_candidate(source:&[u8],plan:&str)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 if plan.len()>128*1024{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 if v.get("rooms").is_some(){return indoor_scope_restore(source,&v);}
 let p=v.as_object().filter(|p|p.len()==2&&p.contains_key("roomOrdinal")&&p.contains_key("surfaces")).ok_or(bad)?;
 let ordinal=p["roomOrdinal"].as_u64().filter(|n|*n>0&&*n<=2048).ok_or(bad)? as usize;
 let rows=p["surfaces"].as_array().filter(|a|!a.is_empty()&&a.len()<=9).ok_or(bad)?;
 let report:Value=serde_json::from_str(&project(source)?).map_err(|_|bad)?;
 let faces=report["rooms"].get(ordinal-1).and_then(|r|r["surfaces"].as_array()).ok_or(bad)?;
 let mut rooms=Vec::new();
 for house in root["World"]["PlayerHouses"].as_array().ok_or(bad)?{
  if let Some(floors)=house.get("Floors"){for floor in floors.as_array().ok_or(bad)?{if let Some(m)=floor.get("Rooms"){rooms.extend(m.as_object().ok_or(bad)?.values());}}}
 }
 let room=rooms.get(ordinal-1).ok_or(bad)?;
 let grids=root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?;
 let mut used=std::collections::HashSet::new();
 let mut total=0usize;
 let mut working=Zeroizing::new(std::str::from_utf8(source).map_err(|_|bad)?.to_owned());
 let mut changed=false;
 for row in rows{
  let o=row.as_object().filter(|o|(o.len()==5&&!o.contains_key("freePlacement")||o.len()==6&&o.get("freePlacement").and_then(Value::as_bool)==Some(true))&&o.keys().all(|k|matches!(k.as_str(),"surfaceOrdinal"|"sourcePath"|"factor"|"place"|"finish"|"freePlacement"))).ok_or(bad)?;
  let s=o["surfaceOrdinal"].as_u64().filter(|n|*n>0&&*n<=65).ok_or(bad)? as usize;
  if !used.insert(s){return Err(bad);}
  let face=faces.get(s-1).ok_or(bad)?;
  let path=o["sourcePath"].as_str().ok_or(bad)?;
  let factor=o["factor"].as_u64().filter(|n|matches!(n,1|2)).ok_or(bad)?;
  let native=if s==1{room.get("FloorGridID").and_then(id)}else{
   let wall=face["wallPosition"].as_i64().ok_or(bad)?.to_string();room["WallGridIDs"].get(&wall).and_then(id)
  }.filter(|n|*n>0).ok_or(bad)?.to_string();
  let grid=grids.get(&native).ok_or(bad)?;
  if grid["GridDataPath"].as_str()!=Some(path)||face["gridStatus"]!="full"||face["factor"].as_u64()!=Some(factor)||face["missingPositions"].as_u64()!=Some(0)||face.get("terrain").is_none(){return Err(bad);}
  let places=o["place"].as_array().filter(|r|r.len()<=32).ok_or(bad)?;
  for place in places{
   if place.get("supportSource").is_some(){return Err(bad);}
   let count=if let Some(scene)=place.get("scene"){
    fn count(t:&Value,depth:usize)->Result<usize,CodecError>{if depth>8{return Err(CodecError::Bounds);}let mut n=0usize;for o in t["objects"].as_array().ok_or(CodecError::Json)?{n=n.checked_add(1).ok_or(CodecError::Bounds)?;if let Some(c)=o.get("child").filter(|v|!v.is_null()){n=n.checked_add(count(c,depth+1)?).ok_or(CodecError::Bounds)?;}if n>31{return Err(CodecError::Bounds);}}Ok(n)}
    1+count(&scene["tree"],0)?
   }else{1};
   total=total.checked_add(count).ok_or(CodecError::Bounds)?;if total>256{return Err(CodecError::Bounds);}
  }
  if !places.is_empty(){
   let free=o.get("freePlacement").and_then(Value::as_bool)==Some(true);
   let mut batches=Vec::<(bool,Vec<Value>)>::new();
   if free{
    if face["kind"]!="floor"{return Err(bad);}
    batches.push((true,places.clone()));
   }else{batches.push((false,places.clone()));}
   for (free,batch) in batches{
    if batch.is_empty(){continue;}
    let mut plan=json!({"roomOrdinal":ordinal,"surfaceOrdinal":s,"place":batch});if free{plan["freePlacement"]=Value::Bool(true);}
    let mut d=furniture_candidate(working.as_bytes(),&plan.to_string())?;
    if !d.changed||!d.untouched_bytes_preserved||d.writer_authorized||d.export_authorized{d.patched_json.zeroize();return Err(CodecError::Patch);}
    working.zeroize();*working=std::mem::take(&mut d.patched_json);changed=true;
   }
  }
  if !o["finish"].is_null(){
   let f=o["finish"].as_object().filter(|v|v.len()==2&&v.contains_key("itemId")&&v.contains_key("expected")).ok_or(bad)?;
   let item=f["itemId"].as_u64().filter(|n|*n>0&&*n<=u32::MAX as u64).ok_or(bad)?;
   if item/100_000!=if s==1{1601}else{1600}||face["finish"]!=f["expected"]{return Err(bad);}
   if face["finish"].as_u64()==Some(item){continue;}
   let current:Value=serde_json::from_str(&project(working.as_bytes())?).map_err(|_|bad)?;
   let current_faces=current["rooms"][ordinal-1]["surfaces"].as_array().ok_or(bad)?;
   if current_faces.len()!=5||!current_faces[1..].iter().enumerate().all(|(i,f)|f["wallPosition"].as_u64()==Some(i as u64)){return Err(bad);}
   let wall=if s==1{Value::Null}else{face["wallPosition"].clone()};
   let expected=if s==1{current_faces[0]["finish"].clone()}else{Value::Array(current_faces[1..].iter().map(|v|v["finish"].clone()).collect())};
   let mut d=finish_candidate(working.as_bytes(),&json!({"roomOrdinal":ordinal,"itemId":item,"kind":if s==1{"floor"}else{"wall"},"wall":wall,"expected":expected}).to_string())?;
   if !d.changed||!d.untouched_bytes_preserved||d.writer_authorized||d.export_authorized{d.patched_json.zeroize();return Err(CodecError::Patch);}
   working.zeroize();*working=std::mem::take(&mut d.patched_json);changed=true;
  }
 }
 if !changed{return Err(bad);}
 Ok(std::mem::take(&mut *working))
}

pub(super) fn furniture_candidate(source:&[u8],plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 use ddv_save_patch::{GridCoordinateTarget,GridObjectKind,GridMixedEdit};
 let bad=CodecError::Json;
 if plan.len()>131072{return Err(CodecError::Bounds);}
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let p=v.as_object().filter(|p|(p.len()==3&&!p.contains_key("freePlacement")||p.len()==4&&p.get("freePlacement").and_then(Value::as_bool)==Some(true))&&p.keys().all(|k|matches!(k.as_str(),"roomOrdinal"|"surfaceOrdinal"|"edits"|"align"|"paired"|"pairedRotate"|"pickup"|"place"|"transfer"|"freePlacement"))&&["edits","align","paired","pairedRotate","pickup","place","transfer"].iter().filter(|k|p.contains_key(**k)).count()==1).ok_or(bad)?;
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
 let free=p.get("freePlacement").and_then(Value::as_bool)==Some(true);
 if free&&(surface!=1||!p.contains_key("edits")&&!p.contains_key("align")&&!p.contains_key("paired")&&!p.contains_key("pairedRotate")&&!p.contains_key("transfer")&&!p.contains_key("place")&&!p.contains_key("pickup")||terrain.and_then(|v|v.get("sourcePath")).and_then(Value::as_str).is_none_or(|v|!v.starts_with("GridData/Rooms/Room")||grid.get("GridDataPath").and_then(Value::as_str)!=Some(v))){return Err(bad);}
 let allowed_orientation=|v:&str|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&v)||free&&factor==1&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&v);
 let within_room=|(x,y):(i32,i32)|->bool{terrain.is_some_and(|t|t.get("sizeX").and_then(Value::as_u64).zip(t.get("sizeY").and_then(Value::as_u64)).is_some_and(|(sx,sy)|x>=0&&y>=0&&(x as u64)<sx*u64::from(factor)&&(y as u64)<sy*u64::from(factor)))};
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
  let support_pickup=p.contains_key("pickup")&&row.get("includeSupport").and_then(Value::as_bool)==Some(true);
  if obj.get("ID").and_then(id).filter(|n|*n>0).is_none_or(|n|n.to_string()!=*key)||obj.get("ItemID").and_then(id)!=Some(item)||
     (coord(obj,"X")?,coord(obj,"Y")?)!=expected||obj.get("Orientation").and_then(Value::as_str)!=Some(old)||
     !allowed_orientation(old)||support_pickup&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||
     obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
     (!free||support_pickup)&&objects.values().filter(|o|coord(o,"X").ok()==Some(expected.0)&&coord(o,"Y").ok()==Some(expected.1)).count()!=1{return Err(bad);}
  // An explicit support pickup must use the whole-tree writer, never the
  // ordinary leaf path. Coordinate edits keep the same owned subtree.
  if let Some(state)=obj.get("State").filter(|s|!s.is_null()){
   if surface==1&&!support_pickup&&(p.contains_key("edits")||p.contains_key("align")||p.contains_key("pickup")&&row.get("storageEmpty").and_then(Value::as_bool)==Some(true)&&ddv_save_patch::storage_pickup_eligible(&root,obj))&&storage_pose(&root,obj){
    if !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||!(if free{within_room(expected)}else{on_terrain(expected)}){return Err(bad);}
   }else{
    if free&&!support_pickup||!(p.contains_key("edits")||p.contains_key("align")||support_pickup)||!on_terrain(expected)||state.as_object().is_none_or(|m|m.len()!=1||!m.contains_key("SubGrid")){return Err(bad);}
    let c=collection.as_object().ok_or(bad)?;
    crate::grid_instance_preview::subgrid_tree(c,&gid,key)?;
   }
  }else if support_pickup{return Err(bad);}
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:item};
  if crate::grid_instance_preview::grid_identity_dependencies(source,&target)?.blocking()>0{return Err(bad);}
  Ok((target,expected,old.to_owned()))
 };
 let json=std::str::from_utf8(source).map_err(|_|bad)?;
 if let Some(value)=p.get("transfer"){
  use zeroize::{Zeroize,Zeroizing};
  let rows=if let Some(rows)=value.as_array(){rows.as_slice()}else{std::slice::from_ref(value)};
  if surface!=1||rows.is_empty()||rows.len()>32||objects.len()+rows.len()>512{return Err(bad);}
  let mut seen=std::collections::HashSet::new();let mut anchors=std::collections::HashSet::new();let mut moves=Vec::new();
  for row in rows{
  let support=row.get("supportFactor").map(|v|v.as_u64().filter(|n|matches!(n,1|2)).map(|n|n as u32).ok_or(bad)).transpose()?;
  let storage=row.get("storage").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
  if storage&&support.is_some(){return Err(bad);}
  if row.as_object().is_none_or(|r|r.len()!=8+usize::from(support.is_some())+usize::from(storage)||r.contains_key("localOrdinal")==r.contains_key("roomSource")||r.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"roomSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"|"supportFactor"|"storage"))){return Err(bad);}
  let room_source=row.get("roomSource");
  if !free&&support.is_some()&&support!=Some(factor){return Err(bad);}
  let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let expected=(coord(row,"expectedX")?,coord(row,"expectedY")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
  let target=if let Some(w)=room_source{resolve_room_cut_source(source,&root,w,item,expected,old,support,free,storage)?}else{
   let source_ordinal=row.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   if let Some(f)=support{crate::grid_instance_preview::resolve_outdoor_support_cut_target(source,source_ordinal,item,expected,old,f)?}else{crate::grid_instance_preview::resolve_grid_orientation_target(source,source_ordinal,item,expected,"full",old)?}
  };
  let refs=crate::grid_instance_preview::grid_identity_dependencies(source,&target)?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let from=grids.get(&target.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
  if storage&&(!storage_pose(&root,from.get(&target.object_id).ok_or(bad)?)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)){return Err(bad);}
  if (free||storage)&&room_source.is_none(){let (scope,_,f,sx,sy)=crate::grid_instance_preview::house_exterior_identity(&root,&target.grid_id)?;if expected.0<0||expected.1<0||expected.0 as u64>=sx*f||expected.1 as u64>=sy*f||!(ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||!storage&&f==1&&!scope.starts_with("SceneLayouts/FloatingIslands/")&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&old)){return Err(bad);}}
  if !free&&from.values().filter(|v|coord(v,"X").ok()==Some(expected.0)&&coord(v,"Y").ok()==Some(expected.1)).count()!=1{return Err(bad);}
  let xy=(coord(row,"x")?,coord(row,"y")?);
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if (if free{!within_room(xy)||!allowed_orientation(orientation)||support.is_some()&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)}else{!on_terrain(xy)||!empty_anchor(xy,None)||!anchors.insert(xy)})||target.grid_id==gid||!seen.insert((target.grid_id.clone(),target.object_id.clone())){return Err(bad);}
  let tree=if support.is_some(){if free{crate::grid_instance_preview::support_pickup_references(source,grids,&target.grid_id,&target.object_id,&mut std::collections::HashSet::new(),&mut 0,0,512)?;}Some(crate::grid_instance_preview::subgrid_tree(collection.as_object().ok_or(bad)?,&target.grid_id,&target.object_id)?)}else{None};
  moves.push((target,expected,xy,orientation.to_owned(),room_source.is_some(),tree,storage));
  }
  let t=terrain.ok_or(bad)?;
  let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)? as u32;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)? as u32;
  let next=u64::from(ddv_save_patch::room_grid_next_object_id(grid).map_err(|_|bad)?);
  let ids=(0..rows.len() as u64).map(|n|next.checked_add(n).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
  let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(source,&gid,&ids)?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:grid.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?.to_owned(),tessellation:factor,size:(sx,sy)};
  let mut working=Zeroizing::new(json.to_owned());
  let mut last=None;
  for (target,expected,xy,orientation,room_source,tree,storage) in moves{
   let mut draft=if storage{ddv_save_patch::preview_storage_transfer(&working,&target,expected,&d,xy,&orientation,true,free).map_err(|_|CodecError::Patch)?}else if let Some(tree)=tree{
    let before:Value=serde_json::from_str(&working).map_err(|_|bad)?;
    let fresh=ddv_save_patch::room_grid_next_object_id(&before["World"]["GridCollection"]["Grids"][&gid]).map_err(|_|bad)?.to_string();
    let result=(if free{ddv_save_patch::preview_free_support_room_transfer(&working,&target,expected,&d,xy,&orientation,room_source,true)}else if room_source{ddv_save_patch::preview_indoor_support_parent_transfer(&working,&target,expected,&d,xy,&orientation)}else{ddv_save_patch::preview_outdoor_to_indoor_support_transfer(&working,&target,expected,&d,xy,&orientation)}).map_err(|_|CodecError::Patch)?;
    let after:Value=serde_json::from_str(&result.patched_json).map_err(|_|bad)?;
    let c=after["World"]["GridCollection"].as_object().ok_or(bad)?;
    if crate::grid_instance_preview::subgrid_tree(c,&gid,&fresh)?!=tree||after["Player"]!=before["Player"]{return Err(bad);}
    result
   }else{(if free{if room_source{ddv_save_patch::preview_free_indoor_to_indoor_transfer(&working,&target,expected,&d,xy,&orientation)}else{ddv_save_patch::preview_free_outdoor_to_indoor_transfer(&working,&target,expected,&d,xy,&orientation)}}else if room_source{ddv_save_patch::preview_indoor_to_indoor_transfer(&working,&target,expected,&d,xy,&orientation)}else{ddv_save_patch::preview_outdoor_to_indoor_transfer(&working,&target,expected,&d,xy,&orientation)}).map_err(|_|CodecError::Patch)?};
   if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
   working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
  }
  let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
 }
 if let Some(value)=p.get("place"){
  use zeroize::{Zeroize,Zeroizing};
  let rows=if let Some(a)=value.as_array(){a.as_slice()}else{std::slice::from_ref(value)};
  if rows.is_empty()||rows.len()>32||objects.len()+rows.len()>512{return Err(bad);}
  let mut working=Zeroizing::new(json.to_owned());let mut last=None;let mut anchors=std::collections::HashSet::new();
  let next=u64::from(ddv_save_patch::room_grid_next_object_id(grid).map_err(|_|bad)?);
  let ids=(0..rows.len() as u64).map(|i|next.checked_add(i).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
  let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(source,&gid,&ids)?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let mut source_ids=std::collections::HashSet::new();let mut clone_total=0usize;
  for row in rows{
  let support=row.get("supportSource");let scene=row.get("scene");let storage=row.get("storageSource");
  if row.as_object().is_none_or(|r|r.len()!=5+usize::from(support.is_some())+usize::from(scene.is_some())+usize::from(storage.is_some())||r.keys().any(|k|!matches!(k.as_str(),"itemId"|"expectedStock"|"x"|"y"|"orientation"|"supportSource"|"scene"|"storageSource")))||usize::from(support.is_some())+usize::from(scene.is_some())+usize::from(storage.is_some())>1{return Err(bad);}
  let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let amount=row.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  let xy=(coord(row,"x")?,coord(row,"y")?);let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if free{if !within_room(xy)||!allowed_orientation(orientation)||(support.is_some()||scene.is_some())&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(bad);}}else if !on_terrain(xy)||!empty_anchor(xy,None)||!anchors.insert(xy){return Err(bad);}
  let t=terrain.ok_or(bad)?;
  let sx=t.get("sizeX").and_then(Value::as_u64).ok_or(bad)? as u32;let sy=t.get("sizeY").and_then(Value::as_u64).ok_or(bad)? as u32;
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:grid.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?.to_owned(),tessellation:factor,size:(sx,sy)};
  let mut draft=if let Some(w)=storage{
   if surface!=1||w.as_object().is_none_or(|m|m.len()!=5||m.keys().any(|k|!matches!(k.as_str(),"index"|"expectedX"|"expectedY"|"expectedOrientation"|"copyContents"))){return Err(bad);}
   let i=w.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   let (key,obj)=objects.iter().nth(i).ok_or(bad)?;
   let old=(coord(w,"expectedX")?,coord(w,"expectedY")?);
   let old_orientation=w.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
   let copy=w.get("copyContents").and_then(Value::as_bool).ok_or(bad)?;
   if !source_ids.insert(key.clone())||!within_room(old)||obj["Orientation"].as_str()!=Some(old_orientation)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old_orientation)||!storage_pose(&root,obj){return Err(bad);}
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:item};
   if crate::grid_instance_preview::grid_identity_dependencies(source,&target)?.blocking()>0{return Err(bad);}
   ddv_save_patch::preview_storage_duplicate(&working,&target,old,&d,xy,orientation,amount,copy,free).map_err(|_|CodecError::Patch)?
  }else if let Some(scene)=scene{
   let tree=crate::grid_instance_preview::checked_support_scene(item,scene)?;
   let current:Value=serde_json::from_str(&working).map_err(|_|bad)?;
   let actual=current["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64();
   if actual!=Some(u64::from(amount)){return Err(bad);}
   let fresh=ddv_save_patch::room_grid_next_object_id(&current["World"]["GridCollection"]["Grids"][&gid]).map_err(|_|bad)?.to_string();
   let draft=ddv_save_patch::support_clone::preview_indoor_support_scene_place_mode(&working,item,&d,xy,orientation,tree,free).map_err(|_|CodecError::Patch)?;
   let after:Value=serde_json::from_str(&draft.patched_json).map_err(|_|bad)?;
   let c=after["World"]["GridCollection"].as_object().ok_or(bad)?;
   if &crate::grid_instance_preview::subgrid_tree(c,&gid,&fresh)?!=tree{return Err(bad);}
   draft
  }else if let Some(w)=support{
   if w.as_object().is_none_or(|m|m.len()!=4||m.keys().any(|k|!matches!(k.as_str(),"index"|"expectedX"|"expectedY"|"expectedOrientation"))){return Err(bad);}
   let i=w.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   let (key,obj)=objects.iter().nth(i).ok_or(bad)?;
   if !source_ids.insert(key.clone()){return Err(bad);}
   let old=(coord(w,"expectedX")?,coord(w,"expectedY")?);
   let old_orientation=w.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
   if !(if free{within_room(old)}else{on_terrain(old)})||obj.get("ID").and_then(id).is_none_or(|n|n.to_string()!=*key)||obj.get("ItemID").and_then(id)!=Some(item)||
    (coord(obj,"X")?,coord(obj,"Y")?)!=old||obj.get("Orientation").and_then(Value::as_str)!=Some(old_orientation)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old_orientation)||
    obj.get("State").and_then(Value::as_object).is_none_or(|m|m.len()!=1||!m.contains_key("SubGrid")){return Err(bad);}
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:item};
   if crate::grid_instance_preview::grid_identity_dependencies(source,&target)?.blocking()>0{return Err(bad);}
   let c=collection.as_object().ok_or(bad)?;
   let tree=crate::grid_instance_preview::subgrid_tree(c,&gid,key)?;
   fn descendants(t:&Value)->Result<usize,CodecError>{let mut n=0usize;for o in t.get("objects").and_then(Value::as_array).ok_or(CodecError::Json)?{n+=1;if let Some(c)=o.get("child").filter(|v|!v.is_null()){n+=descendants(c)?;}}Ok(n)}
   clone_total+=descendants(&tree)?;if clone_total+rows.len()>128{return Err(bad);}
   let current:Value=serde_json::from_str(&working).map_err(|_|bad)?;
   let actual=current["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64();
   if actual!=Some(u64::from(amount)){return Err(bad);}
   let fresh=ddv_save_patch::room_grid_next_object_id(&current["World"]["GridCollection"]["Grids"][&gid]).map_err(|_|bad)?.to_string();
   let draft=ddv_save_patch::support_clone::preview_indoor_support_tree_duplicate_mode(&working,&target,old,&d,xy,orientation,free).map_err(|_|CodecError::Patch)?;
   let after:Value=serde_json::from_str(&draft.patched_json).map_err(|_|bad)?;
   let c=after["World"]["GridCollection"].as_object().ok_or(bad)?;
   if crate::grid_instance_preview::subgrid_tree(c,&gid,key)?!=tree||crate::grid_instance_preview::subgrid_tree(c,&gid,&fresh)?!=tree{return Err(bad);}
   draft
  }else if crate::storage_source::is_storage(item){
   if surface!=1{return Err(bad);}
   let (template,capacity)=crate::storage_source::placement_storage_template(&root,item).ok_or(bad)?;
   ddv_save_patch::preview_initial_storage(&working,&d,item,xy,orientation,amount,template,capacity,true,free).map_err(|_|CodecError::Patch)?
  }else if free{ddv_save_patch::preview_free_indoor_grid_stock_place(&working,&d,item,xy,orientation,amount).map_err(|_|CodecError::Patch)?}else{ddv_save_patch::preview_indoor_grid_stock_place(&working,&d,item,xy,orientation,amount).map_err(|_|CodecError::Patch)?};
  if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
  working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
  }
  let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
 }
 if let Some(value)=p.get("pickup"){
  use ddv_save_patch::bulk_furniture::{BulkPickup,preview_bulk_furniture};
  let rows=if let Some(a)=value.as_array(){a.as_slice()}else{std::slice::from_ref(value)};
  if rows.is_empty()||rows.len()>32{return Err(bad);}
  let mut targets=Vec::new();let mut seen=std::collections::HashSet::new();let mut flags=Vec::new();let mut storage_flags=Vec::new();
  for row in rows{
   let support=row.get("includeSupport").and_then(Value::as_bool)==Some(true);
   let storage=row.get("storageEmpty").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
   if support&&storage||row.as_object().is_none_or(|r|r.len()!=6+usize::from(support)+usize::from(storage)||r.keys().any(|k|!matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"expectedStock"|"includeSupport"|"storageEmpty")))||row.get("includeSupport").is_some()&&!support{return Err(bad);}
   let (target,expected,orientation)=resolve(row)?;
   let amount=row.get("expectedStock").and_then(Value::as_u64).filter(|n|*n<=i32::MAX as u64).ok_or(bad)?;
   let actual=root.get("Player").and_then(|v|v.get("ListInventories")).and_then(|v|v.get("0")).and_then(|v|v.get("Inventory")).and_then(|v|v.get(target.item_id.to_string())).and_then(|v|v.get("Amount")).and_then(Value::as_u64);
   if actual!=Some(amount)||!seen.insert(target.object_id.clone()){return Err(bad);}
   if storage&&(!ddv_save_patch::storage_pickup_eligible(&root,&objects[&target.object_id])||crate::grid_instance_preview::grid_identity_dependencies(source,&target)?.historical>0){return Err(bad);}
   targets.push((target,expected,orientation));flags.push(support);storage_flags.push(storage);
  }
  if free||storage_flags.iter().any(|f|*f){
   use zeroize::{Zeroize,Zeroizing};
   let mut working=Zeroizing::new(json.to_owned());let mut last=None;let mut counts=std::collections::HashMap::<u64,u32>::new();
   // Validate all witnesses against the original before staging leaves.
   // Support trees are resolved by stable identity again after leaf removal.
   for ((((target,expected,_),row),&storage),&support) in targets.iter().zip(rows).zip(&storage_flags).zip(&flags){
    if support{continue;}
    let initial=row["expectedStock"].as_u64().ok_or(bad)? as u32;let amount=counts.entry(target.item_id).or_insert(initial);
    let mut draft=(if storage{ddv_save_patch::preview_empty_storage_pickup(&working,target,*expected,*amount)}else{ddv_save_patch::preview_furniture_stock_transaction(&working,*amount,ddv_save_patch::FurnitureStockAction::Pickup{target,expected:*expected})}).map_err(|_|CodecError::Patch)?;
    *amount=amount.checked_add(1).ok_or(bad)?;
    working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
   }
   if flags.iter().any(|f|*f){
    let ordinals=crate::grid_instance_preview::room_pickup_ordinals(working.as_bytes())?;
    let mut plan=Vec::new();
    for ((target,expected,orientation),support) in targets.iter().zip(&flags){
     if !support{continue;}
     let ordinal=ordinals.get(&(target.grid_id.clone(),target.object_id.clone())).ok_or(bad)?;
     plan.push(serde_json::json!({"localOrdinal":ordinal,"itemId":target.item_id.to_string(),"expectedX":expected.0,"expectedY":expected.1,"expectedOrientation":orientation,"includeSupport":true}));
    }
    let patched_json=crate::grid_instance_preview::group_pickup_candidate(working.as_bytes(),&serde_json::to_string(&plan).map_err(|_|bad)?)?;
    return Ok(ddv_save_patch::GridCoordinateDraft{patched_json,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false});
   }
   let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
  }
  if flags.iter().any(|f|*f){
   let ordinals=crate::grid_instance_preview::room_pickup_ordinals(source)?;
   let mut plan=Vec::new();
   for ((target,expected,orientation),support) in targets.iter().zip(flags){
    let ordinal=ordinals.get(&(target.grid_id.clone(),target.object_id.clone())).ok_or(bad)?;
    let mut row=serde_json::json!({"localOrdinal":ordinal,"itemId":target.item_id.to_string(),"expectedX":expected.0,"expectedY":expected.1,"expectedOrientation":orientation});
    if support{row["includeSupport"]=Value::Bool(true);}plan.push(row);
   }
   let patched_json=crate::grid_instance_preview::group_pickup_candidate(source,&serde_json::to_string(&plan).map_err(|_|bad)?)?;
   return Ok(ddv_save_patch::GridCoordinateDraft{patched_json,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false});
  }
  let pickups=targets.iter().map(|(target,expected,orientation)|BulkPickup{target,expected:*expected,orientation:orientation.as_str()}).collect::<Vec<_>>();
  return preview_bulk_furniture(json,&pickups,&[]).map_err(|_|CodecError::Patch);
 }
 let alignment=p.contains_key("align");
 let paired_rotate=p.contains_key("pairedRotate");
 let paired=p.get(if paired_rotate{"pairedRotate"}else{"paired"}).map(|v|v.as_object().filter(|m|m.len()==2&&m.contains_key("mode")&&m.contains_key("edits")).ok_or(bad)).transpose()?;
 let mode=paired.map(|m|m.get("mode").and_then(Value::as_str).filter(|s|matches!(*s,"vertical"|"horizontal"|"point")).ok_or(bad)).transpose()?;
 let rows=(if let Some(m)=paired{m.get("edits")}else{p.get(if alignment{"align"}else{"edits"})}).and_then(Value::as_array).filter(|a|!a.is_empty()&&a.len()<=32).ok_or(bad)?;
 if mode.is_some()&&rows.len()<2{return Err(bad);}
 let mut edits=Vec::new();
 for row in rows{
  if row.as_object().is_none_or(|r|r.len()!=8||r.keys().any(|k|!matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"))){return Err(bad);}
  let (target,expected,old)=resolve(row)?;
  let xy=(coord(row,"x")?,coord(row,"y")?);let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if !allowed_orientation(orientation)||storage_pose(&root,&objects[&target.object_id])&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(bad);}
  if mode.is_some()&&(!(if free{within_room(expected)&&within_room(xy)}else{on_terrain(expected)&&on_terrain(xy)})||if paired_rotate{old==orientation}else{old!=orientation||xy==expected}){return Err(bad);}
  if alignment&&(old!=orientation||!(if free{within_room(expected)&&within_room(xy)}else{on_terrain(expected)&&on_terrain(xy)})||xy.0!=expected.0&&xy.1!=expected.1){return Err(bad);}
  if free{if !within_room(xy)||xy==expected&&old==orientation{return Err(bad);}}
  else if rows.len()==1{
   if xy==expected&&old==orientation{return Err(bad);}
   if xy!=expected&&(!on_terrain(expected)||!on_terrain(xy)||!empty_anchor(xy,Some(target.object_id.as_str()))){return Err(bad);}
   if terrain.is_some()&&(!on_terrain(expected)||!on_terrain(xy)){return Err(bad);}
  }else if xy==expected&&old==orientation{return Err(bad);}
  edits.push(GridMixedEdit{target,expected,position:(xy!=expected).then_some(xy),orientation:(old!=orientation).then(||(old,orientation.to_owned()))});
 }
 if free&&mode.is_none(){
  if alignment{
   if !edits.iter().all(|e|e.position.is_some_and(|xy|xy.0==e.expected.0))&&!edits.iter().all(|e|e.position.is_some_and(|xy|xy.1==e.expected.1)){return Err(bad);}
  }else if edits.len()>1{
   let rotation=|e:&GridMixedEdit|->Option<usize>{let (a,b)=e.orientation.as_ref()?;let names=ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS;let before=names.iter().position(|v|*v==a.as_str())?;let after=names.iter().position(|v|*v==b.as_str())?;Some((after+8-before)%8)};
   if let Some(turn)=rotation(&edits[0]){
    if !matches!(turn,2|6)||edits.iter().any(|e|rotation(e)!=Some(turn)||!within_room(e.expected)){return Err(bad);}
   }else{
    let first=edits[0].position.ok_or(bad)?;let delta=(i64::from(first.0)-i64::from(edits[0].expected.0),i64::from(first.1)-i64::from(edits[0].expected.1));if edits.iter().any(|e|e.orientation.is_some()||e.position.is_none_or(|xy|(i64::from(xy.0)-i64::from(e.expected.0),i64::from(xy.1)-i64::from(e.expected.1))!=delta)){return Err(bad);}
   }
  }
  return ddv_save_patch::preview_existing_grid_mixed_batch(json,&edits).map_err(|_|CodecError::Patch);
 }
 if edits.len()>1{
  let swap=edits.len()==2&&edits.iter().all(|e|e.orientation.is_none())&&edits[0].position==Some(edits[1].expected)&&edits[1].position==Some(edits[0].expected);
  if let Some(mode)=mode{
   let selected:std::collections::HashSet<_>=edits.iter().map(|e|e.target.object_id.as_str()).collect();
   if selected.len()!=edits.len(){return Err(bad);}
   let mut anchors=std::collections::HashSet::new();
   let delta=|e:&GridMixedEdit|{let xy=e.position.unwrap_or(e.expected);(i64::from(xy.0)-i64::from(e.expected.0),i64::from(xy.1)-i64::from(e.expected.1))};
   let reflect=|(x,y):(i64,i64)|{(if mode=="horizontal"{x}else{-x},if mode=="vertical"{y}else{-y})};
   let first=delta(&edits[0]);let other=reflect(first);
   let turn=|e:&GridMixedEdit|->Option<usize>{let (a,b)=e.orientation.as_ref()?;let names=&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS;let before=names.iter().position(|v|*v==a.as_str())?;let after=names.iter().position(|v|*v==b.as_str())?;Some((after+8-before)%8)};
   let expected_turn=|n:usize|if mode=="point"{n}else{(8-n)%8};
   let first_turn=turn(&edits[0]);
   if paired_rotate&&first_turn.is_none_or(|n|!matches!(n,2|6)){return Err(bad);}
   let mut matched=vec![false;edits.len()];
   for (i,e) in edits.iter().enumerate(){let xy=e.position.unwrap_or(e.expected);
    if (!paired_rotate&&delta(e)!=first&&delta(e)!=other)||paired_rotate&&turn(e).is_none_or(|n|Some(n)!=first_turn&&Some(expected_turn(n))!=first_turn)||!free&&(!anchors.insert(xy)||objects.iter().any(|(k,v)|!selected.contains(k.as_str())&&coord(v,"X").ok()==Some(xy.0)&&coord(v,"Y").ok()==Some(xy.1))){return Err(bad);}
    if matched[i]{continue;}
    let j=(i+1..edits.len()).find(|j|!matched[*j]&&edits[*j].target.item_id==e.target.item_id&&if paired_rotate{turn(e).is_some_and(|n|turn(&edits[*j])==Some(expected_turn(n)))}else{delta(&edits[*j])==reflect(delta(e))}).ok_or(bad)?;
    matched[i]=true;matched[j]=true;
   }
  }else if alignment{
   let selected:std::collections::HashSet<_>=edits.iter().map(|e|e.target.object_id.as_str()).collect();
   if selected.len()!=edits.len()||!edits.iter().all(|e|e.position.is_some_and(|xy|xy.0==e.expected.0))&&!edits.iter().all(|e|e.position.is_some_and(|xy|xy.1==e.expected.1)){return Err(bad);}
   let mut anchors=std::collections::HashSet::new();
   for e in &edits{let xy=e.position.ok_or(bad)?;
    if !anchors.insert(xy)||objects.iter().any(|(k,v)|!selected.contains(k.as_str())&&coord(v,"X").ok()==Some(xy.0)&&coord(v,"Y").ok()==Some(xy.1)){return Err(bad);}
   }
  }else if !swap{
   let turn=|e:&GridMixedEdit|->Option<usize>{
    let (a,b)=e.orientation.as_ref()?;
    let names=ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS;
    let before=names.iter().position(|v|*v==a.as_str())?;
    let after=names.iter().position(|v|*v==b.as_str())?;
    Some((after+4-before)%4)
   };
   let rotation=turn(&edits[0]);
   if rotation.is_some_and(|n|!matches!(n,1|3)){return Err(bad);}
   let first=edits[0].position.unwrap_or(edits[0].expected);
   let delta=(i64::from(first.0)-i64::from(edits[0].expected.0),i64::from(first.1)-i64::from(edits[0].expected.1));
   let selected:std::collections::HashSet<_>=edits.iter().map(|e|e.target.object_id.as_str()).collect();
   if selected.len()!=edits.len(){return Err(bad);}
   let mut anchors=std::collections::HashSet::new();
   for e in &edits{
    let xy=e.position.unwrap_or(e.expected);
    if turn(e)!=rotation||!on_terrain(e.expected)||!on_terrain(xy)||
       rotation.is_none()&&(i64::from(xy.0)-i64::from(e.expected.0),i64::from(xy.1)-i64::from(e.expected.1))!=delta||
       !anchors.insert(xy)||objects.iter().any(|(k,v)|!selected.contains(k.as_str())&&coord(v,"X").ok()==Some(xy.0)&&coord(v,"Y").ok()==Some(xy.1)){return Err(bad);}
   }
  }
 }
 ddv_save_patch::preview_existing_grid_mixed_batch(json,&edits).map_err(|_|CodecError::Patch)
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn storage_cut_between_rooms_keeps_original_container_and_lexical_state(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}],"Unknown":1e2}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42},"1":{"FloorGridID":43}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State": { "Storage": { "ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null } }}}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{"2":{"ID":2,"ItemID":40000001,"X":3,"Y":3,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"freePlacement":true,"transfer":[{"roomSource":{"roomOrdinal":1,"index":0},"itemId":40001680,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":3,"y":3,"orientation":"GridOrientation_Left","storage":true}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&d.patched_json).unwrap();let old:Value=serde_json::from_slice(raw).unwrap();
  assert_eq!(v["Player"],old["Player"]);assert!(d.patched_json.contains("1e2"));assert!(d.patched_json.contains(r#"{ "Storage": { "ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null } }"#));
  let g=&v["World"]["GridCollection"]["Grids"];assert!(g["42"]["Objects"].as_object().unwrap().is_empty());assert_eq!(g["43"]["Objects"]["5"]["State"],old["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);assert_eq!(g["43"]["Objects"]["5"]["Orientation"],"GridOrientation_Left");assert_eq!(g["43"]["NextGridObjectID"],6);assert_eq!(g["43"]["Objects"]["2"],old["World"]["GridCollection"]["Grids"]["43"]["Objects"]["2"]);
  plan["transfer"][0]["orientation"]=json!("GridOrientation_DownLeft");assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["transfer"][0]["orientation"]=json!("GridOrientation_Left");plan["transfer"][0].as_object_mut().unwrap().remove("storage");assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn initial_storage_creates_native_record_and_can_be_returned_and_replaced(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":10,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001680":{"Amount":2}}}},"ContainerInventories":{}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}}}}},"Marker":1e2}"#;
  let plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"place":[{"itemId":40001680,"expectedStock":2,"x":3,"y":3,"orientation":"GridOrientation_Left"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(v["Player"]["ContainerInventories"]["10"]["Size"],48);assert_eq!(v["Player"]["ContainerInventories"]["10"]["Inventory"],json!([]));assert_eq!(v["Player"]["NextContainerInventoryID"],11);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"]["Storage"]["ContainerInventoryID"],10);assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],1);assert!(d.patched_json.contains("1e2"));
  let pickup=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"pickup":[{"index":0,"itemId":40001680,"expectedX":3,"expectedY":3,"expectedOrientation":"GridOrientation_Left","expectedStock":1,"storageEmpty":true}]});
  let removed=furniture_candidate(d.patched_json.as_bytes(),&pickup.to_string()).unwrap();
  let placed=furniture_candidate(removed.patched_json.as_bytes(),&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&placed.patched_json).unwrap();
  assert!(v["Player"]["ContainerInventories"].get("10").is_none());assert_eq!(v["Player"]["ContainerInventories"]["11"]["Size"],48);assert_eq!(v["Player"]["NextContainerInventoryID"],12);assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]["State"]["Storage"]["ContainerInventoryID"],11);
 }
 #[test]
 fn storage_pickup_rejects_nonempty_and_preserves_shared_container(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":10,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001680":{"Amount":2}}}},"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[],"BlockMoveTo":false,"ExtraSize":0}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
  let old:Value=serde_json::from_slice(raw).unwrap();
  let plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"pickup":[{"index":0,"itemId":40001680,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","expectedStock":2,"storageEmpty":true}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert!(v["Player"]["ContainerInventories"].as_object().unwrap().is_empty());assert_eq!(v["Player"]["NextContainerInventoryID"],10);assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],3);assert!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());assert!(d.patched_json.contains("1e2"));
  let mut shared=old.clone();let mut obj=shared["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"].clone();obj["ID"]=2.into();obj["X"]=4.into();shared["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]=obj.clone();
  let d=furniture_candidate(&serde_json::to_vec(&shared).unwrap(),&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&d.patched_json).unwrap();assert_eq!(v["Player"]["ContainerInventories"]["9"],old["Player"]["ContainerInventories"]["9"]);assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"],obj);
  let mut nonempty=old.clone();nonempty["Player"]["ContainerInventories"]["9"]["Inventory"]=json!([{"ItemID":30000001,"Amount":1,"State":null}]);assert!(furniture_candidate(&serde_json::to_vec(&nonempty).unwrap(),&plan.to_string()).is_err());
  let mut unmarked=plan.clone();unmarked["pickup"][0].as_object_mut().unwrap().remove("storageEmpty");assert!(furniture_candidate(raw,&unmarked.to_string()).is_err());
 }
 #[test]
 fn storage_duplicate_allocates_independent_container_and_preserves_original(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":10,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001680":{"Amount":2}}}},"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}],"BlockMoveTo":false,"ExtraSize":0}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
  let old:Value=serde_json::from_slice(raw).unwrap();
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"place":[{"itemId":40001680,"expectedStock":2,"x":3,"y":3,"orientation":"GridOrientation_Left","storageSource":{"index":0,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","copyContents":true}}]});
  let mut known=old.clone();
  let contents=json!([{"ItemID":30300001,"Amount":2,"State":{"MealData":{"IngredientsUsed":[30200001],"SceneRestriction":null}}},{"ItemID":31500001,"Amount":1,"State":{"ConsummableData":{"ItemID":70100001,"Amount":1,"State":null}}}]);
  known["Player"]["ContainerInventories"]["9"]["Inventory"]=contents.clone();
  let candidate=furniture_candidate(&serde_json::to_vec(&known).unwrap(),&plan.to_string()).unwrap();
  let copied:Value=serde_json::from_str(&candidate.patched_json).unwrap();
  assert_eq!(copied["Player"]["ContainerInventories"]["10"]["Inventory"],contents);
  assert_eq!(copied["Player"]["ContainerInventories"]["9"],known["Player"]["ContainerInventories"]["9"]);
  let draft=furniture_candidate(raw,&plan.to_string()).unwrap();let after:Value=serde_json::from_str(&draft.patched_json).unwrap();
  assert_eq!(after["Player"]["ContainerInventories"]["9"],old["Player"]["ContainerInventories"]["9"]);
  assert_eq!(after["Player"]["ContainerInventories"]["10"]["Inventory"],old["Player"]["ContainerInventories"]["9"]["Inventory"]);
  assert_eq!(after["Player"]["ContainerInventories"]["10"]["ID"],10);assert_eq!(after["Player"]["NextContainerInventoryID"],11);
  assert_eq!(after["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],1);
  assert_eq!(after["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"],old["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
  assert_eq!(after["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"]["Storage"]["ContainerInventoryID"],10);assert!(draft.patched_json.contains("1e2"));
  let original_plan=plan.clone();
  let mut batch_source=old.clone();
  let mut second=batch_source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"].clone();second["ID"]=2.into();second["X"]=2.into();
  batch_source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]=second;
  batch_source["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]=json!({"Amount":1});
  let mut second=plan["place"][0].clone();second["x"]=5.into();second["expectedStock"]=1.into();second["storageSource"]["index"]=1.into();second["storageSource"]["expectedX"]=2.into();second["storageSource"]["copyContents"]=false.into();
  plan["place"]=json!([plan["place"][0].clone(),{"itemId":40000001,"expectedStock":1,"x":4,"y":3,"orientation":"GridOrientation_Down"},second]);
  let result=furniture_candidate(&serde_json::to_vec(&batch_source).unwrap(),&plan.to_string()).unwrap();
  let v:Value=serde_json::from_str(&result.patched_json).unwrap();
  assert_eq!(v["Player"]["ContainerInventories"]["10"]["Inventory"],old["Player"]["ContainerInventories"]["9"]["Inventory"]);
  assert_eq!(v["Player"]["ContainerInventories"]["11"]["Inventory"],json!([]));
  assert_eq!(v["Player"]["NextContainerInventoryID"],12);
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],0);
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
  plan["place"][2]["storageSource"]["expectedX"]=99.into();
  assert!(furniture_candidate(&serde_json::to_vec(&batch_source).unwrap(),&plan.to_string()).is_err());
  plan=original_plan;
  plan["place"][0]["storageSource"]["copyContents"]=json!(false);
  let empty:Value=serde_json::from_str(&furniture_candidate(raw,&plan.to_string()).unwrap().patched_json).unwrap();assert_eq!(empty["Player"]["ContainerInventories"]["10"]["Inventory"],json!([]));
  let mut invalid=old.clone();invalid["World"]["Unknown"]=json!({"ContainerInventoryID":10});assert!(furniture_candidate(&serde_json::to_vec(&invalid).unwrap(),&plan.to_string()).is_err());
  let mut stateful=old;stateful["Player"]["ContainerInventories"]["9"]["Inventory"][0]["State"]=json!({"Unknown":1});plan["place"][0]["storageSource"]["copyContents"]=json!(true);assert!(furniture_candidate(&serde_json::to_vec(&stateful).unwrap(),&plan.to_string()).is_err());
 }
 #[test]
 fn storage_root_moves_without_changing_container_or_state(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}],"Unknown":1e2}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}},"2":{"ID":2,"ItemID":40000001,"X":6,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"edits":[{"index":0,"itemId":40001680,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":6,"y":2,"orientation":"GridOrientation_Left"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=6.into();expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Orientation"]=json!("GridOrientation_Left");
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);assert!(d.patched_json.contains("1e2"));
  let report:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();assert_eq!(report["rooms"][0]["surfaces"][0]["positions"][0]["storage"],true);
  plan["edits"][0]["orientation"]=json!("GridOrientation_DownLeft");assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["edits"][0]["orientation"]=json!("GridOrientation_Left");
  let mut invalid:Value=serde_json::from_slice(raw).unwrap();invalid["Player"]["ContainerInventories"]["9"]["ID"]=10.into();assert!(furniture_candidate(&serde_json::to_vec(&invalid).unwrap(),&plan.to_string()).is_err());
  invalid["Player"]["ContainerInventories"]["9"]["ID"]=9.into();invalid["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]["Unknown"]=json!({});assert!(furniture_candidate(&serde_json::to_vec(&invalid).unwrap(),&plan.to_string()).is_err());
 }
 #[test]
 fn free_room_floor_allows_repeated_anchors_but_rejects_state_and_outside_bounds(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":6,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":6,"y":2,"orientation":"GridOrientation_DownLeft"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let out:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Orientation"],"GridOrientation_DownLeft");
  assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"],6);
  assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"],6);
  assert!(d.patched_json.contains("1e2"));
  let projected:Value=serde_json::from_str(&project(d.patched_json.as_bytes()).unwrap()).unwrap();
  assert_eq!(projected["rooms"][0]["surfaces"][0]["positions"][0]["orientationCode"],10);
  plan["edits"][0]["x"]=999.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["edits"][0]["x"]=6.into();let mut invalid:Value=serde_json::from_slice(raw).unwrap();invalid["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"Unknown":1});
  assert!(furniture_candidate(invalid.to_string().as_bytes(),&plan.to_string()).is_err());
 }
 #[test]
 fn free_room_group_turn_is_atomic_and_preserves_diagonal_objects(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":3,"Y":1,"Orientation":"GridOrientation_Down"},"3":{"ID":3,"ItemID":40000002,"X":1,"Y":3,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_DownLeft","x":1,"y":1,"orientation":"GridOrientation_DownRight"},{"index":1,"itemId":40000001,"expectedX":3,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":1,"y":3,"orientation":"GridOrientation_Right"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  let objs=&mut expected["World"]["GridCollection"]["Grids"]["42"]["Objects"];
  objs["1"]["Orientation"]=json!("GridOrientation_DownRight");
  objs["2"]["Orientation"]=json!("GridOrientation_Right");objs["2"]["X"]=1.into();objs["2"]["Y"]=3.into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  assert!(d.patched_json.contains("1e2"));
  plan["edits"][1]["orientation"]=json!("GridOrientation_Left");assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["edits"][1]["orientation"]=json!("GridOrientation_Right");plan["edits"][1]["x"]=999.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["edits"][1]["x"]=1.into();let mut stateful:Value=serde_json::from_slice(raw).unwrap();stateful["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"Unknown":1});
  assert!(furniture_candidate(stateful.to_string().as_bytes(),&plan.to_string()).is_err());
 }
 #[test]
 fn free_room_alignment_accepts_overlap_but_not_mixed_axes_or_stale_state(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":4,"Y":3,"Orientation":"GridOrientation_Down"},"3":{"ID":3,"ItemID":40000002,"X":1,"Y":3,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"align":[{"index":0,"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_DownLeft","x":1,"y":2,"orientation":"GridOrientation_DownLeft"},{"index":1,"itemId":40000001,"expectedX":4,"expectedY":3,"expectedOrientation":"GridOrientation_Down","x":1,"y":3,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=1.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"]=1.into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  assert!(d.patched_json.contains("1e2"));
  plan["align"][1]["x"]=4.into();plan["align"][1]["y"]=4.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["align"][1]["x"]=1.into();plan["align"][1]["y"]=3.into();plan["align"][0]["expectedX"]=9.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn free_linked_room_move_and_turn_preserve_diagonal_partners(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":4,"Y":1,"Orientation":"GridOrientation_DownRight"},"3":{"ID":3,"ItemID":40000002,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"paired":{"mode":"vertical","edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_DownLeft","x":2,"y":2,"orientation":"GridOrientation_DownLeft"},{"index":1,"itemId":40000001,"expectedX":4,"expectedY":1,"expectedOrientation":"GridOrientation_DownRight","x":3,"y":2,"orientation":"GridOrientation_DownRight"}]}});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=2.into();expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Y"]=2.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"]=3.into();expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["Y"]=2.into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  plan["paired"]["edits"][1]["x"]=5.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  let mut turn=json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"pairedRotate":{"mode":"vertical","edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_DownLeft","x":1,"y":1,"orientation":"GridOrientation_UpLeft"},{"index":1,"itemId":40000001,"expectedX":4,"expectedY":1,"expectedOrientation":"GridOrientation_DownRight","x":4,"y":1,"orientation":"GridOrientation_UpRight"}]}});
  let d=furniture_candidate(raw,&turn.to_string()).unwrap();assert!(d.patched_json.contains("1e2"));
  turn["pairedRotate"]["edits"][1]["orientation"]=json!("GridOrientation_DownLeft");assert!(furniture_candidate(raw,&turn.to_string()).is_err());
 }
 #[test]
 fn linked_room_move_requires_mirrored_deltas_and_exact_native_targets(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":6,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"paired":{"mode":"vertical","edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":2,"y":3,"orientation":"GridOrientation_Down"},{"index":1,"itemId":40000001,"expectedX":6,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":5,"y":3,"orientation":"GridOrientation_Down"}]}});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let out:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"],5);
  assert!(d.patched_json.contains("1e2"));
  plan["paired"]["edits"][1]["x"]=7.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["paired"]["edits"][1]["x"]=5.into();plan["paired"]["mode"]="point".into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn room_alignment_is_atomic_and_single_axis(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":4,"Y":3,"Orientation":"GridOrientation_Down"},"3":{"ID":3,"ItemID":40000002,"X":1,"Y":4,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"align":[{"index":0,"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":1,"y":2,"orientation":"GridOrientation_Down"},{"index":1,"itemId":40000001,"expectedX":4,"expectedY":3,"expectedOrientation":"GridOrientation_Down","x":1,"y":3,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=1.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"]=1.into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  assert!(d.patched_json.contains("1e2"));
  plan["align"][1]["y"]=4.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["align"][1]["y"]=3.into();plan["align"][1]["orientation"]="GridOrientation_Left".into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
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
 fn native_room_zero_allocator_and_original_zero_object_are_compatible_with_placement(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":0,"Objects":{}}}}}}"#;
  let plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"place":[{"itemId":40000001,"expectedStock":2,"x":2,"y":2,"orientation":"GridOrientation_Down"},{"itemId":40000001,"expectedStock":1,"x":3,"y":3,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  let g=&j["World"]["GridCollection"]["Grids"]["42"];assert_eq!(g["NextGridObjectID"],3);assert_eq!(g["Objects"]["1"]["ID"],1);assert_eq!(g["Objects"]["2"]["ID"],2);assert!(d.patched_json.contains("\"Marker\":1e2"));
  let mut source:Value=serde_json::from_slice(raw).unwrap();
  source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["0"]=json!({"ID":0,"ItemID":40300001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"});
  assert!(furniture_candidate(&serde_json::to_vec(&source).unwrap(),&plan.to_string()).is_err());
  source["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"]=json!(1);
  let d=furniture_candidate(&serde_json::to_vec(&source).unwrap(),&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["0"],source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["0"]);
  let projected:Value=serde_json::from_str(&project(d.patched_json.as_bytes()).unwrap()).unwrap();
  assert_eq!(projected["rooms"][0]["surfaces"][0]["positions"][0]["protected"],true);
  source["World"]["SpawnedObjects"]=json!([{"GridID":42,"GridObjectID":1}]);
  assert!(furniture_candidate(&serde_json::to_vec(&source).unwrap(),&plan.to_string()).is_err());
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
 fn room_cut_moves_between_owned_floors_and_outdoors_without_inventory(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43},"1":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}}}}}"#;
  let witness=json!({"roomOrdinal":1,"index":0});
  let mut plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"transfer":{"roomSource":witness,"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":3,"y":3,"orientation":"GridOrientation_Left"}});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(j["World"]["GridCollection"]["Grids"]["44"]["Objects"]["7"]["Orientation"],"GridOrientation_Left");
  assert_eq!(j["World"]["GridCollection"]["Grids"]["44"]["NextGridObjectID"],8);
  assert!(d.patched_json.contains("\"Marker\":1e2"));
  plan["roomOrdinal"]=json!(1);assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  let dest=json!({"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":16,"sizeY":16});
  let mut cut=json!({"roomSource":{"roomOrdinal":1,"index":0},"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":dest,"x":5,"y":5,"orientation":"GridOrientation_Up"});
  let d=crate::grid_instance_preview::group_cut_candidate(raw,&json!([cut.clone()]).to_string()).unwrap();let j:Value=serde_json::from_str(&d).unwrap();
  assert!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["Orientation"],"GridOrientation_Up");
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],4);
  assert!(d.contains("\"Marker\":1e2"));
  let mut shared:Value=serde_json::from_slice(raw).unwrap();
  shared["World"]["PlayerHouses"][0]["Floors"][0]["Rooms"]["1"]["FloorGridID"]=json!(43);
  assert!(room_to_outdoor_candidate(&serde_json::to_vec(&shared).unwrap(),&cut).is_err());
  let mut stale:Value=serde_json::from_slice(raw).unwrap();
  stale["World"]["SpawnedObjects"]=json!([{"GridID":43,"GridObjectID":1}]);
  assert!(room_to_outdoor_candidate(&serde_json::to_vec(&stale).unwrap(),&cut).is_err());
  cut["expectedX"]=json!(9);assert!(room_to_outdoor_candidate(raw,&cut).is_err());
 }
 #[test]
 fn free_room_cut_preserves_overlap_diagonal_and_inventory(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43},"1":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":7,"Objects":{"1":{"ID":1,"ItemID":40000002,"X":3,"Y":3,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"freePlacement":true,"transfer":[{"roomSource":{"roomOrdinal":1,"index":0},"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_DownLeft","x":3,"y":3,"orientation":"GridOrientation_DownLeft"},{"roomSource":{"roomOrdinal":1,"index":1},"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":3,"y":3,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  let orig:Value=serde_json::from_slice(raw).unwrap();
  assert_eq!(j["Player"],orig["Player"]);assert!(d.patched_json.contains("1e2"));
  let g=&j["World"]["GridCollection"]["Grids"];
  assert!(g["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(g["44"]["Objects"]["1"],orig["World"]["GridCollection"]["Grids"]["44"]["Objects"]["1"]);
  assert_eq!(g["44"]["Objects"]["7"]["Orientation"],"GridOrientation_DownLeft");
  assert_eq!(g["44"]["Objects"]["8"]["Orientation"],"GridOrientation_Down");
  assert_eq!(g["44"]["NextGridObjectID"],9);
  plan["transfer"][1]["x"]=999.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["transfer"][1]["x"]=3.into();plan["transfer"][1]["roomSource"]["index"]=0.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn room_support_cut_preserves_native_child_grid_and_stock(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42},"1":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43,"DesignID":null}}},"2":{"ID":2,"ItemID":40005162,"X":6,"Y":4,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":0,"Orientation":"GridOrientation_Down","Marker":1e2}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":2,"NextGridObjectID":7,"Objects":{}}}}}}"#;
  let mut plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"transfer":[{"roomSource":{"roomOrdinal":1,"index":0},"itemId":40005160,"expectedX":4,"expectedY":4,"expectedOrientation":"GridOrientation_Down","x":4,"y":6,"orientation":"GridOrientation_Left","supportFactor":2},{"roomSource":{"roomOrdinal":1,"index":1},"itemId":40005162,"expectedX":6,"expectedY":4,"expectedOrientation":"GridOrientation_Down","x":6,"y":6,"orientation":"GridOrientation_Left"}]});
  let orig:Value=serde_json::from_slice(raw).unwrap();let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(j["Player"],orig["Player"]);let g=&j["World"]["GridCollection"]["Grids"];
  assert_eq!(g["43"],orig["World"]["GridCollection"]["Grids"]["43"]);
  assert!(g["42"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(g["44"]["Objects"]["7"]["State"],orig["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
  assert_eq!(g["44"]["Objects"]["8"]["ItemID"],40005162);assert!(d.patched_json.contains("1e2"));
  plan["transfer"][0]["supportFactor"]=1.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["transfer"][0]["supportFactor"]=2.into();plan["transfer"][1]["x"]=4.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["freePlacement"]=true.into();let free=furniture_candidate(raw,&plan.to_string()).unwrap();let free:Value=serde_json::from_str(&free.patched_json).unwrap();assert_eq!(free["World"]["GridCollection"]["Grids"]["43"],orig["World"]["GridCollection"]["Grids"]["43"]);assert_eq!(free["World"]["GridCollection"]["Grids"]["44"]["Objects"]["7"]["X"],4);assert_eq!(free["World"]["GridCollection"]["Grids"]["44"]["Objects"]["8"]["X"],4);assert_eq!(free["Player"],orig["Player"]);
  plan.as_object_mut().unwrap().remove("freePlacement");
  // Cross the indoor/outdoor boundary and return the same native subtree.
  let mut cross=orig.clone();
  cross["World"]["GridCollection"]["Grids"]["45"]=json!({"ID":45,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":2,"NextGridObjectID":1,"Objects":{}});
  let bytes=serde_json::to_vec(&cross).unwrap();
  let mut outdoor=json!({"roomSource":{"roomOrdinal":1,"index":0},"itemId":"40005160","expectedX":4,"expectedY":4,"expectedOrientation":"GridOrientation_Down","x":4,"y":6,"orientation":"GridOrientation_Left","supportFactor":2,"destination":{"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":2,"sizeX":16,"sizeY":16}});
  let moved=crate::grid_instance_preview::group_cut_candidate(&bytes,&json!([outdoor.clone()]).to_string()).unwrap();
  let after:Value=serde_json::from_str(&moved).unwrap();
  assert_eq!(after["World"]["GridCollection"]["Grids"]["43"],orig["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(after["World"]["GridCollection"]["Grids"]["45"]["Objects"]["1"]["State"]["SubGrid"]["GridID"],43);
  assert_eq!(after["Player"],orig["Player"]);
  let ordinals=crate::grid_instance_preview::room_support_ordinals(moved.as_bytes()).unwrap();
  let ordinal=ordinals.get(&("45".to_owned(),"1".to_owned())).unwrap();
  let mut back=json!({"roomOrdinal":2,"surfaceOrdinal":1,"transfer":[{"localOrdinal":ordinal,"itemId":40005160,"expectedX":4,"expectedY":6,"expectedOrientation":"GridOrientation_Left","x":4,"y":4,"orientation":"GridOrientation_Down","supportFactor":2}]});
  let restored=furniture_candidate(moved.as_bytes(),&back.to_string()).unwrap();
  let after:Value=serde_json::from_str(&restored.patched_json).unwrap();
  assert_eq!(after["World"]["GridCollection"]["Grids"]["43"],orig["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(after["World"]["GridCollection"]["Grids"]["44"]["Objects"]["7"]["State"]["SubGrid"]["GridID"],43);
  assert!(after["World"]["GridCollection"]["Grids"]["45"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(after["Player"],orig["Player"]);
  back["transfer"][0]["supportFactor"]=1.into();assert!(furniture_candidate(moved.as_bytes(),&back.to_string()).is_err());
  outdoor["supportFactor"]=1.into();assert!(crate::grid_instance_preview::group_cut_candidate(&bytes,&json!([outdoor]).to_string()).is_err());
  // Catalog-backed exterior factor one; the native child grid retains
  // its own factor two, original IDs and lexical state across both moves.
  let mut different=orig.clone();
  different["World"]["GridCollection"]["Grids"]["45"]=json!({"ID":45,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"2":{"ID":2,"ItemID":40005162,"X":5,"Y":5,"Orientation":"GridOrientation_Down"}}});
  let mut cross_factor=outdoor.clone();cross_factor["supportFactor"]=2.into();cross_factor["x"]=5.into();cross_factor["y"]=5.into();cross_factor["destination"]=json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100});
  let free_cross=json!({"freePlacement":true,"rows":[cross_factor.clone()]});
  let moved=crate::grid_instance_preview::group_cut_candidate(different.to_string().as_bytes(),&free_cross.to_string()).unwrap();
  let after:Value=serde_json::from_str(&moved).unwrap();let g=&after["World"]["GridCollection"]["Grids"];
  assert_eq!(g["43"],orig["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(g["45"]["Objects"]["2"],different["World"]["GridCollection"]["Grids"]["45"]["Objects"]["2"]);
  assert_eq!(g["45"]["Objects"]["3"]["State"],orig["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
  assert_eq!(after["Player"],orig["Player"]);
  let ordinals=crate::grid_instance_preview::room_support_ordinals(moved.as_bytes()).unwrap();
  let ordinal=ordinals.get(&("45".to_owned(),"3".to_owned())).unwrap();
  let mut return_plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"freePlacement":true,"transfer":[{"localOrdinal":ordinal,"itemId":40005160,"expectedX":5,"expectedY":5,"expectedOrientation":"GridOrientation_Left","x":6,"y":6,"orientation":"GridOrientation_Down","supportFactor":1}]});
  let returned=furniture_candidate(moved.as_bytes(),&return_plan.to_string()).unwrap();
  let after:Value=serde_json::from_str(&returned.patched_json).unwrap();
  assert_eq!(after["World"]["GridCollection"]["Grids"]["43"],orig["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(after["World"]["GridCollection"]["Grids"]["44"]["Objects"]["7"]["State"]["SubGrid"]["GridID"],43);
  assert_eq!(after["Player"],orig["Player"]);
  return_plan["transfer"][0]["supportFactor"]=2.into();assert!(furniture_candidate(moved.as_bytes(),&return_plan.to_string()).is_err());
  return_plan["transfer"][0]["supportFactor"]=1.into();return_plan["transfer"][0]["x"]=999.into();assert!(furniture_candidate(moved.as_bytes(),&return_plan.to_string()).is_err());
  let mut forged=free_cross.clone();forged["rows"][0]["destination"]["factor"]=2.into();assert!(crate::grid_instance_preview::group_cut_candidate(different.to_string().as_bytes(),&forged.to_string()).is_err());
  let mut alias=orig.clone();alias["World"]["GridCollection"]["Grids"]["44"]["Objects"]["1"]=orig["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"].clone();
  plan["transfer"][1]["x"]=6.into();assert!(furniture_candidate(&serde_json::to_vec(&alias).unwrap(),&plan.to_string()).is_err());
 }
 #[test]
 fn room_group_cut_is_atomic_and_source_indices_do_not_shift(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43},"1":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":4,"Y":2,"Orientation":"GridOrientation_Down"}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}}}}}"#;
  let rows=json!([
   {"roomSource":{"roomOrdinal":1,"index":0},"itemId":40000001,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":2,"y":3,"orientation":"GridOrientation_Left"},
   {"roomSource":{"roomOrdinal":1,"index":1},"itemId":40000001,"expectedX":4,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":4,"y":3,"orientation":"GridOrientation_Left"}
  ]);
  let mut plan=json!({"roomOrdinal":2,"surfaceOrdinal":1,"transfer":rows.clone()});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(j["World"]["GridCollection"]["Grids"]["44"]["Objects"]["7"]["X"],2);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["44"]["Objects"]["8"]["X"],4);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["44"]["NextGridObjectID"],9);
  assert!(d.patched_json.contains("\"Marker\":1e2"));
  plan["transfer"][1]["x"]=json!(2);assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  plan["transfer"][1]["x"]=json!(4);plan["transfer"][1]["expectedX"]=json!(5);assert!(furniture_candidate(raw,&plan.to_string()).is_err());
  let dest=json!({"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":16,"sizeY":16});
  let mut outdoor=rows.as_array().unwrap().clone();
  for row in &mut outdoor{row["destination"]=dest.clone();row["itemId"]=json!("40000001");}
  let d=crate::grid_instance_preview::group_cut_candidate(raw,&json!(outdoor.clone()).to_string()).unwrap();
  let j:Value=serde_json::from_str(&d).unwrap();assert!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["X"],4);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]["X"],2);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],5);
  outdoor[1]["roomSource"]["index"]=json!(0);
  assert!(crate::grid_instance_preview::group_cut_candidate(raw,&json!(outdoor).to_string()).is_err());
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
  let mut group=json!({"roomOrdinal":1,"surfaceOrdinal":1,"place":[{"itemId":40000001,"expectedStock":2,"x":3,"y":3,"orientation":"GridOrientation_Down"},{"itemId":40000001,"expectedStock":1,"x":4,"y":3,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&group.to_string()).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]["X"],4);
  let back=json!({"roomOrdinal":1,"surfaceOrdinal":1,"pickup":[{"index":1,"itemId":40000001,"expectedX":3,"expectedY":3,"expectedOrientation":"GridOrientation_Down","expectedStock":0},{"index":2,"itemId":40000001,"expectedX":4,"expectedY":3,"expectedOrientation":"GridOrientation_Down","expectedStock":0}]});
  let back=furniture_candidate(d.patched_json.as_bytes(),&back.to_string()).unwrap();let j:Value=serde_json::from_str(&back.patched_json).unwrap();
  assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],2);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().len(),1);
  group["place"][1]["expectedStock"]=2.into();assert!(furniture_candidate(raw,&group.to_string()).is_err());
  let mut p=json!({"roomOrdinal":1,"surfaceOrdinal":1,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":4,"y":4,"orientation":"GridOrientation_Left"}]});
  assert!(furniture_candidate(raw,&p.to_string()).is_ok());p["edits"][0]["y"]=Value::from(-1);assert!(furniture_candidate(raw,&p.to_string()).is_err());
 }
 #[test]
 fn free_scope_restore_reuses_stock_for_overlapping_diagonal_furniture(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42},"1":{"FloorGridID":43}}},{"Rooms":{"0":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}}}}}}"#;
  let mut plan=json!({"scope":"floor","rooms":[{"roomOrdinal":1,"surfaces":[{"surfaceOrdinal":1,"sourcePath":"GridData/Rooms/Room8x8-GridData.json","factor":1,"freePlacement":true,"pickup":[],"place":[{"itemId":40000001,"expectedStock":2,"x":7,"y":0,"orientation":"GridOrientation_DownLeft"},{"itemId":40000001,"expectedStock":1,"x":7,"y":0,"orientation":"GridOrientation_Down"}],"finish":null}]},{"roomOrdinal":2,"surfaces":[{"surfaceOrdinal":1,"sourcePath":"GridData/Rooms/Room8x8-GridData.json","factor":1,"freePlacement":true,"pickup":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_DownLeft","expectedStock":0},{"index":1,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","expectedStock":0}],"place":[],"finish":null}]}]});
  let original:Value=serde_json::from_slice(raw).unwrap();
  let out=room_project_candidate(raw,&plan.to_string()).unwrap();let result:Value=serde_json::from_str(&out).unwrap();let grids=&result["World"]["GridCollection"]["Grids"];
  assert_eq!(grids["42"]["Objects"]["1"]["Orientation"],"GridOrientation_DownLeft");assert_eq!(grids["42"]["Objects"]["2"]["X"],7);
  assert!(grids["43"]["Objects"].as_object().unwrap().is_empty());assert_eq!(grids["44"],original["World"]["GridCollection"]["Grids"]["44"]);
  assert_eq!(result["Player"]["ListInventories"],original["Player"]["ListInventories"]);assert!(out.contains("1e2"));
  plan["rooms"][0]["surfaces"][0]["place"][1]["expectedStock"]=2.into();assert!(room_project_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn indoor_scope_restore_pools_returns_and_keeps_other_floors(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42},"1":{"FloorGridID":43}}},{"Rooms":{"0":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"44":{"ID":44,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}}}}}}"#;
  let mut plan=json!({"scope":"floor","rooms":[{"roomOrdinal":1,"surfaces":[{"surfaceOrdinal":1,"sourcePath":"GridData/Rooms/Room8x8-GridData.json","factor":1,"pickup":[],"place":[{"itemId":40000001,"expectedStock":1,"x":3,"y":3,"orientation":"GridOrientation_Down"}],"finish":null}]},{"roomOrdinal":2,"surfaces":[{"surfaceOrdinal":1,"sourcePath":"GridData/Rooms/Room8x8-GridData.json","factor":1,"pickup":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","expectedStock":0}],"place":[],"finish":null}]}]});
  let original:Value=serde_json::from_slice(raw).unwrap();
  let out=room_project_candidate(raw,&plan.to_string()).unwrap();let result:Value=serde_json::from_str(&out).unwrap();
  assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"],3);
  assert!(result["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert_eq!(result["World"]["GridCollection"]["Grids"]["44"],original["World"]["GridCollection"]["Grids"]["44"]);
  assert_eq!(result["Player"]["ListInventories"],original["Player"]["ListInventories"]);
  assert!(out.contains("1e2"));
  plan["rooms"][0]["surfaces"][0]["place"][0]["expectedStock"]=2.into();assert!(room_project_candidate(raw,&plan.to_string()).is_err());
  plan["rooms"][0]["surfaces"][0]["place"][0]["expectedStock"]=1.into();plan["scope"]="building".into();assert!(room_project_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn whole_room_project_is_atomic_across_floor_and_wall_stock(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42,"WallGridIDs":{"0":43}}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Wall8x9-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}}}}}}"#;
  let mut p=json!({"roomOrdinal":1,"surfaces":[{"surfaceOrdinal":1,"sourcePath":"GridData/Rooms/Room8x8-GridData.json","factor":1,"place":[{"itemId":40000001,"expectedStock":2,"x":3,"y":3,"orientation":"GridOrientation_Down"}],"finish":null},{"surfaceOrdinal":2,"sourcePath":"GridData/Rooms/Wall8x9-GridData.json","factor":1,"place":[{"itemId":40000001,"expectedStock":1,"x":2,"y":2,"orientation":"GridOrientation_Down"}],"finish":null}]});
  let d=room_project_candidate(raw,&p.to_string()).unwrap();let v:Value=serde_json::from_str(&d).unwrap();
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"],1);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["X"],3);
  assert_eq!(v["World"]["GridCollection"]["Grids"]["43"]["Objects"]["1"]["X"],2);
  assert!(d.contains("1e2"));
  p["surfaces"][1]["place"][0]["expectedStock"]=2.into();assert!(room_project_candidate(raw,&p.to_string()).is_err());
  p["surfaces"][1]["place"][0]["expectedStock"]=1.into();
  p["surfaces"][1]["sourcePath"]="GridData/Rooms/Wall6x9-GridData.json".into();assert!(room_project_candidate(raw,&p.to_string()).is_err());
  p["surfaces"][1]["sourcePath"]="GridData/Rooms/Wall8x9-GridData.json".into();
  p["surfaces"][1]["finish"]=json!({"itemId":160000001,"expected":null});assert!(room_project_candidate(raw,&p.to_string()).is_err());
  p["surfaces"][1]["finish"]=Value::Null;p["surfaces"][1]["surfaceOrdinal"]=1.into();assert!(room_project_candidate(raw,&p.to_string()).is_err());
 }
 #[test]
 fn room_support_clone_consumes_descendant_stock_and_allocates_fresh_grids(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":1},"40005162":{"Amount":2}}}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"NextGridID":50,"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43,"DesignID":null}}}}},"43":{"ID":43,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":0,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40005162,"X":2,"Y":0,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"place":[{"itemId":40005160,"expectedStock":1,"x":8,"y":8,"orientation":"GridOrientation_Left","supportSource":{"index":0,"expectedX":4,"expectedY":4,"expectedOrientation":"GridOrientation_Down"}}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let orig:Value=serde_json::from_slice(raw).unwrap();let out:Value=serde_json::from_str(&d.patched_json).unwrap();let g=&out["World"]["GridCollection"]["Grids"];
  assert_eq!(g["42"]["Objects"]["1"],orig["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
  assert_eq!(g["42"]["Objects"]["2"]["State"]["SubGrid"]["GridID"],50);
  assert_eq!(g["50"]["Objects"],g["43"]["Objects"]);
  assert_eq!(out["World"]["GridCollection"]["NextGridID"],51);
  assert_eq!(out["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],0);
  assert!(d.patched_json.contains("1e2"));
  let mut free_plan=plan.clone();free_plan["place"][0]["x"]=4.into();free_plan["place"][0]["y"]=4.into();
  assert!(furniture_candidate(raw,&free_plan.to_string()).is_err());
  free_plan["freePlacement"]=true.into();
  let draft=furniture_candidate(raw,&free_plan.to_string()).unwrap();let placed:Value=serde_json::from_str(&draft.patched_json).unwrap();
  assert_eq!(placed["World"]["GridCollection"]["Grids"]["50"]["Objects"],g["43"]["Objects"]);
  assert_eq!(placed["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"],4);
  free_plan["place"][0]["orientation"]="GridOrientation_DownLeft".into();assert!(furniture_candidate(raw,&free_plan.to_string()).is_err());
  free_plan["place"][0]["orientation"]="GridOrientation_Down".into();free_plan["place"][0]["x"]=16.into();assert!(furniture_candidate(raw,&free_plan.to_string()).is_err());
  // Mixed clone and pickup use original room indices, consume/return all
  // descendant stock, and preserve the original parent and child grids.
  let mut mixed_source=orig.clone();
  mixed_source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]=json!({"ID":2,"ItemID":40005162,"X":6,"Y":4,"Orientation":"GridOrientation_Down"});
  mixed_source["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"]=3.into();
  mixed_source["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"]=3.into();
  let raw_mixed=serde_json::to_vec(&mixed_source).unwrap();
  let mut clone_plan=plan.clone();
  clone_plan["place"].as_array_mut().unwrap().push(json!({"itemId":40005162,"expectedStock":1,"x":10,"y":8,"orientation":"GridOrientation_Down"}));
  let cloned:Value=serde_json::from_str(&furniture_candidate(&raw_mixed,&clone_plan.to_string()).unwrap().patched_json).unwrap();
  assert_eq!(cloned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"]["SubGrid"]["GridID"],50);
  assert_eq!(cloned["World"]["GridCollection"]["Grids"]["50"],json!({"ID":50,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":mixed_source["World"]["GridCollection"]["Grids"]["43"]["Objects"]}));
  assert_eq!(cloned["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],0);
  clone_plan["place"][1]["expectedStock"]=3.into();assert!(furniture_candidate(&raw_mixed,&clone_plan.to_string()).is_err());
  let mut pickup=json!({"roomOrdinal":1,"surfaceOrdinal":1,"pickup":[{"index":0,"itemId":40005160,"expectedX":4,"expectedY":4,"expectedOrientation":"GridOrientation_Down","expectedStock":1,"includeSupport":true},{"index":1,"itemId":40005162,"expectedX":6,"expectedY":4,"expectedOrientation":"GridOrientation_Down","expectedStock":3}]});
  let returned:Value=serde_json::from_str(&furniture_candidate(&raw_mixed,&pickup.to_string()).unwrap().patched_json).unwrap();
  assert!(returned["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
  assert!(returned["World"]["GridCollection"]["Grids"].get("43").is_none());
  assert_eq!(returned["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"],2);
  assert_eq!(returned["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],6);
  // A mixed storage, support-tree and plain selection uses one private
  // staging transaction, regardless of whether free placement is selected.
  let mut with_storage=mixed_source.clone();
  with_storage["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]=json!({"ID":3,"ItemID":40001680,"X":8,"Y":4,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}});
  with_storage["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"]=4.into();
  with_storage["Player"]["ContainerInventories"]=json!({"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}});
  with_storage["Player"]["NextContainerInventoryID"]=10.into();
  with_storage["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]=json!({"Amount":2});
  let mut mixed_pickup=pickup.clone();
  mixed_pickup["pickup"].as_array_mut().unwrap().push(json!({"index":2,"itemId":40001680,"expectedX":8,"expectedY":4,"expectedOrientation":"GridOrientation_Down","expectedStock":2,"storageEmpty":true}));
  for free in [false,true]{
   if free{mixed_pickup["freePlacement"]=true.into();}
   let result=furniture_candidate(&serde_json::to_vec(&with_storage).unwrap(),&mixed_pickup.to_string()).unwrap();
   let v:Value=serde_json::from_str(&result.patched_json).unwrap();
   assert!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
   assert!(v["World"]["GridCollection"]["Grids"].get("43").is_none());
   assert!(v["Player"]["ContainerInventories"].as_object().unwrap().is_empty());
   assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],6);
   assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],3);
  }
  with_storage["Player"]["ContainerInventories"]["9"]["Inventory"]=json!([{"ItemID":30000001,"Amount":1}]);
  assert!(furniture_candidate(&serde_json::to_vec(&with_storage).unwrap(),&mixed_pickup.to_string()).is_err());
  pickup["pickup"][0].as_object_mut().unwrap().remove("includeSupport");
  assert!(furniture_candidate(&raw_mixed,&pickup.to_string()).is_err());
  // A portable scene restores into a room with no native support template.
  let mut blank=orig.clone();
  blank["World"]["GridCollection"]["Grids"]["42"]["Objects"]=json!({});
  blank["World"]["GridCollection"]["Grids"].as_object_mut().unwrap().remove("43");
  blank["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"]=3.into();
  let scene=json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":40005160,"tree":{"factor":2,"sourcePath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","objects":[{"itemId":40005162,"x":0,"y":0,"orientation":"GridOrientation_Down","child":null},{"itemId":40005162,"x":2,"y":0,"orientation":"GridOrientation_Down","child":null}]}});
  let mut mixed=json!({"roomOrdinal":1,"surfaceOrdinal":1,"place":[{"itemId":40005160,"expectedStock":1,"x":4,"y":4,"orientation":"GridOrientation_Down","scene":scene},{"itemId":40005162,"expectedStock":1,"x":8,"y":8,"orientation":"GridOrientation_Left"}]});
  let bytes=serde_json::to_vec(&blank).unwrap();
  let restored:Value=serde_json::from_str(&furniture_candidate(&bytes,&mixed.to_string()).unwrap().patched_json).unwrap();
  assert_eq!(restored["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["State"]["SubGrid"]["GridID"],50);
  assert_eq!(restored["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["ItemID"],40005162);
  assert_eq!(restored["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],0);
  mixed["place"][1]["expectedStock"]=3.into();assert!(furniture_candidate(&bytes,&mixed.to_string()).is_err());
  mixed["place"][1]["expectedStock"]=1.into();mixed["place"][1]["x"]=4.into();mixed["place"][1]["y"]=4.into();assert!(furniture_candidate(&bytes,&mixed.to_string()).is_err());
  let mut shortage=orig.clone();shortage["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"]=1.into();
  assert!(furniture_candidate(&serde_json::to_vec(&shortage).unwrap(),&plan.to_string()).is_err());
  plan["place"][0]["x"]=4.into();plan["place"][0]["y"]=4.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn room_support_root_transform_keeps_descendants_and_blocks_stock_removal(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43,"DesignID":null}}}}},"43":{"ID":43,"TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40000002,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut plan=json!({"roomOrdinal":1,"surfaceOrdinal":1,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":3,"y":3,"orientation":"GridOrientation_Left"}]});
  let d=furniture_candidate(raw,&plan.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=3.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Y"]=3.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Orientation"]="GridOrientation_Left".into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  assert!(d.patched_json.contains("1e2"));
  let pickup=json!({"roomOrdinal":1,"surfaceOrdinal":1,"pickup":{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","expectedStock":0}});
  assert!(furniture_candidate(raw,&pickup.to_string()).is_err());
  let mut alias:Value=serde_json::from_slice(raw).unwrap();
  alias["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]=json!({"ID":2,"ItemID":40000001,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43}}});
  assert!(furniture_candidate(&serde_json::to_vec(&alias).unwrap(),&plan.to_string()).is_err());
  plan["edits"][0]["x"]=8.into();assert!(furniture_candidate(raw,&plan.to_string()).is_err());
 }
 #[test]
 fn indoor_group_translation_is_atomic_and_preserves_identity(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000002,"X":2,"Y":1,"Orientation":"GridOrientation_Down"},"3":{"ID":3,"ItemID":40000003,"X":4,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let mut p=json!({"roomOrdinal":1,"surfaceOrdinal":1,"edits":[{"index":0,"itemId":40000001,"expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":2,"y":1,"orientation":"GridOrientation_Down"},{"index":1,"itemId":40000002,"expectedX":2,"expectedY":1,"expectedOrientation":"GridOrientation_Down","x":3,"y":1,"orientation":"GridOrientation_Down"}]});
  let d=furniture_candidate(raw,&p.to_string()).unwrap();
  let mut expected:Value=serde_json::from_slice(raw).unwrap();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"]=2.into();
  expected["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["X"]=3.into();
  assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),expected);
  assert!(d.patched_json.contains("1e2"));
  p["edits"][0]["x"]=3.into();p["edits"][1]["x"]=4.into();
  assert!(furniture_candidate(raw,&p.to_string()).is_err());
  p["edits"][0]["x"]=2.into();p["edits"][1]["x"]=5.into();
  assert!(furniture_candidate(raw,&p.to_string()).is_err());
  p["edits"][0]["x"]=1.into();p["edits"][1]["x"]=1.into();p["edits"][1]["y"]=2.into();
  p["edits"][0]["orientation"]="GridOrientation_Right".into();p["edits"][1]["orientation"]="GridOrientation_Right".into();
  let d=furniture_candidate(raw,&p.to_string()).unwrap();
  let j:Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["Y"],2);
  assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["Orientation"],"GridOrientation_Right");
  p["edits"][1]["orientation"]="GridOrientation_Left".into();
  assert!(furniture_candidate(raw,&p.to_string()).is_err());
 }
 #[test]
 fn exact_room_finishes_and_surface_counts_without_native_grid_ids(){
  let raw=br#"{"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"Name":"Test room","FloorGridID":3001,"WallGridIDs":{"0":3002,"1":3003},"Flooring":40000001,"Wallpapers":{"0":40000002,"1":0},"Ceiling":40000003}}}]}],"GridCollection":{"Grids":{"3001":{"ID":3001,"Objects":{"82":{"ID":82,"ItemID":40000004},"83":{"ID":83,"ItemID":40000004,"X":3,"Y":-2,"Orientation":"GridOrientation_Down"}}},"3002":{"ID":3002,"Objects":{}}},"DiffGrids":{"3003":{"ID":3003}}}}}"#;
  let report=project(raw).unwrap();let j:Value=serde_json::from_str(&report).unwrap();let room=&j["rooms"][0];assert_eq!(room["name"],"Test room");assert_eq!(room["surfaces"][0]["items"][0]["quantity"],2);assert_eq!(room["surfaces"][0]["positions"],json!([{"itemId":40000004,"x":3,"y":-2,"orientationCode":8}]));assert_eq!(room["surfaces"][0]["missingPositions"],1);assert_eq!(room["surfaces"][1]["finish"],40000002);assert_eq!(room["surfaces"][2]["gridStatus"],"diff");assert_eq!(room["surfaces"][2]["finish"],0);assert_eq!(j["writerAuthorized"],false);assert!(!report.contains("3001")&&!report.contains("3002")&&!report.contains("3003"));
 }
 #[test]
 fn indoor_support_witness_uses_global_local_ordinal_not_native_ids(){
  let raw=br#"{"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"TessellationFactor":1,"Objects":{"91":{"ID":91,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43}}}}},"43":{"ID":43,"TessellationFactor":1,"Objects":{"92":{"ID":92,"ItemID":40000002,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}}}}}"#;
  let report:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();
  let w=&report["supportParents"][0];assert_eq!(w["roomOrdinal"],1);assert_eq!(w["surfaceOrdinal"],1);assert_eq!(w["index"],0);assert_eq!(w["localOrdinal"],1);
  let tree=crate::grid_instance_preview::inspect_subgrid_json(raw,1,40000001,(1,2)).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&tree).unwrap()["tree"]["objects"][0]["itemId"],40000002);
 }
 #[test]
 fn house_definition_id_is_public_identity_not_native_grid_identity(){
  let raw=br#"{"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{"Rooms":{"0":{"FloorGridID":42}}},{"Rooms":{"0":{"FloorGridID":43}}}]},{"HouseItemID":20500002,"Floors":[{"Rooms":{"0":{"FloorGridID":44}}}]},{"HouseItemID":40000001,"Floors":[{"Rooms":{"0":{"FloorGridID":45}}}]}]}}"#;
  let j:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();
  assert_eq!(j["rooms"][0]["houseItemId"],20500001);
  assert_eq!(j["rooms"][1]["houseItemId"],20500001);
  assert_eq!(j["rooms"][2]["houseItemId"],20500002);
  assert!(j["rooms"][3].get("houseItemId").is_none());
 }
 #[test]
 fn shared_reference_is_not_projected_twice(){
  let raw=br#"{"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42,"WallGridIDs":{"0":42}}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"Objects":{"1":{"ID":1,"ItemID":40000001}}}}}}}"#;
  let j:Value=serde_json::from_str(&project(raw).unwrap()).unwrap();
  for row in j["rooms"][0]["surfaces"].as_array().unwrap(){assert_eq!(row["gridStatus"],"shared");assert_eq!(row["items"],json!([]));}
 }
 #[test]
 fn building_restore_applies_ceiling_only_and_rejects_stale_or_unowned_finish(){
  let mut grids=serde_json::Map::new();
  let mut rooms=Vec::new();
  let mut floor_rows=Vec::new();
  for room in 0..2{
   let base=42+room*5;
   let mut rows=Vec::new();
   for i in 0..5{
    let path=if i==0{"GridData/Rooms/Room8x8-GridData.json"}else{"GridData/Rooms/Wall8x9-GridData.json"};
    grids.insert((base+i).to_string(),json!({"ID":base+i,"GridDataPath":path,"TessellationFactor":1,"NextGridObjectID":1,"Objects":{}}));
    rows.push(json!({"surfaceOrdinal":i+1,"sourcePath":path,"factor":1,"pickup":[],"place":[],"finish":null}));
   }
   rooms.push(json!({"roomOrdinal":room+1,"surfaces":rows,"ceiling":{"itemId":160100031,"expected":160100136}}));
   floor_rows.push(json!({"Rooms":{"0":{"FloorGridID":base,"WallGridIDs":{"0":base+1,"1":base+2,"2":base+3,"3":base+4},"Ceiling":160100136,"Flooring":160100000,"Unknown":7}}}));
  }
  let raw=json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"4":{"ID":4,"CompatibleItemType":"ItemType_Trimming","Inventory":{"160100031":{"Amount":1}}}}},"World":{"PlayerHouses":[{"HouseItemID":20500000,"Floors":floor_rows}],"GridCollection":{"Grids":grids}}});
  let mut plan=json!({"scope":"building","rooms":rooms});
  let result=room_project_candidate(raw.to_string().as_bytes(),&plan.to_string()).unwrap();
  let mut expected=raw.clone();
  for i in 0..2{expected["World"]["PlayerHouses"][0]["Floors"][i]["Rooms"]["0"]["Ceiling"]=json!(160100031);}
  assert_eq!(serde_json::from_str::<Value>(&result).unwrap(),expected);
  plan["rooms"][1]["ceiling"]["expected"]=json!(160100000);
  assert!(room_project_candidate(raw.to_string().as_bytes(),&plan.to_string()).is_err());
  plan["rooms"][1]["ceiling"]=json!({"itemId":160100032,"expected":160100136});
  assert!(room_project_candidate(raw.to_string().as_bytes(),&plan.to_string()).is_err());
 }

}
