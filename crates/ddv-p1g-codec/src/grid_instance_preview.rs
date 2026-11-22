//! DB-05: local, read-only per-instance GridObject projection.
//! Uses only fields verified in the Steam v1.26.1/1.26.2 protobuf schema.
//! Do not include Save grid IDs, object IDs, source paths or custom states
//! in the receipt. This is not an editor target/placement authority.
use super::CodecError;
use ddv_save_patch::{GridCoordinateTarget,GridObjectKind};
use serde_json::{Value,Map};
use std::collections::HashSet;

const MAX_GRIDS:usize=2048;
const MAX_SCANNED_OBJECTS:usize=100_000;
const MAX_ROWS:usize=20_000;
const MAX_REMOVALS:usize=100_000;

#[derive(Default)]
struct Scan {
    full:usize,
    diff:usize,
    scanned:usize,
    invalid:usize,
    not_item:usize,
    missing_coords:usize,
    removal_markers:usize,
    sampled:bool,
    rows:Vec<Value>,
    private_targets:Vec<(GridCoordinateTarget,Option<(i32,i32)>)>,
}

fn key_id(key:&str)->Option<u64>{
    let id=key.parse::<u64>().ok()?;
    (id.to_string()==key).then_some(id)
}
fn valid_grid<'a>(key:&str,value:&'a Value)->Option<&'a Map<String,Value>>{
    let id=key_id(key)?;
    let grid=value.as_object()?;
    if grid.get("ID").is_some_and(|v|v.as_u64()!=Some(id)){
        return None;
    }
    Some(grid)
}
fn observed_coordinates(object:&Map<String,Value>)->Option<(i32,i32)>{
    let x=object.get("X")?.as_i64()?;
    let y=object.get("Y")?.as_i64()?;
    Some((i32::try_from(x).ok()?,i32::try_from(y).ok()?))
}
fn observed_orientation(object:&Map<String,Value>)->Option<&str>{
    let value=object.get("Orientation")?.as_str()?;
    if (1..=32).contains(&value.len()) &&
       value.bytes().enumerate().all(|(i,b)|
         if i==0{b.is_ascii_alphabetic()}else{
           b.is_ascii_alphanumeric()||b==b'_'
         }){
        Some(value)
    }else{None}
}
fn project_objects(
    source:&Map<String,Value>,grid_id:&str,modified:bool,
    removed:&HashSet<u64>,scan:&mut Scan
){
    for (key,value) in source{
        if scan.scanned==MAX_SCANNED_OBJECTS||scan.rows.len()==MAX_ROWS{
            scan.sampled=true;break;
        }
        scan.scanned+=1;
        let Some(id)=key_id(key) else {
            scan.invalid+=1;continue;
        };
        if modified&&removed.contains(&id){continue;}
        let Some(obj)=value.as_object() else {
            scan.invalid+=1;continue;
        };
        if obj.get("ID").is_some_and(|v|v.as_u64()!=Some(id)){
            scan.invalid+=1;continue;
        }
        let Some(item_id)=obj.get("ItemID").and_then(Value::as_u64)
            .filter(|v|*v>0) else {
            scan.not_item+=1;continue;
        };
        let xy=observed_coordinates(obj);
        if xy.is_none(){scan.missing_coords+=1;}
        // Index is per-open-document only, not a stable instance identifier,
        // writer handle, real grid key or gameplay object ID.
        let ordinal=scan.rows.len()+1;
        scan.private_targets.push((GridCoordinateTarget{
            kind:if modified{GridObjectKind::DiffModified}else{GridObjectKind::Full},
            grid_id:grid_id.to_owned(),object_id:key.to_owned(),item_id
        },xy));
        scan.rows.push(serde_json::json!({
            "localOrdinal":ordinal,
            "itemId":item_id.to_string(),
            "recordKind":if modified{"diff_modified"}else{"full"},
            "x":xy.map(|(x,_)|x),
            "y":xy.map(|(_,y)|y),
            "orientation":observed_orientation(obj),
            "coordinatesObserved":xy.is_some()
        }));
    }
}

