use crate::CodecError;
use serde_json::Value;
use std::collections::{HashMap,HashSet};

pub(super) fn resolve(source:&[u8],scope:&str)->Result<Option<HashSet<String>>,CodecError>{
 let bad=CodecError::Json;
 if scope.len()>2*1024*1024{return Err(bad);}
 let s:Value=serde_json::from_str(scope).map_err(|_|bad)?;
 if s.is_null(){return Ok(None);}
 let m=s.as_object().filter(|m|m.len()==2).ok_or(bad)?;
 let kind=m.get("kind").and_then(Value::as_str).ok_or(bad)?;
 if kind=="region-poses"{
  let rows=m.get("areas").and_then(Value::as_array).filter(|a|!a.is_empty()&&a.len()<=64).ok_or(bad)?;
  let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
  let mut selected=HashSet::new();let mut grids=HashSet::new();let mut total=0usize;
  for area in rows{
   let o=area.as_object().filter(|o|o.len()==2&&o.contains_key("destination")&&o.contains_key("poses")).ok_or(bad)?;
   let d=crate::grid_instance_preview::resolve_plain_grid_destination(source,&o["destination"])?;
   let (_,layout,factor,sx,sy)=crate::grid_instance_preview::house_exterior_identity(&root,&d.grid_id)?;
   if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1)||!grids.insert(d.grid_id.clone()){return Err(bad);}
   let objects=root["World"]["GridCollection"]["Grids"][&d.grid_id]["Objects"].as_object().ok_or(bad)?;
   let poses=o["poses"].as_array().ok_or(bad)?;
   total=total.checked_add(poses.len()).filter(|n|*n<=8192).ok_or(bad)?;
   let mut by_pose=HashMap::<(u64,i64,i64,&str),Option<&str>>::new();
   for (id,obj) in objects{
    if !ddv_save_patch::storage_pose(&root,obj){continue;}
    let (Some(item),Some(x),Some(y),Some(orientation))=(obj["ItemID"].as_u64(),obj["X"].as_i64(),obj["Y"].as_i64(),obj["Orientation"].as_str())else{continue;};
    by_pose.entry((item,x,y,orientation)).and_modify(|v|*v=None).or_insert(Some(id.as_str()));
   }
   for p in poses{
    if p.as_object().is_none_or(|p|p.len()!=4||p.keys().any(|k|!matches!(k.as_str(),"item"|"x"|"y"|"orientation"))){return Err(bad);}
    let key=(p["item"].as_u64().ok_or(bad)?,p["x"].as_i64().ok_or(bad)?,p["y"].as_i64().ok_or(bad)?,p["orientation"].as_str().ok_or(bad)?);
    let id=by_pose.get(&key).copied().flatten().ok_or(bad)?;
    if !selected.insert(format!("{}:{}",d.grid_id,id)){return Err(bad);}
   }
  }
  return Ok(Some(selected));
 }
 if kind=="region"{
  let rows=m.get("objects").and_then(Value::as_array).filter(|a|a.len()<=8192).ok_or(bad)?;
  let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
  let mut selected=HashSet::new();
  for w in rows{
   let o=w.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"x"|"y"|"orientation"))).ok_or(bad)?;
   let ordinal=o["localOrdinal"].as_u64().and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   let item=o["itemId"].as_str().and_then(|s|s.parse::<u64>().ok()).ok_or(bad)?;
   let coord=|key:&str|o.get(key).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
   let orientation=o["orientation"].as_str().ok_or(bad)?;
   let t=crate::grid_instance_preview::resolve_grid_orientation_target(source,ordinal,item,(coord("x")?,coord("y")?),"full",orientation)?;
   crate::grid_instance_preview::house_exterior_identity(&root,&t.grid_id)?;
   let obj=&root["World"]["GridCollection"]["Grids"][&t.grid_id]["Objects"][&t.object_id];
   if !ddv_save_patch::storage_pose(&root,obj)||!selected.insert(format!("{}:{}",t.grid_id,t.object_id)){return Err(bad);}
  }
  return Ok(Some(selected));
 }
 if kind=="outdoor"{
  let rows=m.get("destinations").and_then(Value::as_array).filter(|a|!a.is_empty()&&a.len()<=64).ok_or(bad)?;
  let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
  let mut grids=HashSet::new();
  for w in rows{
   let d=crate::grid_instance_preview::resolve_plain_grid_destination(source,w)?;
   let (_,layout,factor,sx,sy)=crate::grid_instance_preview::house_exterior_identity(&root,&d.grid_id)?;
   if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1)||!grids.insert(d.grid_id){return Err(bad);}
  }
  return Ok(Some(grids));
 }
 if !matches!(kind,"room"|"floor"|"building"){return Err(bad);}
 let ordinal=m.get("roomOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&*n<=2048).ok_or(bad)?;
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 let collection=&root["World"]["GridCollection"];
 let houses=root["World"]["PlayerHouses"].as_array().filter(|a|a.len()<=128).ok_or(bad)?;
 let mut rooms=Vec::new();let mut refs=HashMap::<u64,usize>::new();
 for(h,house)in houses.iter().enumerate(){
  let Some(floors)=house.get("Floors")else{continue;};
  for(f,floor)in floors.as_array().filter(|a|a.len()<=128).ok_or(bad)?.iter().enumerate(){
   let Some(map)=floor.get("Rooms")else{continue;};
   for(k,r)in map.as_object().ok_or(bad)?{
    if k.parse::<i32>().ok().is_none_or(|n|n.to_string()!=*k)||!r.is_object()||rooms.len()>=2048{return Err(bad);}
    let gid=r["FloorGridID"].as_u64();
    if let Some(n)=gid{*refs.entry(n).or_default()+=1;}
    if let Some(w)=r.get("WallGridIDs"){for v in w.as_object().ok_or(bad)?.values(){if let Some(n)=v.as_u64(){*refs.entry(n).or_default()+=1;}}}
    rooms.push((h,f,gid));
   }
  }
 }
 let &(house,floor,_)=rooms.get(ordinal-1).ok_or(bad)?;
 let mut out=HashSet::new();
 for(i,(h,f,gid))in rooms.iter().enumerate(){
  if *h!=house||kind!="building"&&*f!=floor||kind=="room"&&i+1!=ordinal{continue;}
  let n=gid.filter(|n|*n>0&&*n<=u32::MAX as u64&&refs.get(n)==Some(&1)).ok_or(bad)?;
  let key=n.to_string();let g=&collection["Grids"][&key];
  if g["ID"].as_u64()!=Some(n)||!g["Objects"].is_object()||g["GridDataPath"].as_str().is_none_or(|p|!p.starts_with("GridData/Rooms/Room")||!p.ends_with(".json"))||
    collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&key)))||!out.insert(key){return Err(bad);}
 }
 if out.is_empty(){return Err(bad);}Ok(Some(out))
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn room_floor_building_scope_resolves_owned_native_floors(){
  let raw=br#"{"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":1},"1":{"FloorGridID":2}}},{"Rooms":{"0":{"FloorGridID":3}}}]}],"GridCollection":{"Grids":{"1":{"ID":1,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","Objects":{}},"2":{"ID":2,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","Objects":{}},"3":{"ID":3,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","Objects":{}}}}}}"#;
  for(kind,ids)in [("room",vec!["2"]),("floor",vec!["1","2"]),("building",vec!["1","2","3"])]{
   let p=serde_json::json!({"kind":kind,"roomOrdinal":2});
   assert_eq!(resolve(raw,&p.to_string()).unwrap().unwrap(),ids.into_iter().map(str::to_owned).collect());
  }
  assert!(resolve(raw,r#"{"kind":"room","roomOrdinal":4}"#).is_err());
 }
}
