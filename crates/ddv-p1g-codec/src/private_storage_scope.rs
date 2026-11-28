use crate::CodecError;
use serde_json::Value;
use std::collections::{HashMap,HashSet};

pub(super) fn resolve(source:&[u8],scope:&str)->Result<Option<HashSet<String>>,CodecError>{
 let bad=CodecError::Json;
 if scope.len()>65536{return Err(bad);}
 let s:Value=serde_json::from_str(scope).map_err(|_|bad)?;
 if s.is_null(){return Ok(None);}
 let m=s.as_object().filter(|m|m.len()==2).ok_or(bad)?;
 let kind=m.get("kind").and_then(Value::as_str).ok_or(bad)?;
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
