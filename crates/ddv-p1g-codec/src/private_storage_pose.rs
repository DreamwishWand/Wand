//! Restore private storage contents and original poses as a single draft.
//! Existing storage identities are preserved; no new placement or stock use.
use crate::CodecError;
use ddv_save_patch::{GridCoordinateTarget,GridObjectKind,GridMixedEdit,MAX_GRID_MIXED_EDITS};
use serde_json::Value;
use std::collections::{BTreeMap,HashMap,HashSet};
use zeroize::{Zeroize,Zeroizing};

pub(super) fn restore(source:&str,backup:&str,scope:&HashSet<String>)->Result<String,CodecError>{
 let bad=CodecError::Json;
 // The existing scope resolver has authenticated every outdoor grid or room floor. Reject
 // object-scoped regions, which could move a root across a selected boundary.
 if scope.is_empty()||scope.iter().any(|s|s.parse::<u32>().ok().is_none_or(|n|n==0||n.to_string()!=*s)){return Err(bad);}
 let doc:Value=serde_json::from_str(backup).map_err(|_|bad)?;
 if doc["schema"]!="wand.private.storage-contents@2"||doc["skipped"].as_u64()!=Some(0){return Err(bad);}
 let rows=doc["rows"].as_array().filter(|a|!a.is_empty()).ok_or(bad)?;
 // Validate complete identity, alias topology, metadata and contents before
 // any pose edit. Discard this preflight: a newly recreated empty storage
 // must still be empty when the final strict restore rebinds its identity.
 {
  let _preflight=Zeroizing::new(ddv_save_patch::storage_backup::restore_scoped_mode(source,backup,Some(scope),true,false).map_err(|_|bad)?);
 }
 let current=Zeroizing::new(ddv_save_patch::storage_backup::export_scoped(source,Some(scope)).map_err(|_|bad)?);
 let current:Value=serde_json::from_str(&current).map_err(|_|bad)?;
 let by_id:HashMap<_,_>=current["rows"].as_array().ok_or(bad)?.iter().filter_map(|r|Some((r["id"].as_u64()?,r))).collect();
 let mut edits=Vec::new();
 for row in rows{
  let id=row["id"].as_u64().ok_or(bad)?;
  // A newly recreated empty container has already been verified by the
  // shared preflight, including its exact original pose.
  let Some(old)=by_id.get(&id)else{continue;};
  for wanted in row["roots"].as_array().ok_or(bad)?{
   let grid=wanted["grid"].as_str().filter(|s|scope.contains(*s)).ok_or(bad)?;
   let object=wanted["object"].as_str().ok_or(bad)?;
   let before=old["roots"].as_array().ok_or(bad)?.iter().find(|w|w["grid"]==grid&&w["object"]==object).ok_or(bad)?;
   let a=&before["pose"];let z=&wanted["pose"];
   if a==z{continue;}
   let item=z["item"].as_u64().filter(|n|a["item"].as_u64()==Some(*n)&&*n/100_000==400).ok_or(bad)?;
   let xy=|v:&Value|->Result<(i32,i32),CodecError>{Ok((v["x"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?,v["y"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?))};
   let expected=xy(a)?;let desired=xy(z)?;
   let orientation=|v:&Value|->Result<String,CodecError>{v["orientation"].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).map(str::to_owned).ok_or(bad)};
   let from=orientation(a)?;let to=orientation(z)?;
   if edits.len()>=MAX_GRID_MIXED_EDITS{return Err(bad);}
   edits.push(GridMixedEdit{target:GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:grid.to_owned(),object_id:object.to_owned(),item_id:item},expected,position:(expected!=desired).then_some(desired),orientation:(from!=to).then_some((from,to))});
  }
 }
 let root:Value=serde_json::from_str(source).map_err(|_|bad)?;
 let mut room_ordinals=HashMap::new();let mut ordinal=0usize;
 if let Some(houses)=root["World"]["PlayerHouses"].as_array(){
  for house in houses{
   if let Some(floors)=house["Floors"].as_array(){for floor in floors{
    if let Some(rooms)=floor["Rooms"].as_object(){for room in rooms.values(){
     ordinal+=1;
     if let Some(gid)=room["FloorGridID"].as_u64(){room_ordinals.insert(gid.to_string(),ordinal);}
    }}
   }}
  }
 }
 let grids=&root["World"]["GridCollection"]["Grids"];
 let mut outdoor=Vec::new();let mut indoor=BTreeMap::<usize,Vec<Value>>::new();
 for e in edits{
  if grids[&e.target.grid_id]["GridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Rooms/Room")){
   let room=*room_ordinals.get(&e.target.grid_id).ok_or(bad)?;
   let objects=grids[&e.target.grid_id]["Objects"].as_object().ok_or(bad)?;
   let index=objects.keys().position(|k|k==&e.target.object_id).ok_or(bad)?;
   let old=objects[&e.target.object_id]["Orientation"].as_str().ok_or(bad)?;
   let (x,y)=e.position.unwrap_or(e.expected);
   let to=e.orientation.as_ref().map_or(old,|(_,s)|s.as_str());
   indoor.entry(room).or_default().push(serde_json::json!({"index":index,"itemId":e.target.item_id,"expectedX":e.expected.0,"expectedY":e.expected.1,"expectedOrientation":old,"x":x,"y":y,"orientation":to}));
  }else{outdoor.push(e);}
 }
 let mut draft=Zeroizing::new(source.to_owned());
 if !outdoor.is_empty(){
  crate::grid_instance_preview::validate_oblique_grid_edits(source.as_bytes(),&outdoor)?;
  *draft=ddv_save_patch::preview_existing_grid_mixed_batch(source,&outdoor).map_err(|_|bad)?.patched_json;
 }
 for (room,rows) in indoor{
  for batch in rows.chunks(32){
   let plan=serde_json::json!({"roomOrdinal":room,"surfaceOrdinal":1,"freePlacement":true,"edits":batch});
   let mut d=crate::indoor_room_view::private_storage_pose_candidate(draft.as_bytes(),&plan.to_string())?;
   if !d.changed||!d.untouched_bytes_preserved||d.writer_authorized||d.export_authorized{d.patched_json.zeroize();return Err(bad);}
   draft.zeroize();*draft=std::mem::take(&mut d.patched_json);
  }
 }
 // Re-use strict pose matching on the final state, including recreated
 // container aliases. No change is not a successful new edit.
 let final_text=ddv_save_patch::storage_backup::restore_scoped_mode(&draft,backup,Some(scope),true,true).map_err(|_|bad)?;
 if final_text==source{return Err(bad);}
 Ok(final_text)
}

