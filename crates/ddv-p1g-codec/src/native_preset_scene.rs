//! Native preset -> Wand scene. Local-only, strict supported-state subset.
//! Native grid/object IDs are used only to resolve the tree, then discarded.
//! No share code, owner, private account or arbitrary unknown fields enter a Scene.
use crate::CodecError;
use serde_json::{json,Value};
use std::collections::{BTreeMap,BTreeSet};
const BAD:CodecError=CodecError::Json;
const MAX:usize=16_000_000;
const ROOT_LIMIT:usize=5000;
const MIXED_LIMIT:usize=128;
const SUPPORT_LIMIT:usize=32;
fn map(v:&Value)->Result<&serde_json::Map<String,Value>,CodecError>{v.as_object().ok_or(BAD)}
fn uint(v:&Value)->Result<u32,CodecError>{v.as_u64().and_then(|v|u32::try_from(v).ok()).ok_or(BAD)}
fn int(v:&Value)->Result<i32,CodecError>{v.as_i64().and_then(|v|i32::try_from(v).ok()).ok_or(BAD)}
fn id(k:&str)->Result<u32,CodecError>{let n=k.parse::<u32>().map_err(|_|BAD)?;if n.to_string()!=k{return Err(BAD);}Ok(n)}
fn factor(v:&Value)->Result<u32,CodecError>{let f=uint(v)?;if !matches!(f,1|2){return Err(BAD);}Ok(f)}
fn orientation(v:&Value)->Result<(&'static str,u32),CodecError>{
 let n=match (v.as_str(),v.as_u64()){
  (Some("GridOrientation_Up"),_)|(_,Some(0))=>0,
  (Some("GridOrientation_Right"),_)|(_,Some(4))=>1,
  (Some("GridOrientation_Down"),_)|(_,Some(8))=>2,
  (Some("GridOrientation_Left"),_)|(_,Some(12))=>3,
  _=>return Err(BAD)
 };
 Ok((["GridOrientation_Up","GridOrientation_Right","GridOrientation_Down","GridOrientation_Left"][n as usize],n))
}
fn empty(v:Option<&Value>)->bool{v.is_none_or(|v|v.is_null()||v.as_object().is_some_and(|o|o.is_empty()))}
fn path(v:&Value)->Result<&str,CodecError>{
 let s=v.as_str().ok_or(BAD)?;
 if !s.starts_with("GridData/Furniture/")||!s.ends_with(".json")||s.len()>512||s.contains("..")||
 !s.bytes().all(|c|c.is_ascii_alphanumeric()||b"_./ -".contains(&c)){return Err(BAD);}Ok(s)
}
struct Context<'a>{grids:&'a serde_json::Map<String,Value>,seen:BTreeSet<u32>,objects:usize}
impl<'a> Context<'a>{
 fn grid(&mut self,gid:u32)->Result<&'a Value,CodecError>{
  if !self.seen.insert(gid){return Err(BAD);}
  let g=self.grids.get(&gid.to_string()).ok_or(BAD)?;
  if uint(&g["ID"])?!=gid||!empty(g.get("DiffGrids")){return Err(BAD);}
  Ok(g)
 }
 fn objects(&mut self,g:&'a Value)->Result<Vec<(u32,&'a Value)>,CodecError>{
  let m=map(&g["Objects"])?;let next=uint(&g["NextGridObjectID"])?;
  if next==0||m.len()>ROOT_LIMIT||self.objects.checked_add(m.len()).is_none_or(|n|n>ROOT_LIMIT){return Err(BAD);}
  self.objects+=m.len();let mut sorted=BTreeMap::new();
  for (k,v) in m{let n=id(k)?;if n>=next||uint(&v["ID"])?!=n||map(v)?.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")){return Err(BAD);}sorted.insert(n,v);}
  Ok(sorted.into_iter().collect())
 }
 fn child(&mut self,v:&Value,depth:usize)->Result<Value,CodecError>{
  let Some(state)=v.get("State") else{return Ok(Value::Null);};
  if state.is_null()||state.as_object().is_some_and(|o|o.is_empty()){return Ok(Value::Null);}
  let m=map(state)?;let s=map(&state["SubGrid"])?;
  if m.len()!=1||s.len()!=1||depth>=8{return Err(BAD);}
  let gid=uint(&state["SubGrid"]["GridID"])?;if gid==0{return Err(BAD);}
  let g=self.grid(gid)?;let f=factor(&g["TessellationFactor"])?;let source=path(&g["GridDataPath"])?;
  if g.get("GridDefaultLayoutPath").is_some_and(|v|!v.is_null()&&v.as_str()!=Some("")){return Err(BAD);}
  let mut objects=Vec::new();
  for (_,o) in self.objects(g)?{
   let item=uint(&o["ItemID"])?;let x=int(&o["X"])?;let y=int(&o["Y"])?;
   if item/100_000!=400||x<0||y<0||x>131072||y>131072{return Err(BAD);}
   let (ori,_)=orientation(&o["Orientation"])?;
   objects.push(json!({"itemId":item,"x":x,"y":y,"orientation":ori,"child":self.child(o,depth+1)?}));
  }
  Ok(json!({"factor":f,"sourcePath":source,"objects":objects}))
 }
}
pub(super) fn convert(raw:&str)->Result<String,CodecError>{
 if raw.len()>MAX||ddv_save_patch::validate_json_without_edit(raw).is_err(){return Err(BAD);}
 let v:Value=serde_json::from_str(raw).map_err(|_|BAD)?;
 if map(&v)?.len()!=6||v["schema"]!="wand.preset.native-backup@1"||v["kind"]!="native-decoration"||v["storage"]!="decoration"||!v["baseItemId"].is_null()||!matches!(uint(&v["gameSchema"])?,624|626|643){return Err(BAD);}
 let payload=&v["payload"];if uint(&payload["StateFlags"])?&16!=0{return Err(BAD);}
 let collection=&payload["GridCollection"];let grids=map(&collection["Grids"])?;
 if grids.is_empty()||grids.len()>ROOT_LIMIT||!empty(collection.get("DiffGrids")){return Err(BAD);}
 let next=uint(&collection["NextGridID"])?;
 if next==0||grids.keys().any(|k|id(k).map_or(true,|n|n>=next)){return Err(BAD);}
 let mut cx=Context{grids,seen:BTreeSet::new(),objects:0};
 let root=cx.grid(0)?;let f=factor(&root["TessellationFactor"])?;
 if root["GridDataPath"].as_str()!=Some("")||root.get("GridDefaultLayoutPath").is_some_and(|v|!v.is_null()&&v.as_str()!=Some("")){return Err(BAD);}
 let mut rows=Vec::new();let mut mixed=false;
 for (_,o) in cx.objects(root)?{
  let item=uint(&o["ItemID"])?;if item/100_000!=400{return Err(BAD);}
  let (_,ori)=orientation(&o["Orientation"])?;let x=int(&o["X"])?;let y=int(&o["Y"])?;
  let before=cx.objects;let child=cx.child(o,0)?;
  let support=if child.is_null(){Value::Null}else{
   mixed=true;if cx.objects-before+1>SUPPORT_LIMIT{return Err(BAD);}
   json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":item,"tree":child})
  };
  rows.push((item,x,y,ori,support));
 }
 if rows.is_empty()||cx.seen.len()!=grids.len()||mixed&&cx.objects>MIXED_LIMIT{return Err(BAD);}
 let xmin=rows.iter().map(|r|r.1).min().ok_or(BAD)?;let ymin=rows.iter().map(|r|r.2).min().ok_or(BAD)?;
 let output_factor=if mixed{2}else{f};let scale=i64::from(output_factor/f);let mut items=Vec::new();
 for (item,x,y,ori,support) in rows{
  let dx=(i64::from(x)-i64::from(xmin))*scale;let dy=(i64::from(y)-i64::from(ymin))*scale;
  if dx>131072||dy>131072{return Err(BAD);}
  let mut p=json!({"itemId":item,"dx":dx,"dy":dy,"orientation":ori});
  if mixed{p["support"]=support;}items.push(p);
 }
 let out=json!({"schema":if mixed{"wand.preset.mixed-scene@1"}else{"wand.preset.scene@1"},"gameVersion":"1.26.2","factor":output_factor,"anchor":"corner","items":items});
 serde_json::to_string(&out).map_err(|_|BAD)
}
#[cfg(test)]
mod tests{
 use super::*;
 fn fixture()->Value{json!({"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"native-decoration","storage":"decoration","baseItemId":null,"payload":{"PresetName":"Private","ShareInfo":{"Account":"PRIVATE"},"StateFlags":0,"GridCollection":{"NextGridID":3,"Grids":{"0":{"ID":0,"GridDataPath":"","TessellationFactor":1,"NextGridObjectID":9,"Objects":{"5":{"ID":5,"ItemID":40000001,"X":-3,"Y":5,"Orientation":"GridOrientation_Right","State":null},"7":{"ID":7,"ItemID":40000002,"X":0,"Y":4,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":2}}}}},"2":{"ID":2,"GridDataPath":"GridData/Furniture/Test.json","TessellationFactor":2,"NextGridObjectID":4,"Objects":{"3":{"ID":3,"ItemID":40000003,"X":0,"Y":1,"Orientation":"GridOrientation_Up","State":null}}}}}}})}
 #[test]
 fn scene_preserves_support_relative_positions_and_removes_private_ids(){
  let raw=convert(&fixture().to_string()).unwrap();let v:Value=serde_json::from_str(&raw).unwrap();
  assert_eq!(v["schema"],"wand.preset.mixed-scene@1");assert_eq!(v["factor"],2);
  assert_eq!(v["items"][0]["dx"],0);assert_eq!(v["items"][0]["dy"],2);
  assert_eq!(v["items"][1]["dx"],6);assert_eq!(v["items"][1]["orientation"],2);
  assert_eq!(v["items"][1]["support"]["tree"]["objects"][0]["y"],1);
  assert!(!raw.contains("PRIVATE"));assert!(!raw.contains("GridID"));assert!(!raw.contains("PresetName"));
 }
 #[test]
 fn rejects_cycles_orphans_unknown_state_and_noncardinal(){
  let v=fixture();
  let mut bad=v.clone();bad["payload"]["GridCollection"]["Grids"]["2"]["Objects"]["3"]["State"]=json!({"SubGrid":{"GridID":2}});assert!(convert(&bad.to_string()).is_err());
  let mut bad=v.clone();bad["payload"]["GridCollection"]["Grids"]["0"]["Objects"]["7"]["State"]=Value::Null;assert!(convert(&bad.to_string()).is_err());
  let mut bad=v.clone();bad["payload"]["GridCollection"]["Grids"]["0"]["Objects"]["5"]["State"]=json!({"Design":3});assert!(convert(&bad.to_string()).is_err());
  let mut bad=v.clone();bad["payload"]["GridCollection"]["Grids"]["0"]["Objects"]["5"]["Orientation"]=json!(2);assert!(convert(&bad.to_string()).is_err());
 }
 #[test]
 fn root_only_retains_source_factor(){
  let mut v=fixture();let c=&mut v["payload"]["GridCollection"]["Grids"];c.as_object_mut().unwrap().remove("2");c["0"]["Objects"]["7"]["State"]=Value::Null;
  let raw=convert(&v.to_string()).unwrap();let o:Value=serde_json::from_str(&raw).unwrap();
  assert_eq!(o["schema"],"wand.preset.scene@1");assert_eq!(o["factor"],1);assert_eq!(o["items"][1]["dx"],3);
 }
}
