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

/// Draft request addresses only ephemeral grid and point ordinals. The
/// current local profile is the authority for stock and dependency checks.
/// Neither native keys nor candidate Save bytes leave Rust.
#[cfg(feature="wasm")]
pub(super) fn draft_project(profile:&[u8],request:&Value)->Result<String,CodecError>{
    use ddv_save_patch::diffgrid::{DiffAction,DiffDefault,DiffIdentity,DiffPose,preview_diffgrid_stock_batch};
    let bad=CodecError::Json;
    if obj(request)?.len()!=3||request["contract"]!="wand.db05.diffgrid-draft-request@1"{return Err(bad);}
    let source=&request["source"];
    let receipt:Value=serde_json::from_str(&project(profile,source)?).map_err(|_|bad)?;
    let plan=&request["plan"];
    if obj(plan)?.len()!=2{return Err(bad);}
    let ordinal=uint(&plan["gridOrdinal"]).filter(|n|*n>0).ok_or(bad)? as usize;
    let expected_grid=receipt["grids"].as_array().and_then(|a|a.get(ordinal-1)).ok_or(bad)?;
    let actions=plan["actions"].as_array().filter(|a|!a.is_empty()&&a.len()<=512).ok_or(bad)?;
    let bounds=&source["gridBounds"];
    let width=uint(&bounds["width"]).filter(|n|*n>0&&*n<=131072).ok_or(bad)?;
    let height=uint(&bounds["height"]).filter(|n|*n>0&&*n<=131072).ok_or(bad)?;
    let factor=uint(&bounds["factor"]).filter(|n|matches!(*n,1|2)).ok_or(bad)?;
    let allowed_item=|id:u32|id/100_000==400&&!crate::storage_source::is_storage(u64::from(id));
    let parse_pose=|v:&Value|->Result<DiffPose,CodecError>{
        let item_id=v["itemId"].as_str().and_then(|s|s.parse::<u32>().ok().filter(|n|n.to_string()==s))
            .filter(|n|allowed_item(*n)).ok_or(bad)?;
        let x=signed(&v["x"]).ok_or(bad)?;let y=signed(&v["y"]).ok_or(bad)?;
        let orientation=v["orientation"].as_str().filter(|o|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(o)||
          factor==1&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(o)).ok_or(bad)?.to_owned();
        Ok(DiffPose{item_id,x,y,orientation})
    };
    let destination=|p:&DiffPose|p.x>=0&&p.y>=0&&(p.x as u32)<width&&(p.y as u32)<height;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    let collection=&root["World"]["GridCollection"];
    let empty=Map::new();
    let full=field_map(collection,"Grids",&empty)?;
    let diff=field_map(collection,"DiffGrids",&empty)?;
    let defaults=source["defaultObjects"].as_array().ok_or(bad)?.iter()
        .map(|v|Ok((uint(&v["gridObjectIdNative"]).ok_or(bad)?,v))).collect::<Result<Vec<_>,CodecError>>()?;
    let native_grid_id=uint(&source["nativeGridId"]).ok_or(bad)?;
    let grid_hash=signed(&source["hashes"][0]).ok_or(bad)?;
    let data_hash=signed(&source["hashes"][1]).ok_or(bad)?;
    let layout=source["layoutId"].as_str().ok_or(bad)?;
    let layout_type=source["layoutType"].as_str().ok_or(bad)?;
    let mut selected=None;let mut seen=0;
    for (key,grid) in diff{
        if grid["GridDefaultLayoutPath"].as_str()!=Some(layout)||
            grid["GridDefaultLayoutType"].as_str()!=Some(layout_type)||
            uint(&grid["DefaultLayoutGridID"])!=Some(native_grid_id)||
            signed(&grid["DefaultGridHashCode"])!=Some(grid_hash)||
            signed(&grid["DefaultGridDataHashCode"])!=Some(data_hash)||
            full.contains_key(key)||key_id(key).is_none()||
            grid.get("ID").map_or(key!="0",|v|uint(v)!=key_id(key)){continue;}
        if let Ok((points,ids,_))=reconstruct(&defaults,grid){
            seen+=1;
            if seen==ordinal{selected=Some((key,grid,points,ids));break;}
        }
    }
    let (key,grid,points,ids)=selected.ok_or(bad)?;
    if expected_grid["points"]!=json!(points){return Err(bad);}
    let grid_id=key_id(key).filter(|n|*n>0).ok_or(bad)?;
    let mut identity_defaults=Vec::with_capacity(defaults.len());
    for (id,v) in &defaults{
        let p=pose(v,"default",true)?;
        let pose=DiffPose{item_id:uint(&v["itemId"]).ok_or(bad)?,x:signed(&p["x"]).ok_or(bad)?,y:signed(&p["y"]).ok_or(bad)?,
            orientation:p["orientation"].as_str().ok_or(bad)?.to_owned()};
        identity_defaults.push(DiffDefault{id:*id,pose,plain_source:v["plainSource"]==true});
    }
    let identity=DiffIdentity{grid_id,layout_path:layout.to_owned(),layout_type:layout_type.to_owned(),native_grid_id,
        grid_hash,data_hash,default_count:defaults.len(),defaults:identity_defaults};
    let default_ids:HashSet<u32>=defaults.iter().map(|(id,_)|*id).collect();
    let mut guards=HashSet::<String>::new();
    let mut stock=HashMap::<u32,u32>::new();
    let mut changes=Vec::new();
    let mut allocations=0u32;
    let stock_amount=|item:u32|uint(&root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"]).ok_or(bad);
    for action in actions{
        let kind=action["action"].as_str().ok_or(bad)?;
        if kind=="add"{
            if obj(action)?.len()!=2{return Err(bad);}
            let p=parse_pose(&action["pose"])?;
            if !destination(&p){return Err(bad);}
            stock.insert(p.item_id,stock_amount(p.item_id)?);
            changes.push(DiffAction::Add{pose:p});allocations+=1;continue;
        }
        let i=uint(&action["pointOrdinal"]).filter(|n|*n>0).ok_or(bad)? as usize-1;
        let id=*ids.get(i).ok_or(bad)?;
        let p=parse_pose(points.get(i).ok_or(bad)?)?;
        if parse_pose(&action["expected"])?!=p{return Err(bad);}
        if !guards.insert(id.to_string()){return Err(bad);}
        if matches!(kind,"transform"|"duplicate"){
            if obj(action)?.len()!=4{return Err(bad);}
            let new=parse_pose(&action["pose"])?;
            if new.item_id!=p.item_id||!destination(&new){return Err(bad);}
            if kind=="transform"{changes.push(DiffAction::Transform{id,expected:p,x:new.x,y:new.y,orientation:new.orientation});}
            else{
                stock.insert(p.item_id,stock_amount(p.item_id)?);allocations+=1;
                changes.push(DiffAction::Duplicate{id,expected:p,x:new.x,y:new.y,orientation:new.orientation});
            }
        }else if kind=="remove"{
            if obj(action)?.len()!=3{return Err(bad);}
            if !default_ids.contains(&id){stock.insert(p.item_id,stock_amount(p.item_id)?);}
            changes.push(DiffAction::Remove{id,expected:p});
        }else{return Err(bad);}
    }
    let next=uint(&grid["NextGridObjectID"]).ok_or(bad)?;
    for offset in 0..allocations{
        if !guards.insert(next.checked_add(offset).ok_or(bad)?.to_string()){return Err(bad);}
    }
    let guards=guards.into_iter().collect::<Vec<_>>();
    for group in guards.chunks(512){
        let deps=crate::grid_instance_preview::grid_identity_dependencies_for_ids(profile,key,group)?;
        if deps.blocking()>0||deps.historical>0{return Err(bad);}
    }
    let draft=preview_diffgrid_stock_batch(std::str::from_utf8(profile).map_err(|_|bad)?,&identity,&changes,&stock).map_err(|_|CodecError::Patch)?;
    if !draft.draft.changed||!draft.draft.untouched_bytes_preserved||draft.draft.writer_authorized||draft.draft.export_authorized{return Err(bad);}
    let result=project(draft.draft.patched_json.as_bytes(),source);
    let mut bytes=draft.draft.patched_json.into_bytes();
    use zeroize::Zeroize;
    bytes.zeroize();
    result
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
