//! Restore a moved independent storage to its original authenticated scene.
//! Only the grid-local object ID changes; the container ID stays stable.
use crate::CodecError;
use ddv_save_patch::{GridCoordinateTarget,GridObjectKind,PlainGridDestination};
use serde_json::{Value,json};
use std::collections::{HashMap,HashSet};
use zeroize::{Zeroize,Zeroizing};

fn scene(source:&str,root:&Value,gid:&str)->Result<(PlainGridDestination,bool,bool),CodecError>{
 let bad=CodecError::Json;
 let c=&root["World"]["GridCollection"];let g=&c["Grids"][gid];
 let data=g["GridDataPath"].as_str().ok_or(bad)?.to_owned();
 if data.starts_with("GridData/Rooms/Room"){
  let mut ordinal=0usize;let mut found=None;
  for h in root["World"]["PlayerHouses"].as_array().ok_or(bad)?{
   if let Some(floors)=h["Floors"].as_array(){for f in floors{
    if let Some(rooms)=f["Rooms"].as_object(){for room in rooms.values(){
     ordinal+=1;
     if room["FloorGridID"].as_u64().is_some_and(|n|n.to_string()==gid){if found.replace(ordinal).is_some(){return Err(bad);}}
    }}
   }}
  }
  let ordinal=found.ok_or(bad)?;
  let scope=json!({"kind":"room","roomOrdinal":ordinal}).to_string();
  if crate::private_storage_scope::resolve(source.as_bytes(),&scope)?.is_none_or(|s|!s.contains(gid)){return Err(bad);}
  for scope in ["Grids","DiffGrids"]{
   if let Some(grids)=c[scope].as_object(){for grid in grids.values(){for field in ["Objects","ModifiedObjects"]{
    if grid[field].as_object().is_some_and(|m|m.values().any(|o|o["State"]["SubGrid"]["GridID"].as_u64().is_some_and(|n|n.to_string()==gid))){return Err(bad);}
   }}}
  }
  let report:Value=serde_json::from_str(&crate::indoor_room_view::project(source.as_bytes())?).map_err(|_|bad)?;
  let f=&report["rooms"][ordinal-1]["surfaces"][0];let t=&f["terrain"];
  let factor=f["factor"].as_u64().filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let size=|k:&str|t[k].as_u64().filter(|n|(1..=256).contains(n)).map(|n|n as u32).ok_or(bad);
  if f["kind"]!="floor"||f["gridStatus"]!="full"||f["missingPositions"].as_u64()!=Some(0)||t["sourcePath"].as_str()!=Some(data.as_str()){return Err(bad);}
  return Ok((PlainGridDestination{grid_id:gid.into(),layout_path:String::new(),data_path:data,tessellation:factor,size:(size("sizeX")?,size("sizeY")?)},true,false));
 }
 let underwater=crate::grid_instance_preview::is_underwater_grid(g);
 let (layout,factor,sx,sy)=if underwater{
  let (sx,sy)=crate::grid_instance_preview::underwater_transform_identity(root,gid)?;
  (g["GridDefaultLayoutPath"].as_str().ok_or(bad)?.to_owned(),1,sx,sy)
 }else{let (_,layout,f,sx,sy)=crate::grid_instance_preview::house_exterior_identity(root,gid)?;(layout,f,sx,sy)};
 Ok((PlainGridDestination{grid_id:gid.into(),layout_path:layout,data_path:data,tessellation:u32::try_from(factor).map_err(|_|bad)?,size:(u32::try_from(sx).map_err(|_|bad)?,u32::try_from(sy).map_err(|_|bad)?)},false,underwater))
}
fn xy(p:&Value)->Result<(i32,i32),CodecError>{
 let int=|k:&str|p[k].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(CodecError::Json);
 Ok((int("x")?,int("y")?))
}
fn within(d:&PlainGridDestination,p:(i32,i32))->bool{
 p.0>=0&&p.1>=0&&(p.0 as u64)<u64::from(d.size.0)*u64::from(d.tessellation)&&(p.1 as u64)<u64::from(d.size.1)*u64::from(d.tessellation)
}
fn cardinal(v:&Value)->Result<&str,CodecError>{
 v.as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(CodecError::Json)
}
pub(super) fn restore(source:&str,backup:&str,scope:&HashSet<String>)->Result<String,CodecError>{
 let bad=CodecError::Json;
 ddv_save_patch::validate_json_without_edit(source).map_err(|_|bad)?;
 ddv_save_patch::validate_json_without_edit(backup).map_err(|_|bad)?;
 let mut doc:Value=serde_json::from_str(backup).map_err(|_|bad)?;
 if doc["schema"]!="wand.private.storage-contents@2"||doc["skipped"].as_u64()!=Some(0)||doc["version"].as_u64()!=Some(643)||doc.as_object().is_none_or(|m|m.len()!=4){return Err(bad);}
 let rows=doc["rows"].as_array().filter(|a|!a.is_empty()&&a.len()<=8192).ok_or(bad)?;
 let root:Value=serde_json::from_str(source).map_err(|_|bad)?;
 let mut ids=HashSet::new();
 for row in rows{let id=row["id"].as_u64().filter(|n|ids.insert(*n)).ok_or(bad)?;if row["metadata"]["ID"].as_u64()!=Some(id){return Err(bad);}}
 // Locate only backup-requested container IDs, including those now outside
 // the destination selection. The existing snapshot checks all aliases.
 let mut current_scope=scope.clone();
 for (gid,g) in root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?{
  if let Some(objects)=g["Objects"].as_object(){for o in objects.values(){
   if o["State"]["Storage"]["ContainerInventoryID"].as_u64().is_some_and(|n|ids.contains(&n)){current_scope.insert(gid.clone());}
  }}
 }
 let current_raw=Zeroizing::new(ddv_save_patch::storage_backup::export_scoped(source,Some(&current_scope)).map_err(|_|bad)?);
 let current:Value=serde_json::from_str(&current_raw).map_err(|_|bad)?;
 let by_id:HashMap<_,_>=current["rows"].as_array().ok_or(bad)?.iter().filter_map(|r|Some((r["id"].as_u64()?,r))).collect();
 let mut transfers=Vec::new();let mut preflight=doc.clone();
 for (i,row) in rows.iter().enumerate(){
  let id=row["id"].as_u64().ok_or(bad)?;
  let wanted=row["roots"].as_array().filter(|a|!a.is_empty()).ok_or(bad)?;
  if wanted.iter().any(|w|w["grid"].as_str().is_none_or(|g|!scope.contains(g))){return Err(bad);}
  let Some(old)=by_id.get(&id)else{continue;};
  let roots=old["roots"].as_array().ok_or(bad)?;
  if roots.len()!=1||wanted.len()!=1{continue;}
  let a=&roots[0];let z=&wanted[0];
  if a["grid"]==z["grid"]&&a["object"]==z["object"]{continue;}
  if transfers.len()>=ddv_save_patch::MAX_GRID_MIXED_EDITS||old["metadata"]!=row["metadata"]||a["state"]!=z["state"]||a["pose"]["item"]!=z["pose"]["item"]||z.as_object().is_none_or(|m|m.len()!=5)||z["pose"].as_object().is_none_or(|m|m.len()!=4){return Err(bad);}
  let from=a["grid"].as_str().ok_or(bad)?;let to=z["grid"].as_str().ok_or(bad)?;
  let (d,_,_)=scene(source,&root,to)?;
  if z["path"].as_str()!=Some(d.data_path.as_str())||!within(&d,xy(&z["pose"])?){return Err(bad);}
  cardinal(&z["pose"]["orientation"])?;
  // Validate content against the true current identity before changing it.
  preflight["rows"][i]["roots"]=old["roots"].clone();
  transfers.push((i,id,from.to_owned(),to.to_owned(),a.clone(),z.clone()));
 }
 if transfers.is_empty(){return crate::private_storage_pose::restore(source,backup,scope);}
 {
  let _check=Zeroizing::new(ddv_save_patch::storage_backup::restore_scoped_mode(source,&preflight.to_string(),Some(&current_scope),true,false).map_err(|_|bad)?);
 }
 let mut working=Zeroizing::new(source.to_owned());
 for (i,id,from,to,a,z) in transfers{
  let before:Value=serde_json::from_str(&working).map_err(|_|bad)?;
  let item=z["pose"]["item"].as_u64().ok_or(bad)?;
  let oid=a["object"].as_str().ok_or(bad)?;
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:from.clone(),object_id:oid.into(),item_id:item};
  let (s,_,su)=scene(&working,&before,&from)?;
  let (d,room,du)=scene(&working,&before,&to)?;
  let obj=&before["World"]["GridCollection"]["Grids"][&from]["Objects"][oid];
  let expected=xy(&a["pose"])?;let dest=xy(&z["pose"])?;
  let old=cardinal(&a["pose"]["orientation"])?;let orientation=cardinal(&z["pose"]["orientation"])?;
  if !within(&s,expected)||!within(&d,dest)||obj["State"]!=a["state"]||obj["State"]["Storage"]["ContainerInventoryID"].as_u64()!=Some(id)||obj["X"].as_i64()!=Some(i64::from(expected.0))||obj["Y"].as_i64()!=Some(i64::from(expected.1))||obj["Orientation"].as_str()!=Some(old)||!ddv_save_patch::storage_transform_pose(&before,obj){return Err(bad);}
  let refs=crate::grid_instance_preview::grid_identity_dependencies(working.as_bytes(),&target)?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let fresh=if from==to{oid.to_owned()}else{
   let g=&before["World"]["GridCollection"]["Grids"][&to];
   let fresh=if room{u64::from(ddv_save_patch::room_grid_next_object_id(g).map_err(|_|bad)?)}else{g["NextGridObjectID"].as_u64().filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?}.to_string();
   let refs=crate::grid_instance_preview::grid_identity_dependencies_for_ids(working.as_bytes(),&to,&[fresh.clone()])?;
   if refs.blocking()>0||refs.historical>0{return Err(bad);}
   let mut draft=if (su||du)&&!room&&!s.data_path.starts_with("GridData/Rooms/Room"){
    ddv_save_patch::preview_free_owned_scene_transfer(&working,&target,expected,&d,dest,orientation,false,true)
   }else{ddv_save_patch::preview_storage_transfer(&working,&target,expected,&d,dest,orientation,room,true)}.map_err(|_|bad)?;
   if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
   let after:Value=serde_json::from_str(&draft.patched_json).map_err(|_|bad)?;
   let placed=&after["World"]["GridCollection"]["Grids"][&to]["Objects"][&fresh];
   if after["Player"]!=before["Player"]||placed["State"]!=a["state"]||placed["ItemID"].as_u64()!=Some(item)||placed["X"].as_i64()!=Some(i64::from(dest.0))||placed["Y"].as_i64()!=Some(i64::from(dest.1))||placed["Orientation"].as_str()!=Some(orientation)||after["World"]["GridCollection"]["Grids"][&from]["Objects"].get(oid).is_some(){return Err(bad);}
   working.zeroize();*working=std::mem::take(&mut draft.patched_json);fresh
  };
  doc["rows"][i]["roots"][0]["object"]=Value::String(fresh);
 }
 let normalized=Zeroizing::new(doc.to_string());
 // If only transfer changed the save, a strict no-op content restore is
 // still valid. Otherwise use the existing same-grid atomic pose writer.
 let patched=match ddv_save_patch::storage_backup::restore_scoped_mode(&working,&normalized,Some(scope),true,true){
  Ok(s)=>s,
  Err(_)=>crate::private_storage_pose::restore(&working,&normalized,scope)?
 };
 if patched==source{return Err(bad);}
 Ok(patched)
}
