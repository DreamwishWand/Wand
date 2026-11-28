//! Source-local DiffGrid overlay, not a writer or game-load authorization.
//! Steam 1.26.2 DiffGrid.TryGetObject @ 0x42BDED0 checks modified first.
//! DiffGrid.<get_Objects>d__85.MoveNext @ 0x42BF130 first enumerates
//! surviving defaults (with replacement), then modified IDs absent from defaults.
use super::CodecError;
use serde_json::{Value,Map,json};
use std::collections::{HashMap,HashSet};

const LIMIT:usize=100_000;
const ORIENTATIONS:[&str;16]=["GridOrientation_Up","GridOrientation_UpUpRight","GridOrientation_UpRight","GridOrientation_UpRightRight","GridOrientation_Right","GridOrientation_DownRightRight","GridOrientation_DownRight","GridOrientation_DownDownRight","GridOrientation_Down","GridOrientation_DownDownLeft","GridOrientation_DownLeft","GridOrientation_DownLeftLeft","GridOrientation_Left","GridOrientation_UpLeftLeft","GridOrientation_UpLeft","GridOrientation_UpUpLeft"];

fn uint(v:&Value)->Option<u32>{v.as_u64().and_then(|v|u32::try_from(v).ok())}
fn signed(v:&Value)->Option<i32>{v.as_i64().and_then(|v|i32::try_from(v).ok())}
fn key_id(key:&str)->Option<u32>{let v=key.parse::<u32>().ok()?;(v.to_string()==key).then_some(v)}
fn obj(v:&Value)->Result<&Map<String,Value>,CodecError>{v.as_object().ok_or(CodecError::Json)}
fn field_map<'a>(v:&'a Value,k:&str,empty:&'a Map<String,Value>)->Result<&'a Map<String,Value>,CodecError>{v.get(k).map_or(Ok(empty),obj)}
fn pose(v:&Value,origin:&str,source:bool)->Result<Value,CodecError>{
    let bad=CodecError::Json;
    let (item,x,y,o)=if source {
        (uint(&v["itemId"]),signed(&v["x"]),signed(&v["y"]),
         uint(&v["orientationCode"]).and_then(|i|ORIENTATIONS.get(i as usize).copied()))
    }else{
        (uint(&v["ItemID"]),v.get("X").map_or(Some(0),signed),
         v.get("Y").map_or(Some(0),signed),v.get("Orientation").map_or(Some("GridOrientation_Up"),Value::as_str))
    };
    let item=item.filter(|v|*v>0).ok_or(bad)?;
    let o=o.filter(|v|ORIENTATIONS.contains(v)).ok_or(bad)?;
    Ok(json!({"itemId":item.to_string(),"x":x.ok_or(bad)?,"y":y.ok_or(bad)?,"orientation":o,"origin":origin}))
}

fn reconstruct(defaults:&[(u32,&Value)],grid:&Value)->Result<(Vec<Value>,Vec<u32>,usize),CodecError>{
    let bad=CodecError::Json;
    let empty=Map::new();
    let modified=field_map(grid,"ModifiedObjects",&empty)?;
    let removals=grid.get("RemovedObjects").map(|v|v.as_array().ok_or(bad)).transpose()?;
    if defaults.len()+modified.len()>LIMIT||removals.is_some_and(|a|a.len()>LIMIT){return Err(CodecError::Bounds);}
    let mut removed=HashSet::new();
    for v in removals.into_iter().flatten(){removed.insert(uint(v).ok_or(bad)?);}
    let ids:HashSet<u32>=defaults.iter().map(|(id,_)|*id).collect();
    if ids.len()!=defaults.len(){return Err(bad);}
    let mut changes=HashMap::new();
    for (k,v) in modified {
        let id=key_id(k).ok_or(bad)?;
        obj(v)?;
        if v.get("ID").map_or(id!=0,|x|uint(x)!=Some(id)){return Err(bad);}
        changes.insert(id,v);
    }
    let mut points=Vec::new();let mut private_ids=Vec::new();
    let mut divergent=0;
    for (id,v) in defaults {
        if removed.contains(id){
            if changes.contains_key(id){divergent+=1;}
            continue;
        }
        private_ids.push(*id);
        points.push(match changes.get(id){
            Some(changed)=>pose(changed,"modified",false)?,
            None=>pose(v,"default",true)?
        });
    }
    for (key,v) in modified {
        let id=key_id(key).ok_or(bad)?;
        if !ids.contains(&id){private_ids.push(id);points.push(pose(v,"added",false)?);}
    }
    Ok((points,private_ids,divergent))
}