/// Scan the *current local* Save profile only. Its original bytes and
/// all IDs/unknown object state stay in Rust Worker; only an explicit
/// user-requested browser UI preview receives projected coordinates.
fn scan_grid_instances(source:&[u8])->Result<(Scan,&'static str),CodecError>{
    let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
    let world=root.get("World").and_then(Value::as_object)
        .ok_or(CodecError::RequiredRoot)?;
    let grid_collection=world.get("GridCollection");
    let mut scan=Scan::default();
    let status=match grid_collection{
        None=>"not_observed",
        Some(value) if !value.is_object()=>"incompatible_structure",
        Some(value)=>{
            let collection=value.as_object().ok_or(CodecError::Json)?;
            let full=collection.get("Grids").and_then(Value::as_object);
            let diff=collection.get("DiffGrids").and_then(Value::as_object);
            if collection.get("Grids").is_some()&&full.is_none(){
                scan.invalid+=1;
            }
            if collection.get("DiffGrids").is_some()&&diff.is_none(){
                scan.invalid+=1;
            }
            let mut visited=0usize;
            if let Some(grids)=full{
                for (key,value) in grids{
                    if visited>=MAX_GRIDS||scan.sampled{
                        scan.sampled=true;break;
                    }
                    visited+=1;
                    let Some(grid)=valid_grid(key,value) else {
                        scan.invalid+=1;continue;
                    };
                    let empty=Map::new();
                    let Some(objects)=grid.get("Objects")
                        .map_or(Some(&empty),Value::as_object) else {
                        scan.invalid+=1;continue;
                    };
                    scan.full+=1;
                    project_objects(objects,key,false,&HashSet::new(),&mut scan);
                }
            }
            if let Some(grids)=diff{
                for (key,value) in grids{
                    if visited>=MAX_GRIDS||scan.sampled{
                        scan.sampled=true;break;
                    }
                    visited+=1;
                    if full.is_some_and(|f|f.contains_key(key)){
                        scan.invalid+=1;continue;
                    }
                    let Some(grid)=valid_grid(key,value) else {
                        scan.invalid+=1;continue;
                    };
                    let empty=Map::new();
                    let Some(objects)=grid.get("ModifiedObjects")
                        .map_or(Some(&empty),Value::as_object) else {
                        scan.invalid+=1;continue;
                    };
                    let mut removed=HashSet::new();
                    if let Some(r)=grid.get("RemovedObjects"){
                        let Some(list)=r.as_array() else {
                            scan.invalid+=1;continue;
                        };
                        if list.len()>MAX_REMOVALS||list.iter().any(|v|
                            v.as_u64().is_none()){
                            scan.invalid+=1;continue;
                        }
                        for id in list.iter().filter_map(Value::as_u64){
                            removed.insert(id);
                        }
                    }
                    if scan.removal_markers+removed.len()>MAX_REMOVALS{
                        scan.sampled=true;break;
                    }
                    scan.removal_markers+=removed.len();
                    scan.diff+=1;
                    project_objects(objects,key,true,&removed,&mut scan);
                }
            }
            if scan.sampled||scan.invalid>0{
                "partial_inconclusive"
            }else if scan.rows.is_empty(){
                "observed_no_item_refs"
            }else{
                "saved_object_instances"
            }
        }
    };
    Ok((scan,status))
}

pub(super) fn resolve_grid_coordinate_target(
    profile:&[u8],ordinal:usize,expected_item:u64,
    expected:(i32,i32),record_kind:&str
)->Result<GridCoordinateTarget,CodecError>{
    if ordinal==0||ordinal>MAX_ROWS||expected_item==0{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let (target,observed)=scan.private_targets.get(ordinal-1)
        .ok_or(CodecError::Json)?;
    let kind=match target.kind{
        GridObjectKind::Full=>"full",
        GridObjectKind::DiffModified=>"diff_modified"
    };
    if target.item_id!=expected_item||
       observed!=&Some(expected)||kind!=record_kind{
        return Err(CodecError::Json);
    }
    Ok(target.clone())
}

/// Resolve up to sixteen UI-local ordinals in ONE scan. Real grid/object
/// IDs remain private inside WASM, even for a batch. Duplicate or stale
/// ordinals reject the entire edit; partial scans cannot authorize editing.
pub(super) fn resolve_grid_coordinate_targets(
    profile:&[u8],selections:&[(usize,u64,(i32,i32),String)]
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    if selections.is_empty()||selections.len()>16{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let mut chosen=HashSet::new();
    let mut targets=Vec::with_capacity(selections.len());
    for (ordinal,item,expected,kind) in selections{
        if *ordinal==0||*ordinal>MAX_ROWS||*item==0||
           !chosen.insert(*ordinal){
            return Err(CodecError::Json);
        }
        let (target,xy)=scan.private_targets.get(ordinal-1)
            .ok_or(CodecError::Json)?;
        let saved_kind=match target.kind{
            GridObjectKind::Full=>"full",
            GridObjectKind::DiffModified=>"diff_modified"
        };
        if target.item_id!=*item||xy!=&Some(*expected)||kind!=saved_kind{
            return Err(CodecError::Json);
        }
        targets.push(target.clone());
    }
    Ok(targets)
}

pub(super) fn saved_grid_instances_json(source:&[u8])->Result<String,CodecError>{
    let (scan,status)=scan_grid_instances(source)?;
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.grid-instance-preview@1",
        "status":status,
        "observedFullGrids":scan.full,
        "observedDiffGrids":scan.diff,
        "scannedObjectRecords":scan.scanned,
        "notItemReferences":scan.not_item,
        "invalidRecords":scan.invalid,
        "removedObjectMarkers":scan.removal_markers,
        "rowsMissingCoordinates":scan.missing_coords,
        "sampled":scan.sampled,
        "rows":scan.rows,
        "sourceGridIdentityVerified":false,
        "effectivePlacementVerified":false,
        "legalPlacementVerified":false,
        "stableInstanceIdentityVerified":false,
        "saveWritingAuthorized":false
    })).map_err(|_|CodecError::Json)
}