#[cfg(test)]
mod tests{
 use super::*;
 fn indoor_fixture()->Value{
  use serde_json::json;
  let mut root=json!({"GameInfo":{"Version":643},"Player":{"ContainerInventories":{}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42},"1":{"FloorGridID":43}}},{"Rooms":{"0":{"FloorGridID":44}}}]}],"GridCollection":{"Grids":{}}},"Marker":17});
  for gid in 42..=44{
   let g=gid.to_string();
   root["World"]["GridCollection"]["Grids"][&g]=json!({"ID":gid,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}});
   for object in 1..=2{
    let id=gid*10+object;
    root["Player"]["ContainerInventories"][id.to_string()]=json!({"ID":id,"ParentItemID":40001680,"Size":48,"Inventory":[{"ItemID":30000001,"Amount":object,"State":null}],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0});
    root["World"]["GridCollection"]["Grids"][&g]["Objects"][object.to_string()]=json!({"ID":object,"ItemID":40001680,"X":object,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":id,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}});
   }
  }
  root
 }
 #[test]fn indoor_private_pose_restore_all_scopes_and_independent_transforms(){
  use serde_json::json;
  let original=indoor_fixture();
  for kind in ["room","floor","building"]{
   let scope=crate::private_storage_scope::resolve(original.to_string().as_bytes(),&json!({"kind":kind,"roomOrdinal":1}).to_string()).unwrap().unwrap();
   let backup=ddv_save_patch::storage_backup::export_scoped(&original.to_string(),Some(&scope)).unwrap();
   let mut moved=original.clone();
   for g in &scope{
    let objects=&mut moved["World"]["GridCollection"]["Grids"][g]["Objects"];
    objects["1"]["X"]=4.into();objects["1"]["Orientation"]="GridOrientation_Left".into();
    objects["2"]["Y"]=5.into();objects["2"]["Orientation"]="GridOrientation_Right".into();
    let id=(g.parse::<u64>().unwrap()*10+1).to_string();
    moved["Player"]["ContainerInventories"][id]["Inventory"]=json!([]);
   }
   let output=restore(&moved.to_string(),&backup,&scope).unwrap();
   assert_eq!(serde_json::from_str::<Value>(&output).unwrap(),original);
   let mut wrong=moved.clone();wrong["World"]["SpawnedObjects"]=json!([{"GridID":42,"GridObjectID":1}]);
   assert!(restore(&wrong.to_string(),&backup,&scope).is_err());
   let mut wrong:Value=serde_json::from_str(&backup).unwrap();
   wrong["rows"][0]["roots"][0]["pose"]["x"]=8.into();
   assert!(restore(&moved.to_string(),&wrong.to_string(),&scope).is_err());
  }
 }
 #[test]fn recreated_empty_storage_is_rebound_only_once(){
  use serde_json::json;
  let original=indoor_fixture();
  let scope=HashSet::from(["42".to_owned()]);
  let backup=ddv_save_patch::storage_backup::export_scoped(&original.to_string(),Some(&scope)).unwrap();
  let mut changed=original.clone();
  let mut row=changed["Player"]["ContainerInventories"].as_object_mut().unwrap().remove("421").unwrap();
  row["ID"]=999.into();row["Inventory"]=json!([]);
  changed["Player"]["ContainerInventories"]["999"]=row;
  let grid=&mut changed["World"]["GridCollection"]["Grids"]["42"];
  let mut object=grid["Objects"].as_object_mut().unwrap().remove("1").unwrap();
  object["ID"]=3.into();object["State"]["Storage"]["ContainerInventoryID"]=999.into();
  grid["Objects"]["3"]=object;grid["NextGridObjectID"]=4.into();
  let mut expected=changed.clone();expected["Player"]["ContainerInventories"]["999"]["Inventory"]=original["Player"]["ContainerInventories"]["421"]["Inventory"].clone();
  let output=restore(&changed.to_string(),&backup,&scope).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&output).unwrap(),expected);
 }

 #[test]fn restore_existing_storage_pose_and_contents_in_all_calibrated_scenes(){
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
  let rows=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"]=="VillageExpansion04UnderwaterAreas").unwrap()["grids"].as_array().unwrap();
  assert_eq!(rows.len(),12);
  let scope=HashSet::from(["42".to_owned()]);
  for r in rows{
   let original=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[{"ItemID":30000001,"Amount":5,"State":null}],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":r["layoutId"],"GridDataPath":r["gridDataPath"],"TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":17});
   let backup=ddv_save_patch::storage_backup::export_scoped(&original.to_string(),Some(&scope)).unwrap();
   let mut moved=original.clone();let chest=&mut moved["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"];chest["X"]=3.into();chest["Orientation"]="GridOrientation_Left".into();
   moved["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([]);
   let output=restore(&moved.to_string(),&backup,&scope).unwrap();
   assert_eq!(serde_json::from_str::<Value>(&output).unwrap(),original);
   assert!(restore(&original.to_string(),&backup,&scope).is_err());
   let mut bad:Value=serde_json::from_str(&backup).unwrap();bad["rows"][0]["roots"][0]["pose"]["x"]=65536.into();
   assert!(restore(&moved.to_string(),&bad.to_string(),&scope).is_err());
   moved["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":1}]);
   assert!(restore(&moved.to_string(),&backup,&scope).is_err());
  }
 }
}