pub(super) fn project(profile:&[u8],witness:&Value)->Result<String,CodecError>{
    let bad=CodecError::Json;
    let row=obj(witness)?;
    if !(row.len()==8||row.len()==9&&row.contains_key("gridBounds"))||witness["contract"]!="wand.db05.diffgrid-effective-witness@1"||
       witness["gameVersion"]!="1.26.2"||witness["platform"]!="Steam"{return Err(bad);}
    let layout=witness["layoutId"].as_str().filter(|p|p.starts_with("SceneLayouts/")&&p.ends_with(".json")&&p.len()<=512&&!p.contains("..")&&!p.contains('\\')&&!p.chars().any(char::is_control)).ok_or(bad)?;
    let layout_type=witness["layoutType"].as_str().filter(|v|matches!(*v,
       "Meta.GridCollection, Meta"|"Meta.DefaultCharacterHouseData, Meta"|
       "Meta.DefaultPlayerHouseData, Meta"|"Meta.DefaultBoutiqueBuildingData, Meta"|
       "Meta.DefaultRealmData, Meta"|"Meta.DefaultOffGridBuildingData, Meta"|
       "Meta.DefaultFloatingIslandData, Meta")).ok_or(bad)?;
    let id=uint(&witness["nativeGridId"]).ok_or(bad)?;
    let hashes=witness["hashes"].as_array().filter(|a|a.len()==2).ok_or(bad)?;
    let hash=signed(&hashes[0]).ok_or(bad)?;
    let data_hash=signed(&hashes[1]).ok_or(bad)?;
    let originals=witness["defaultObjects"].as_array().filter(|a|a.len()<=LIMIT).ok_or(bad)?;
    let mut defaults=Vec::with_capacity(originals.len());
    let mut default_ids=HashSet::new();
    for v in originals{
        let row=obj(v)?;
        if !(row.len()==5||row.len()==6&&row.get("plainSource").is_some_and(Value::is_boolean)){return Err(bad);}
        let id=uint(&v["gridObjectIdNative"]).ok_or(bad)?;
        if !default_ids.insert(id){return Err(bad);}
        pose(v,"default",true)?;
        defaults.push((id,v));
    }
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let c=&root["World"]["GridCollection"];
    obj(c)?;
    let empty=Map::new();
    let full=field_map(c,"Grids",&empty)?;
    let diff=field_map(c,"DiffGrids",&empty)?;
    if diff.len()>8192{return Err(CodecError::Bounds);}
    let mut matched=Vec::new();let mut mismatched=0;let mut unresolved=0;let mut total=0usize;
    for (key,grid) in diff{
        if grid["GridDefaultLayoutPath"].as_str()!=Some(layout)||
           grid["GridDefaultLayoutType"].as_str()!=Some(layout_type)||
           uint(&grid["DefaultLayoutGridID"])!=Some(id){continue;}
        if signed(&grid["DefaultGridHashCode"])!=Some(hash)||
           signed(&grid["DefaultGridDataHashCode"])!=Some(data_hash){mismatched+=1;continue;}
        if full.contains_key(key)||key_id(key).is_none()||
           grid.get("ID").map_or(key!="0",|v|uint(v)!=key_id(key)){unresolved+=1;continue;}
        match reconstruct(&defaults,grid){
            Ok((points,_,divergent))=>{
                total+=points.len();if total>LIMIT{return Err(CodecError::Bounds);}
                matched.push(json!({"localGridOrdinal":matched.len()+1,"points":points,"lookupEnumerationDivergenceCount":divergent}));
            }
            Err(_)=>unresolved+=1
        }
    }
    serde_json::to_string(&json!({"contract":"wand.db05.diffgrid-effective-preview@1",
       "grids":matched,"hashMismatchCount":mismatched,"unresolvedCount":unresolved,
       "sourceAuthenticityVerified":false,"saveWritingAuthorized":false,
       "placementLegalityVerified":false})).map_err(|_|bad)
}

#[cfg(test)]
mod tests{
    use super::*;
    fn source(id:u32,item:u32)->Value{json!({"gridObjectIdNative":id,"itemId":item,"x":0,"y":0,"orientationCode":0})}
    fn saved(id:u32,item:u32)->Value{json!({"ID":id,"ItemID":item,"X":3,"Y":2,"Orientation":"GridOrientation_Right"})}
    #[test]
    fn native_enumeration_is_not_lookup_precedence(){
        let a=source(1,10);let b=source(2,20);let c=source(3,30);let d=source(4,40);
        let grid=json!({"ModifiedObjects":{"1":saved(1,11),"2":saved(2,22),"5":saved(5,55),"6":saved(6,66)},"RemovedObjects":[1,3,5,999]});
        let (points,_,divergent)=reconstruct(&[(1,&a),(2,&b),(3,&c),(4,&d)],&grid).unwrap();
        assert_eq!(divergent,1);
        assert_eq!(points.iter().map(|v|v["itemId"].as_str().unwrap()).collect::<Vec<_>>(),vec!["22","40","55","66"]);
        assert_eq!(points[0]["origin"],"modified");
        assert_eq!(points[1]["origin"],"default");
        assert_eq!(points[2]["origin"],"added");
    }
    #[test]
    fn exact_hash_pair_and_identity_are_required(){
        let witness=json!({"contract":"wand.db05.diffgrid-effective-witness@1","gameVersion":"1.26.2","platform":"Steam",
         "layoutId":"SceneLayouts/Test.json","layoutType":"Meta.GridCollection, Meta","nativeGridId":2,"hashes":[-3,4],"defaultObjects":[source(1,10)]});
        let grid=json!({"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDefaultLayoutType":"Meta.GridCollection, Meta","DefaultLayoutGridID":2,"DefaultGridHashCode":-3,"DefaultGridDataHashCode":4});
        let mut wrong=grid.clone();wrong["ID"]=json!(21);wrong["DefaultGridDataHashCode"]=json!(5);
        let root=json!({"GameInfo":{"Version":643},"World":{"GridCollection":{"DiffGrids":{"20":grid,"21":wrong}}}});
        let result:Value=serde_json::from_str(&project(&serde_json::to_vec(&root).unwrap(),&witness).unwrap()).unwrap();
        assert_eq!(result["grids"].as_array().unwrap().len(),1);
        assert_eq!(result["grids"][0]["points"][0]["itemId"],"10");
        assert_eq!(result["hashMismatchCount"],1);
        assert_eq!(result["saveWritingAuthorized"],false);
    }
}