#[cfg(test)]
mod tests{
    use super::*;

    fn project(input:&[u8])->Value{
        serde_json::from_str(&saved_grid_instances_json(input).unwrap()).unwrap()
    }

    #[test]
    fn scans_full_and_modified_objects_preserving_signed_coordinates(){
        let sample=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{
            "Grids":{"101":{"ID":101,"GridDataPath":"GridData/private.json",
              "Objects":{
                "1":{"ID":1,"ItemID":40000001,"X":-12,"Y":45,
                  "Orientation":"West","PrivateState":{"PlayerName":"secret"}},
                "2":{"ID":2,"ItemID":9999,"X":15,"Other":true},
                "3":{"ID":3,"ItemID":0,"X":7,"Y":4}
              }}},
            "DiffGrids":{"202":{"ID":202,"RemovedObjects":[4],
              "ModifiedObjects":{
                "4":{"ID":4,"ItemID":40000001,"X":333,"Y":9},
                "5":{"ID":5,"ItemID":40000002,"X":32,"Y":-7,
                  "Orientation":"South","Private":"do-not-project"}
              }}}
            }},"Future":"stay-private"}"#;
        let v=project(sample);
        assert_eq!(v["status"],"saved_object_instances");
        assert_eq!(v["rows"].as_array().unwrap().len(),3);
        assert_eq!(v["rows"][0]["itemId"],"40000001");
        assert_eq!(v["rows"][0]["x"],-12);
        assert_eq!(v["rows"][0]["y"],45);
        assert_eq!(v["rows"][0]["orientation"],"West");
        assert_eq!(v["rows"][0]["localOrdinal"],1);
        assert_eq!(v["rows"][1]["coordinatesObserved"],false);
        assert_eq!(v["rows"][1]["x"],Value::Null);
        assert_eq!(v["rows"][2]["recordKind"],"diff_modified");
        assert_eq!(v["rows"][2]["y"],-7);
        assert_eq!(v["removedObjectMarkers"],1);
        assert_eq!(v["rowsMissingCoordinates"],1);
        assert_eq!(v["effectivePlacementVerified"],false);
        assert_eq!(v["saveWritingAuthorized"],false);
        let report=saved_grid_instances_json(sample).unwrap();
        for secret in [
            "secret","do-not-project","private.json","\"101\"","\"202\"",
            "\"GridDataPath\"","\"PlayerName\"","\"Future\""
        ]{assert!(!report.contains(secret),"{secret}");}
    }

    #[test]
    fn deletion_only_and_missing_world_grid_are_not_save_corruption(){
        let removed=br#"{"World":{"GridCollection":{"DiffGrids":{
          "42":{"RemovedObjects":[1,2,2]}
        }}}}"#;
        let v=project(removed);
        assert_eq!(v["status"],"observed_no_item_refs");
        assert_eq!(v["removedObjectMarkers"],2);
        assert_eq!(v["invalidRecords"],0);
        let missing=br#"{"World":{}}"#;
        assert_eq!(project(missing)["status"],"not_observed");
        let future=br#"{"World":{"GridCollection":{"Grids":null}}}"#;
        assert_eq!(project(future)["status"],"partial_inconclusive");
    }

    #[test]
    fn skips_stale_colliding_numeric_keys_and_rejects_unsafe_coordinates(){
        let sample=br#"{"World":{"GridCollection":{"Grids":{
          "00":{"Objects":{"1":{"ItemID":45,"X":5,"Y":6}}},
          "2":{"ID":3,"Objects":{"1":{"ItemID":46,"X":5,"Y":6}}},
          "3":{"Objects":{"1":{"ID":2,"ItemID":47,"X":5,"Y":6}}},
          "4":{"Objects":{"1":{"ItemID":48,"X":2147483648,"Y":6,
            "Orientation":"do-not-echo-unsafe-str"}}}
        }}}}"#;
        let v=project(sample);
        assert_eq!(v["status"],"partial_inconclusive");
        assert_eq!(v["invalidRecords"],3);
        assert_eq!(v["rows"].as_array().unwrap().len(),1);
        assert_eq!(v["rows"][0]["coordinatesObserved"],false);
        assert_eq!(v["rows"][0]["orientation"],Value::Null);
    }
}
