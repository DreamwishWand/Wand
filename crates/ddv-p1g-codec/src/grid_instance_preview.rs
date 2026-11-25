//! DB-05: local, read-only per-instance GridObject projection.
//! Uses only fields verified in the Steam v1.26.1/1.26.2 protobuf schema.
//! Do not include Save grid IDs, object IDs, source paths or custom states
//! in the receipt. This is not an editor target/placement authority.
use super::CodecError;
use ddv_save_patch::{GridCoordinateTarget,GridObjectKind};
use serde_json::{Value,Map};
use std::collections::{HashMap,HashSet};

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
    subgrid_parents:HashSet<usize>,
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
    local_grid_ordinal:usize,removed:&HashSet<u64>,scan:&mut Scan
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
        if obj.get("State").and_then(|s|s.get("SubGrid")).is_some(){
            scan.subgrid_parents.insert(ordinal);
        }
        scan.private_targets.push((GridCoordinateTarget{
            kind:if modified{GridObjectKind::DiffModified}else{GridObjectKind::Full},
            grid_id:grid_id.to_owned(),object_id:key.to_owned(),item_id
        },xy));
        scan.rows.push(serde_json::json!({
            "localOrdinal":ordinal,
            "localGridOrdinal":local_grid_ordinal,
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
                    project_objects(objects,key,false,scan.full+scan.diff,
                        &HashSet::new(),&mut scan);
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
                    project_objects(objects,key,true,scan.full+scan.diff,
                        &removed,&mut scan);
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

/// DB-04 Owner contract: two roads (GroundAlteration) or two fences
/// cannot share an identical anchor in one Grid. This is NOT a general
/// placement/collision check. Source enum identities and decimal ItemID
/// fields come from DB-01's Steam 1.26.2 native classification.
/// Only check coordinates of changed targets, with the final batch
/// positions applied together (a swap must not fail transiently).
fn exclusive_anchor_class(item_id:u64)->Option<u64>{
    if item_id/10_000_000!=4{return None;}
    match (item_id%10_000_000)/100_000{
        1=>Some(1),7=>Some(7),_=>None
    }
}
pub(super) fn validate_exclusive_grid_moves(
    profile:&[u8],moves:&[(&GridCoordinateTarget,(i32,i32))]
)->Result<(),CodecError>{
    let exclusive=moves.iter().filter_map(|(target,xy)|
        exclusive_anchor_class(target.item_id).map(|class|(*target,*xy,class))
    ).collect::<Vec<_>>();
    if exclusive.is_empty(){return Ok(());}
    // DiffGrids can have unseen original defaults.
    if exclusive.iter().any(|(target,_,_)|target.kind!=GridObjectKind::Full){
        return Err(CodecError::Json);
    }
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    // Only affected Grid/class pairs and destinations are tracked. Unrelated
    // preexisting duplicates do not block ordinary edits or other grids.
    let mut changed=HashMap::with_capacity(exclusive.len());
    let mut scopes=HashSet::new();
    let mut destinations=HashMap::with_capacity(exclusive.len());
    for (target,xy,class) in exclusive{
        let scope=(target.kind,target.grid_id.as_str(),class);
        scopes.insert(scope);
        if changed.insert((target.kind,target.grid_id.as_str(),target.object_id.as_str()),xy).is_some()||
            destinations.insert((scope,xy),0usize).is_some(){
            return Err(CodecError::Json);
        }
    }
    // One pass across all saved instances, rather than per-target scans.
    for (other,original) in &scan.private_targets{
        let Some(class)=exclusive_anchor_class(other.item_id) else{continue;};
        let scope=(other.kind,other.grid_id.as_str(),class);
        if !scopes.contains(&scope){continue;}
        let final_xy=changed.get(&(other.kind,other.grid_id.as_str(),other.object_id.as_str()))
            .copied().or(*original).ok_or(CodecError::Json)?;
        if let Some(count)=destinations.get_mut(&(scope,final_xy)){
            *count+=1;
            if *count>1{return Err(CodecError::Json);}
        }
    }
    if destinations.values().any(|count|*count!=1){return Err(CodecError::Json);}

    Ok(())
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

/// Resolve a bounded mixed Grid batch against the same immutable opened Save
/// with ONE native GridObject scan. Private native map IDs stay in WASM.
pub(super) fn resolve_grid_mixed_targets(
    profile:&[u8],
    selections:&[(usize,u64,(i32,i32),String,Option<String>)]
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    if selections.is_empty()||selections.len()>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let mut seen=HashSet::new();
    let mut out=Vec::with_capacity(selections.len());
    for (ordinal,item,expected,kind,orientation) in selections{
        if *ordinal==0||*ordinal>MAX_ROWS||*item==0||
           !seen.insert(*ordinal){
            return Err(CodecError::Json);
        }
        let (target,xy)=scan.private_targets.get(ordinal-1)
            .ok_or(CodecError::Json)?;
        let observed_kind=match target.kind{
            GridObjectKind::Full=>"full",
            GridObjectKind::DiffModified=>"diff_modified"
        };
        let observed_orientation=scan.rows.get(ordinal-1)
            .and_then(|row|row.get("orientation")).and_then(Value::as_str);
        if target.item_id!=*item||xy!=&Some(*expected)||
           scan.subgrid_parents.contains(ordinal)||kind!=observed_kind||
           orientation.as_ref().is_some_and(|o|Some(o.as_str())!=observed_orientation){
            return Err(CodecError::Json);
        }
        out.push(target.clone());
    }
    Ok(out)
}

/// Inbound identity classification from the archived native grid identity
/// dependency investigation (v1.24.13): SpawnedObjects is active remap,
/// GridObjectsCollected/GridObjectIdsCollected is historical, linked entrance
/// is a cache, gardening pairs and implicit sapling links are active.
/// Re-scan the actual opened profile; a positive match never grants writes.
/// Unrecognized identity-like fields are classified conservatively.
#[derive(Default)]
pub(super) struct GridIdentityDependencies{
    pub active:usize,pub historical:usize,pub navigation:usize,pub related:usize,pub unknown:usize
}
impl GridIdentityDependencies{
    pub fn blocking(&self)->usize{self.active+self.navigation+self.related+self.unknown}
}
pub(super) fn grid_identity_dependencies(profile:&[u8],target:&GridCoordinateTarget)->Result<GridIdentityDependencies,CodecError>{
    grid_identity_dependencies_for_ids(profile,&target.grid_id,std::slice::from_ref(&target.object_id))
}
/// Same conservative reference test for many identities in one Grid and
/// one bounded scan. Aggregate hit counts are not per-object counts.
pub(super) fn grid_identity_dependencies_for_ids(profile:&[u8],grid_id:&str,ids:&[String])->Result<GridIdentityDependencies,CodecError>{
    if ids.is_empty()||ids.len()>512{return Err(CodecError::Bounds);}
    let grid=key_id(grid_id).ok_or(CodecError::Json)?;
    let objects:HashSet<u64>=ids.iter().map(|s|key_id(s).ok_or(CodecError::Json)).collect::<Result<_,_>>()?;
    if objects.len()!=ids.len(){return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let mut out=GridIdentityDependencies::default();
    // Iterative scan with explicit depth and node bounds. No private path,
    // identifier or arbitrary field name leaves the Worker.
    type Flags=(bool,bool,bool,bool);
    let mut stack=vec![(&root,(false,false,false,false),None::<u64>,0usize)];
    let mut visited=0usize;
    while let Some((v,flags,owning,depth))=stack.pop(){
        visited+=1;
        if depth>256||visited>2_000_000{return Err(CodecError::Bounds);}
        match v{
            Value::Object(o)=>{
                let normal=|s:&str|s.to_ascii_lowercase().replace('_',"");
                let mut grid_values=Vec::new();let mut object_values=Vec::new();
                for (key,value) in o{
                    let k=normal(key);
                    if k=="gridid"{grid_values.push(value.as_u64());}
                    if k=="gridobjectid"{object_values.push(value.as_u64());}
                }
                if object_values.iter().any(|v|v.is_some_and(|id|objects.contains(&id))){
                    if grid_values.iter().any(|v|*v==Some(grid)){
                        if flags.0{out.active+=1;}else if flags.1{out.historical+=1;}else if flags.2{out.navigation+=1;}else if flags.3{out.active+=1;}else{out.unknown+=1;}
                    }else if grid_values.is_empty()||grid_values.iter().any(Option::is_none){out.unknown+=1;}
                }
                for (key,value) in o{
                    let k=normal(key);
                    if k=="saplinggridobjectid"&&value.as_u64().is_some_and(|id|objects.contains(&id))&&owning.is_none_or(|g|g==grid){out.related+=1;}
                    else if k!="gridobjectid"&&k!="nextgridobjectid"&&k!="saplinggridobjectid"&&k.contains("gridobjectid")&&value.as_u64().is_some_and(|id|objects.contains(&id)){out.unknown+=1;}
                    let next=(flags.0||k=="spawnedobjects",flags.1||k=="gridobjectscollected"||k=="gridobjectidscollected",flags.2||k=="lastusedlinkedenvironmententer",flags.3||k.contains("gardeningburningstate"));
                    // Owning Grid context is recognized only for exact
                    // full/diff map key+embedded ID. Do not infer from a generic ID.
                    if k=="grids"||k=="diffgrids"{
                        if let Some(map)=value.as_object(){
                            for (id,entry) in map{
                                let context=key_id(id).filter(|n|entry.get("ID").and_then(Value::as_u64)==Some(*n));
                                stack.push((entry,next,context,depth+2));
                            }
                            continue;
                        }
                    }
                    stack.push((value,next,owning,depth+1));
                }
            },
            Value::Array(rows)=>for row in rows{stack.push((row,flags,owning,depth+1));},
            _=>{}
        }
    }
    Ok(out)
}

/// Resolve a transfer destination without exposing native Save IDs.
pub(super) fn resolve_plain_grid_destination(profile:&[u8],witness:&Value)->Result<ddv_save_patch::PlainGridDestination,CodecError>{
    let o=witness.as_object().ok_or(CodecError::Json)?;
    if o.len()!=5||o.keys().any(|k|!matches!(k.as_str(),"layoutId"|"gridDataPath"|"factor"|"sizeX"|"sizeY")){return Err(CodecError::Json);}
    let layout=o.get("layoutId").and_then(Value::as_str).filter(|s|s.len()<=512&&s.starts_with("SceneLayouts/")&&s.ends_with(".json")&&!s.contains("..")).ok_or(CodecError::Json)?;
    let data=o.get("gridDataPath").and_then(Value::as_str).filter(|s|s.len()<=512&&s.starts_with("GridData/")&&s.ends_with(".json")&&!s.contains("..")).ok_or(CodecError::Json)?;
    let num=|key:&str|o.get(key).and_then(Value::as_u64).and_then(|v|u32::try_from(v).ok()).ok_or(CodecError::Json);
    let factor=num("factor")?;let sx=num("sizeX")?;let sy=num("sizeY")?;
    if !matches!(factor,1|2)||sx==0||sy==0||sx>65536||sy>65536||u64::from(sx)*u64::from(sy)>16_777_216{return Err(CodecError::Bounds);}
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(CodecError::Json)?;
    let grids=collection.get("Grids").and_then(Value::as_object).ok_or(CodecError::Json)?;
    let mut candidates=grids.iter().filter(|(_,v)|v.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(layout)&&v.get("GridDataPath").and_then(Value::as_str)==Some(data));
    let (id,grid)=candidates.next().ok_or(CodecError::Json)?;
    if candidates.next().is_some()||valid_grid(id,grid).is_none()||
       grid.get("ID").and_then(Value::as_u64)!=key_id(id)||
       grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(factor))||
       collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(id))){
       return Err(CodecError::Json);
    }
    // A monotonic counter can still point to an address referenced outside
    // this Objects map, for example by an old collection/event record.
    // Insertion must not resurrect any observed address, even historical.
    let next=grid.get("NextGridObjectID").and_then(Value::as_u64)
        .filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(CodecError::Json)?;
    let new_target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:id.clone(),object_id:next.to_string(),item_id:0};
    let refs=grid_identity_dependencies(profile,&new_target)?;
    if refs.blocking()>0||refs.historical>0{return Err(CodecError::Json);}
    Ok(ddv_save_patch::PlainGridDestination{grid_id:id.clone(),layout_path:layout.to_owned(),data_path:data.to_owned(),tessellation:factor,size:(sx,sy)})
}

/// Resolve a cardinal orientation edit exclusively against the original,
/// locally opened Save. No native Grid/Object ID leaves this Rust module.
pub(super) fn resolve_grid_orientation_target(
    profile:&[u8],ordinal:usize,expected_item:u64,
    expected:(i32,i32),record_kind:&str,orientation:&str
)->Result<GridCoordinateTarget,CodecError>{
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0||ordinal==0||ordinal>MAX_ROWS{
        return Err(CodecError::Json);
    }
    let (target,xy)=scan.private_targets.get(ordinal-1)
        .ok_or(CodecError::Json)?;
    let row=scan.rows.get(ordinal-1).ok_or(CodecError::Json)?;
    let kind=match target.kind{
        GridObjectKind::Full=>"full",
        GridObjectKind::DiffModified=>"diff_modified"
    };
    if target.item_id!=expected_item||xy!=&Some(expected)||
       kind!=record_kind||
       row.get("orientation").and_then(Value::as_str)!=Some(orientation){
        return Err(CodecError::Json);
    }
    Ok(target.clone())
}

pub(super) fn saved_grid_instances_json(source:&[u8])->Result<String,CodecError>{
    let (scan,status)=scan_grid_instances(source)?;
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.grid-instance-preview@2",
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

/// DB-05 × DB-04 read-only, *per-ephemeral-ordinal* source reference
/// annotation. This is never a saved Grid identity join, placement bound,
/// occupancy permission or source hash equivalence. Save dictionary IDs and
/// source paths must not cross this Rust/WASM output boundary.
pub(super) fn saved_db04_object_source_context_json(
    profile:&[u8],witness:&str
)->Result<String,CodecError>{
    saved_db04_source_projection(profile,witness,false)
}
/// One local Save scan for all public source Grid witnesses. Only ephemeral
/// ordinals and public witness indices leave this function. Native GetFloorType
/// divides the saved position by TessellationFactor; Contains rejects negatives
/// and coordinates >= source dimensions * factor. The pinned Grid constructor
/// initializes an omitted TessellationFactor to 1.
pub(super) fn saved_db04_terrain_session_json(
    profile:&[u8],witness:&str
)->Result<String,CodecError>{
    saved_db04_source_projection(profile,witness,true)
}
// Never expose private Grid keys. A resolved full child is a structural
// reference, not proof of support height or world-space transforms.
fn local_subgrid_summary(collection:Option<&Map<String,Value>>,parent:Option<&Map<String,Value>>,object_key:&str,parent_grid_key:&str)->Option<Value>{
    let sub=parent?.get("Objects")?.get(object_key)?.get("State")?.get("SubGrid")?;
    let unknown=||serde_json::json!({"status":"unresolved","objectCount":null});
    let Some(id)=sub.get("GridID").and_then(Value::as_u64) else{return Some(unknown());};
    let key=id.to_string();
    if key==parent_grid_key{return Some(unknown());}
    let Some(c)=collection else{return Some(unknown());};
    if c.get("DiffGrids").and_then(|v|v.get(&key)).is_some(){return Some(unknown());}
    let Some(grid)=c.get("Grids").and_then(|v|v.get(&key)).and_then(|v|valid_grid(&key,v)) else{return Some(unknown());};
    let count=match grid.get("Objects"){
        None=>0,
        Some(v)=>match v.as_object(){Some(o)=>o.len(),None=>return Some(unknown())}
    };
    Some(serde_json::json!({"status":"resolved_full","objectCount":count}))
}
/// Exact child ownership, no guessed child-to-parent transform. The
/// receipt contains only local item geometry inputs, never native keys.
fn subgrid_tree(collection:&Map<String,Value>,parent_grid:&str,parent_object:&str)->Result<Value,CodecError>{
 let bad=CodecError::Json;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 let diff=collection.get("DiffGrids").map(|v|v.as_object().ok_or(bad)).transpose()?;
 let mut owners=HashMap::<String,Vec<(String,String)>>::new();
 let mut scanned=0usize;
 for (scope,object_key) in [(Some(grids),"Objects"),(diff,"ModifiedObjects")]{
  if let Some(scope)=scope{for (g,v) in scope{
   if let Some(objects)=v.get(object_key).and_then(Value::as_object){for (o,value) in objects{
    scanned+=1;if scanned>MAX_SCANNED_OBJECTS{return Err(CodecError::Bounds);}
    if let Some(id)=value.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(Value::as_u64){
     owners.entry(id.to_string()).or_default().push((g.clone(),o.clone()));
    }
   }}
  }}
 }
 fn visit(grids:&Map<String,Value>,diff:Option<&Map<String,Value>>,owners:&HashMap<String,Vec<(String,String)>>,parent_grid:&str,parent_object:&str,seen:&mut HashSet<String>,count:&mut usize,depth:usize)->Result<Value,CodecError>{
  let bad=CodecError::Json;if depth>8{return Err(CodecError::Bounds);}
  let parent=grids.get(parent_grid).and_then(|g|g.get("Objects")).and_then(|o|o.get(parent_object)).ok_or(bad)?;
  let child=parent.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(Value::as_u64).filter(|n|*n>0).ok_or(bad)?.to_string();
  if !seen.insert(child.clone())||diff.is_some_and(|d|d.contains_key(&child))||owners.get(&child).is_none_or(|o|o.len()!=1||o[0].0!=parent_grid||o[0].1!=parent_object){return Err(bad);}
  let g=grids.get(&child).and_then(|v|valid_grid(&child,v)).ok_or(bad)?;
  if g.get("ID").and_then(Value::as_u64)!=key_id(&child){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)?;
  let empty=Map::new();let objects=g.get("Objects").map_or(Some(&empty),Value::as_object).ok_or(bad)?;
  let mut rows=Vec::new();
  for (key,v) in objects{
   *count+=1;if *count>512{return Err(CodecError::Bounds);}
   let obj=v.as_object().ok_or(bad)?;
   if obj.get("ID").and_then(Value::as_u64)!=key_id(key){return Err(bad);}
   let item=obj.get("ItemID").and_then(Value::as_u64).filter(|n|*n>0&&*n<=u32::MAX as u64).ok_or(bad)?;
   let (x,y)=observed_coordinates(obj).ok_or(bad)?;
   let orientation=observed_orientation(obj).ok_or(bad)?;
   let nested=if obj.get("State").and_then(|s|s.get("SubGrid")).is_some(){visit(grids,diff,owners,&child,key,seen,count,depth+1)?}else{Value::Null};
   rows.push(serde_json::json!({"itemId":item,"x":x,"y":y,"orientation":orientation,"child":nested}));
  }
  let path=g.get("GridDataPath").and_then(Value::as_str).filter(|p|p.starts_with("GridData/Furniture/")&&p.ends_with(".json")&&p.len()<=512&&!p.contains("..")&&!p.contains('\\')&&!p.chars().any(char::is_control));
  Ok(serde_json::json!({"factor":factor,"objects":rows,"sourcePath":path}))
 }
 let mut seen=HashSet::from([parent_grid.to_owned()]);let mut count=0;
 visit(grids,diff,&owners,parent_grid,parent_object,&mut seen,&mut count,0)
}
pub(super) fn inspect_subgrid_json(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32))->Result<String,CodecError>{
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0||ordinal==0{return Err(CodecError::Json);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(CodecError::Json)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(CodecError::Json);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(CodecError::Json)?;
 let tree=subgrid_tree(c,&target.grid_id,&target.object_id)?;
 serde_json::to_string(&serde_json::json!({"contract":"wand.world.subgrid-local@1","tree":tree,"worldTransformVerified":false})).map_err(|_|CodecError::Json)
}
/// Existing child cells only; UI separately establishes identical source
/// footprint and mask. Never infer bounds from occupied extent.
pub(super) fn support_child_candidate(profile:&[u8],plan:&Value)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let bad=CodecError::Json;
 let o=plan.as_object().filter(|o|(6..=7).contains(&o.len())&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"path"|"edits"|"terrainPath"|"stock"|"transfer"))&&["edits","stock","transfer"].iter().filter(|k|o.contains_key(**k)).count()==1).ok_or(bad)?;
 let int=|v:&Value,k:&str|v.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
 let item=o.get("itemId").and_then(Value::as_u64).ok_or(bad)?;
 let expected=(int(plan,"expectedX")?,int(plan,"expectedY")?);
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(bad);}
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 subgrid_tree(c,&target.grid_id,&target.object_id)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 let path=o.get("path").and_then(Value::as_array).filter(|a|a.len()<=8).ok_or(bad)?;
 let mut gid=target.grid_id.clone();let mut oid=target.object_id.clone();
 let child=|g:&str,o:&str|grids.get(g).and_then(|v|v.get("Objects")).and_then(|v|v.get(o)).and_then(|v|v.get("State")).and_then(|v|v.get("SubGrid")).and_then(|v|v.get("GridID")).and_then(Value::as_u64).map(|v|v.to_string()).ok_or(bad);
 for index in path{
  gid=child(&gid,&oid)?;
  let i=index.as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
  oid=grids.get(&gid).and_then(|g|g.get("Objects")).and_then(Value::as_object).and_then(|m|m.keys().nth(i)).cloned().ok_or(bad)?;
 }
 gid=child(&gid,&oid)?;
 let objects=grids.get(&gid).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 if let Some(transfer)=o.get("transfer"){
  if o.contains_key("terrainPath"){return Err(bad);}
  let row=transfer.as_object().filter(|r|r.len()==9&&r.keys().all(|k|matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let index=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
  let (key,v)=objects.iter().nth(index).ok_or(bad)?;
  let id=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let expected=(int(transfer,"expectedX")?,int(transfer,"expectedY")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
  if v.get("ItemID").and_then(Value::as_u64)!=Some(id)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(expected)||v.get("Orientation").and_then(Value::as_str)!=Some(old)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||objects.values().filter(|o|o.as_object().and_then(observed_coordinates)==Some(expected)).count()!=1{return Err(bad);}
  let dest=row.get("destination").and_then(Value::as_object).filter(|d|d.len()==5&&d.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"terrainPath"))).ok_or(bad)?;
  let dord=dest.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&*n!=ordinal).ok_or(bad)?;
  let ditem=dest.get("itemId").and_then(Value::as_u64).ok_or(bad)?;
  let dvalue=row.get("destination").ok_or(bad)?;
  let (dt,dxy)=scan.private_targets.get(dord-1).ok_or(bad)?;
  if dt.kind!=GridObjectKind::Full||dt.item_id!=ditem||*dxy!=Some((int(dvalue,"expectedX")?,int(dvalue,"expectedY")?))||!scan.subgrid_parents.contains(&dord){return Err(bad);}
  subgrid_tree(c,&dt.grid_id,&dt.object_id)?;
  let to=child(&dt.grid_id,&dt.object_id)?;
  if gid==to{return Err(bad);}
  let g=grids.get(&to).ok_or(bad)?;
  let path=dest.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path)||g.get("Objects").and_then(Value::as_object).is_none_or(|m|m.len()>=512){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let cells=entry[4].as_array().filter(|a|a.len()==(sx*sy) as usize).ok_or(bad)?;
  let (x,y)=(int(transfer,"x")?,int(transfer,"y")?);
  if x<0||y<0||x as u32>=sx*factor||y as u32>=sy*factor||cells[((y as u32/factor)*sx+x as u32/factor) as usize].as_u64().is_none_or(|n|n==0){return Err(bad);}
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  let next=g.get("NextGridObjectID").and_then(Value::as_u64).filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
  let source_refs=grid_identity_dependencies_for_ids(profile,&gid,&[key.clone()])?;
  let dest_refs=grid_identity_dependencies_for_ids(profile,&to,&[next.to_string()])?;
  if source_refs.blocking()>0||dest_refs.blocking()>0||dest_refs.historical>0{return Err(bad);}
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid,object_id:key.clone(),item_id:id};
  let d=ddv_save_patch::PlainGridDestination{grid_id:to,layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
  return ddv_save_patch::preview_support_grid_transfer(std::str::from_utf8(profile).map_err(|_|bad)?,&target,expected,&d,(x,y),orientation).map_err(|_|CodecError::Patch);
 }
 if let Some(stock)=o.get("stock"){
  let row=stock.as_object().ok_or(bad)?;
  let action=row.get("action").and_then(Value::as_str).ok_or(bad)?;
  let id=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let amount=row.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  let source=std::str::from_utf8(profile).map_err(|_|bad)?;
  if action=="pickup"{
   if row.len()!=7||o.contains_key("terrainPath")||row.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"index"|"expectedX"|"expectedY"|"expectedOrientation")){return Err(bad);}
   let i=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
   let (key,v)=objects.iter().nth(i).ok_or(bad)?;
   let expected=(int(stock,"expectedX")?,int(stock,"expectedY")?);
   if v.get("ItemID").and_then(Value::as_u64)!=Some(id)||v.get("Orientation").and_then(Value::as_str)!=row.get("expectedOrientation").and_then(Value::as_str)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(expected){return Err(bad);}
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:id};
   if grid_identity_dependencies_for_ids(profile,&gid,&[key.clone()])?.blocking()>0{return Err(bad);}
   return ddv_save_patch::preview_furniture_stock_transaction(source,amount,ddv_save_patch::FurnitureStockAction::Pickup{target:&target,expected}).map_err(|_|CodecError::Patch);
  }
  if action!="place"||row.len()!=6||row.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"x"|"y"|"orientation"))||amount==0{return Err(bad);}
  let path=o.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
  let g=grids.get(&gid).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path)||objects.len()>=512{return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let cells=entry[4].as_array().filter(|a|a.len()==(sx*sy) as usize).ok_or(bad)?;
  let (x,y)=(int(stock,"x")?,int(stock,"y")?);
  if x<0||y<0||x as u32>=sx*factor||y as u32>=sy*factor||cells[((y as u32/factor)*sx+x as u32/factor) as usize].as_u64().is_none_or(|n|n==0){return Err(bad);}
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  let next=g.get("NextGridObjectID").and_then(Value::as_u64).filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
  let refs=grid_identity_dependencies_for_ids(profile,&gid,&[next.to_string()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid,layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
  return ddv_save_patch::preview_support_grid_stock_place(source,&d,id,(x,y),orientation,amount).map_err(|_|CodecError::Patch);
 }
 let edits=o.get("edits").and_then(Value::as_array).filter(|a|matches!(a.len(),1|2)).ok_or(bad)?;
 let swap=edits.len()==2;
 let mut terrain=None;
 if let Some(path)=o.get("terrainPath"){
  if swap{return Err(bad);}
  let path=path.as_str().ok_or(bad)?;let g=grids.get(&gid).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as usize;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let row=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=row[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;let sy=row[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;
  let cells=row[4].as_array().filter(|a|a.len()==sx*sy).ok_or(bad)?.clone();terrain=Some((sx,sy,factor,cells));
 }
 let mut seen=HashSet::new();let mut result=Vec::new();let mut ids=Vec::new();
 for e in edits{
  let row=e.as_object().filter(|r|r.len()==8&&r.keys().all(|k|matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let i=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512&&seen.insert(*n)).ok_or(bad)?;
  let (id,v)=objects.iter().nth(i).ok_or(bad)?;let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400).ok_or(bad)?;
  let before=(int(e,"expectedX")?,int(e,"expectedY")?);let after=(int(e,"x")?,int(e,"y")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;let new=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if v.get("ItemID").and_then(Value::as_u64)!=Some(item)||v.get("ID").and_then(Value::as_u64)!=key_id(id)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(before)||v.get("Orientation").and_then(Value::as_str)!=Some(old)||
     v.get("State").is_some_and(|s|!s.is_null())||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
     !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&old)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&new)||
     if swap{before==after||old!=new}else if terrain.is_some(){before==after&&old==new}else{before!=after||old==new}{return Err(bad);}
  if let Some((sx,sy,factor,cells))=&terrain{
   let valid=|(x,y):(i32,i32)|x>=0&&y>=0&&(x as usize)/ *factor<*sx&&(y as usize)/ *factor<*sy&&cells[(y as usize)/ *factor* *sx+(x as usize)/ *factor].as_u64().is_some_and(|n|n!=0);
   if !valid(before)||!valid(after)||objects.iter().any(|(other,o)|other!=id&&o.as_object().and_then(observed_coordinates)==Some(after)){return Err(bad);}
  }
  if objects.values().filter(|o|o.as_object().and_then(observed_coordinates)==Some(before)).count()!=1{return Err(bad);}
  ids.push(id.clone());
  result.push(ddv_save_patch::GridMixedEdit{target:GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:id.clone(),item_id:item},expected:before,position:(before!=after).then_some(after),orientation:(old!=new).then(||(old.to_owned(),new.to_owned()))});
 }
 if swap&&(result[0].position!=Some(result[1].expected)||result[1].position!=Some(result[0].expected)){return Err(bad);}
 if grid_identity_dependencies_for_ids(profile,&gid,&ids)?.blocking()>0{return Err(bad);}
 ddv_save_patch::preview_existing_grid_mixed_batch(std::str::from_utf8(profile).map_err(|_|bad)?,&result).map_err(|_|CodecError::Patch)
}
/// Test-only parent transform. Child grids and the exact State remain unchanged.
pub(super) fn support_parent_move_candidate(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let bad=CodecError::Json;
 if ordinal==0||item/100_000!=400||expected==replacement&&turn.is_none()&&source_witness.is_none(){return Err(bad);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(bad);}
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 let dest=resolve_plain_grid_destination(profile,witness)?;
 let cross=dest.grid_id!=target.grid_id;
 let source=if cross{let src=resolve_plain_grid_destination(profile,source_witness.ok_or(bad)?)?;if src.grid_id!=target.grid_id||src.tessellation!=dest.tessellation{return Err(bad);}src}else{if source_witness.is_some(){return Err(bad);}dest.clone()};
 let valid=|d:&ddv_save_patch::PlainGridDestination,(x,y):(i32,i32)|x>=0&&y>=0&&(x as u32)<d.size.0*d.tessellation&&(y as u32)<d.size.1*d.tessellation;
 if !valid(&source,expected)||!valid(&dest,replacement){return Err(bad);}
 let obj=c.get("Grids").and_then(|g|g.get(&target.grid_id)).and_then(|g|g.get("Objects")).and_then(|o|o.get(&target.object_id)).ok_or(bad)?;
 if obj.get("ID").and_then(Value::as_u64)!=key_id(&target.object_id)||obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
    obj.get("State").and_then(Value::as_object).is_none_or(|s|s.len()!=1||!s.contains_key("SubGrid"))||
    obj.get("Orientation").and_then(Value::as_str).is_none_or(|o|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&o)){return Err(bad);}
 let tree=subgrid_tree(c,&target.grid_id,&target.object_id)?;
 let refs=grid_identity_dependencies(profile,target)?;
 if refs.blocking()>0||cross&&refs.historical>0{return Err(bad);}
 let old=obj.get("Orientation").and_then(Value::as_str).ok_or(bad)?;
 let new=if let Some((before,after))=turn{if before!=old||before==after||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&after){return Err(bad);}after}else{old};
 let json=std::str::from_utf8(profile).map_err(|_|bad)?;
 let draft=if cross{
  let next=c.get("Grids").and_then(|g|g.get(&dest.grid_id)).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
  let d=ddv_save_patch::preview_support_parent_grid_transfer(json,target,expected,&dest,replacement,new).map_err(|_|CodecError::Patch)?;
  let parsed:Value=serde_json::from_str(&d.patched_json).map_err(|_|bad)?;
  let next_collection=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
  if subgrid_tree(next_collection,&dest.grid_id,&next)?!=tree{return Err(bad);}
  d
 }else{ddv_save_patch::preview_existing_grid_mixed_batch(json,&[ddv_save_patch::GridMixedEdit{target:target.clone(),expected,position:(expected!=replacement).then_some(replacement),orientation:turn.map(|(a,b)|(a.to_owned(),b.to_owned()))}]).map_err(|_|CodecError::Patch)?};
 if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{return Err(bad);}
 Ok(draft)
}
fn saved_db04_source_projection(
    profile:&[u8],witness:&str,terrain_session:bool
)->Result<String,CodecError>{
    if witness.is_empty()||witness.len()>16*1024*1024{
        return Err(CodecError::Bounds);
    }
    let verified:Value=serde_json::from_str(witness).map_err(|_|CodecError::Json)?;
    let contract=verified.as_object().ok_or(CodecError::Json)?;
    if contract.len()!=2||
       contract.get("contract").and_then(Value::as_str)
           !=Some("wand.db05.db04-object-source-witness@1"){
        return Err(CodecError::Json);
    }
    let refs=contract.get("gridRefs").and_then(Value::as_array)
        .ok_or(CodecError::Json)?;
    if refs.len()>20000{return Err(CodecError::Bounds);}
    #[derive(Clone)]
    struct SourceRef{
        layout:String,
        data:String,
        native_id:u32,
        size:Option<(u32,u32)>,
        tessellation:Option<u32>
    }
    let valid_path=|p:&str,prefix:&str|{
        p.len()>prefix.len()+5&&p.len()<=512&&
        p.starts_with(prefix)&&p.ends_with(".json")&&
        !p.contains("..")&&!p.contains('\\')&&
        !p.chars().any(char::is_control)
    };
    let mut sources=Vec::<SourceRef>::with_capacity(refs.len());
    let mut ids=HashSet::new();
    for value in refs{
        let row=value.as_object().ok_or(CodecError::Json)?;
        if row.len()!=6||![
            "layoutId","gridDataPath","nativeGridId",
            "nativeSizeX","nativeSizeY","tessellationFactor"
        ].iter().all(|key|row.contains_key(*key)){
            return Err(CodecError::Json);
        }
        let layout=row.get("layoutId").and_then(Value::as_str)
            .ok_or(CodecError::Json)?;
        let data=row.get("gridDataPath").and_then(Value::as_str)
            .ok_or(CodecError::Json)?;
        let native_id=row.get("nativeGridId").and_then(Value::as_u64)
            .and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
        if !valid_path(layout,"SceneLayouts/")||
           !valid_path(data,"GridData/")||
           !ids.insert((layout.to_owned(),native_id)){
            return Err(CodecError::Json);
        }
        let bounds=|key:&str,max:u32|->Result<Option<u32>,CodecError>{
            match row.get(key){
                Some(Value::Null)=>Ok(None),
                Some(v)=>v.as_u64()
                    .and_then(|n|u32::try_from(n).ok())
                    .filter(|n|*n>0&&*n<=max)
                    .map(Some).ok_or(CodecError::Json),
                None=>Err(CodecError::Json)
            }
        };
        let x=bounds("nativeSizeX",65536)?;
        let y=bounds("nativeSizeY",65536)?;
        if x.is_some()!=y.is_some()||
           x.zip(y).is_some_and(|(sx,sy)|u64::from(sx)*u64::from(sy)>16_777_216){
            return Err(CodecError::Json);
        }
        let tessellation=match row.get("tessellationFactor"){
            Some(Value::Null)=>None,
            Some(v)=>Some(v.as_u64()
                .and_then(|n|u32::try_from(n).ok())
                .filter(|n|*n<=256).ok_or(CodecError::Json)?),
            None=>return Err(CodecError::Json)
        };
        sources.push(SourceRef{
            layout:layout.to_owned(),data:data.to_owned(),native_id,
            size:x.zip(y),tessellation
        });
    }
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection"))
        .and_then(Value::as_object);
    let mut out=Vec::with_capacity(scan.private_targets.len());
    let mut bindings=Vec::new();
    for (i,(target,xy)) in scan.private_targets.iter().enumerate(){
        let scope=match target.kind{
            GridObjectKind::Full=>"Grids",
            GridObjectKind::DiffModified=>"DiffGrids"
        };
        let grid=collection.and_then(|c|c.get(scope))
            .and_then(|v|v.get(&target.grid_id))
            .and_then(Value::as_object);
        let layout=grid.and_then(|g|g.get("GridDefaultLayoutPath"))
            .and_then(Value::as_str);
        let data=grid.and_then(|g|g.get("GridDataPath"))
            .and_then(Value::as_str);
        let diff_id=grid.and_then(|g|g.get("DefaultLayoutGridID"))
            .and_then(Value::as_u64)
            .and_then(|n|u32::try_from(n).ok());
        let diff_type=grid.and_then(|g|g.get("GridDefaultLayoutType"))
            .and_then(Value::as_str);
        let hash=|name:&str|->bool{
            grid.and_then(|g|g.get(name)).and_then(Value::as_i64)
                .is_some_and(|v|v>=i32::MIN as i64&&v<=i32::MAX as i64)
        };
        let metadata_valid=match target.kind{
            GridObjectKind::Full=>
                layout.is_some_and(|v|valid_path(v,"SceneLayouts/"))&&
                data.is_some_and(|v|valid_path(v,"GridData/")),
            GridObjectKind::DiffModified=>
                layout.is_some_and(|v|valid_path(v,"SceneLayouts/"))&&
                diff_id.is_some()&&
                diff_type.is_some_and(|v|matches!(v,
                    "Meta.GridCollection, Meta"|
                    "Meta.DefaultRealmData, Meta"|
                    "Meta.DefaultOffGridBuildingData, Meta"))&&
                hash("DefaultGridHashCode")&&hash("DefaultGridDataHashCode")
        };
        let matches=sources.iter().filter(|ref_row|metadata_valid&&
            layout==Some(ref_row.layout.as_str())&&match target.kind{
                GridObjectKind::Full=>data==Some(ref_row.data.as_str()),
                GridObjectKind::DiffModified=>diff_id==Some(ref_row.native_id)
            }).collect::<Vec<_>>();
        let status=if !metadata_valid{
            "saved_grid_source_unavailable"
        }else if matches.is_empty(){
            "not_in_partial_source"
        }else if matches.len()>1{
            "ambiguous_source_candidates"
        }else if matches!(target.kind,GridObjectKind::DiffModified){
            "diff_structural_candidate_hash_unverified"
        }else{
            "full_exact_source_path_candidate"
        };
        let unique=if matches.len()==1{Some(matches[0])}else{None};
        let dimensions=unique.and_then(|r|r.size);
        if terrain_session{
            // Only FULL grids with a unique exact path pair and matching
            // factor are eligible for source-local terrain projection.
            // Diff records do not imply reconstructed effective placement.
            if status=="full_exact_source_path_candidate"{
                if let Some(source)=unique{
                    let witness_index=sources.iter().position(|r|std::ptr::eq(r,source))
                        .ok_or(CodecError::Json)?;
                    let factor=match grid.and_then(|g|g.get("TessellationFactor")){
                        None=>Some(1u32), // native constructor default
                        Some(v)=>v.as_u64().and_then(|v|u32::try_from(v).ok())
                    };
                    let aligned=matches!(factor,Some(1|2))&&factor==source.tessellation&&source.size.is_some();
                    bindings.push(serde_json::json!({
                        "localOrdinal":i+1,
                        "sourceRefIndex":witness_index,
                        "savedFactor":factor,
                        "sourceLocalCoordinateMappingVerified":aligned,
                        "subgrid":local_subgrid_summary(collection,grid,&target.object_id,&target.grid_id)
                    }));
                }
            }
            continue;
        }
        // This does NOT assert that Save coordinates equal native source
        // anchor coordinates. A point can numerically fall within/outside
        // a source envelope even when the coordinate spaces are unrelated.
        // Steam 1.26.2 source anchor-domain evidence has established only
        // factor=2 and only the original initial-anchor integer envelope.
        // DiffGrid hashes/identity remain unverified even if unique.
        let source_anchor_envelope=if
            status=="full_exact_source_path_candidate"&&
            unique.is_some_and(|r|r.tessellation==Some(2))&&
            xy.is_some(){
                dimensions.map(|(sx,sy)|(
                    u64::from(sx)*2,u64::from(sy)*2
                ))
            }else{None};
        let numeric_relation=match (source_anchor_envelope,xy){
            (Some((sx,sy)),Some((x,y))) if *x>=0&&*y>=0&&
                (*x as u64)<sx&&(*y as u64)<sy=>
                "within_source_anchor_numeric_envelope",
            (Some(_),Some(_))=>"outside_source_anchor_numeric_envelope",
            _=>"not_comparable"
        };
        out.push(serde_json::json!({
            "localOrdinal":i+1,
            "sourceStatus":status,
            "candidateCount":matches.len(),
            "nativeSizeX":dimensions.map(|p|p.0),
            "nativeSizeY":dimensions.map(|p|p.1),
            "tessellationFactor":unique.and_then(|r|r.tessellation),
            "sourceAnchorEnvelopeWidth":source_anchor_envelope.map(|p|p.0),
            "sourceAnchorEnvelopeHeight":source_anchor_envelope.map(|p|p.1),
            "savedPositionNumericRelation":numeric_relation
        }));
    }
    if terrain_session{
        return serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.db04-terrain-session@1",
            "rows":scan.rows,
            "bindings":bindings,
            "sourceCoverageComplete":false,
            "effectivePlacementVerified":false,
            "worldCoordinatesVerified":false,
            "placementLegalityVerified":false,
            "saveWritingAuthorized":false
        })).map_err(|_|CodecError::Json);
    }
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.db04-grid-object-source-context@2",
        "rows":out,
        "savedSourceCoordinateEquivalenceVerified":false,
        "sourceCoverageComplete":false,
        "sourceArchiveRechecked":false,
        "savedGridIdentityVerified":false,
        "worldCoordinateTransformVerified":false,
        "placementLegalityVerified":false,
        "editPermissionAuthorized":false
    })).map_err(|_|CodecError::Json)
}

/// All group ordinals resolve against the same immutable original. Only
/// ordinary leaf furniture with exact poses and existing stock routes can
/// be removed. A failed member discards the entire candidate.
pub(super) fn group_pickup_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    use ddv_save_patch::{FurnitureStockAction,preview_furniture_stock_transaction};
    use zeroize::{Zeroize,Zeroizing};
    if plan.len()>16384{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(CodecError::Json);}
    let rows:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
    let rows=rows.as_array().filter(|a|a.len()>=2&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(CodecError::Bounds)?;
    let mut selections=Vec::with_capacity(rows.len());
    for v in rows{
        let o=v.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"))).ok_or(CodecError::Json)?;
        let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(CodecError::Json)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(CodecError::Json)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(CodecError::Json);
        let orientation=o.get("expectedOrientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(CodecError::Json)?;
        selections.push((ordinal,item,(int("expectedX")?,int("expectedY")?),"full".to_owned(),Some(orientation.to_owned())));
    }
    let targets=resolve_grid_mixed_targets(profile,&selections)?;
    let mut by_grid=HashMap::<String,Vec<String>>::new();
    for t in &targets{by_grid.entry(t.grid_id.clone()).or_default().push(t.object_id.clone());}
    for (grid,ids) in by_grid{
        if grid_identity_dependencies_for_ids(profile,&grid,&ids)?.blocking()>0{return Err(CodecError::Json);}
    }
    let inventory=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(|m|m.get("0")).and_then(|r|r.get("Inventory")).and_then(Value::as_object).ok_or(CodecError::Json)?;
    let mut stock=HashMap::<u64,u32>::new();
    for t in &targets{
        if stock.contains_key(&t.item_id){continue;}
        let amount=inventory.get(&t.item_id.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
        stock.insert(t.item_id,amount);
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|CodecError::Json)?.to_owned());
    for (target,selection) in targets.iter().zip(&selections){
        let amount=stock.get_mut(&target.item_id).ok_or(CodecError::Json)?;
        let next=amount.checked_add(1).filter(|n|*n<=i32::MAX as u32).ok_or(CodecError::Bounds)?;
        let mut draft=preview_furniture_stock_transaction(&working,*amount,FurnitureStockAction::Pickup{target,expected:selection.2}).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{
            draft.patched_json.zeroize();return Err(CodecError::Patch);
        }
        working.zeroize();*working=draft.patched_json;*amount=next;
    }
    Ok(std::mem::take(&mut *working))
}

/// Place a clipboard group atomically. All destinations, new identities and
/// stock requirements resolve on the immutable source before staging.
pub(super) fn group_paste_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    use ddv_save_patch::{PlainGridDestination,FurnitureStockAction,preview_furniture_stock_transaction};
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    if plan.len()>32768{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
    let rows=value.as_array().filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(bad)?;
    let grids=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(Value::as_object).ok_or(bad)?;
    let inventory=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(|m|m.get("0")).and_then(|r|r.get("Inventory")).and_then(Value::as_object).ok_or(bad)?;
    let mut destinations=HashMap::<String,PlainGridDestination>::new();
    let mut poses=Vec::new();let mut anchors=HashSet::new();let mut count_by_grid=HashMap::<String,u64>::new();let mut counts=HashMap::<u64,(u32,u32)>::new();
    for row in rows{
        let o=row.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"destination"|"itemId"|"x"|"y"|"orientation"))).ok_or(bad)?;
        let witness=o.get("destination").ok_or(bad)?;let key=witness.to_string();
        if !destinations.contains_key(&key){destinations.insert(key.clone(),resolve_plain_grid_destination(profile,witness)?);}
        let d=destinations.get(&key).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let (x,y)=(int("x")?,int("y")?);
        let orientation=o.get("orientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
        if x<0||y<0||x as u32>=d.size.0*d.tessellation||y as u32>=d.size.1*d.tessellation||!anchors.insert((d.grid_id.clone(),x,y)){return Err(bad);}
        let grid=grids.get(&d.grid_id).ok_or(bad)?;
        let objects=grid.get("Objects").and_then(Value::as_object).ok_or(bad)?;
        // Ground paths may remain under furniture. Do not silently stack new
        // ordinary furniture on another non-ground anchor.
        if objects.values().any(|v|v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(x))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(y))){return Err(bad);}
        *count_by_grid.entry(d.grid_id.clone()).or_default()+=1;
        let stock=inventory.get(&item.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
        let c=counts.entry(item).or_insert((stock,0));c.1+=1;if c.1>c.0{return Err(bad);}
        poses.push((key,item,(x,y),orientation.to_owned()));
    }
    for (grid,count) in count_by_grid{
        let next=grids.get(&grid).and_then(|v|v.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?;
        let ids=(0..count).map(|offset|next.checked_add(offset).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
        let refs=grid_identity_dependencies_for_ids(profile,&grid,&ids)?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    for (key,item,xy,orientation) in poses{
        let amount=&mut counts.get_mut(&item).ok_or(bad)?.0;
        let mut draft=preview_furniture_stock_transaction(&working,*amount,FurnitureStockAction::Place{destination:destinations.get(&key).ok_or(bad)?,item_id:item,xy,orientation:&orientation}).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        working.zeroize();*working=draft.patched_json;*amount-=1;
    }
    Ok(std::mem::take(&mut *working))
}

/// Cut is a deferred relocation: no stock changes, no intermediate Save
/// output. Same-grid objects retain their native identities; cross-grid
/// ordinary leaves require unreferenced old and newly allocated identities.
pub(super) fn group_cut_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    use ddv_save_patch::{PlainGridDestination,GridMixedEdit,preview_existing_grid_mixed_batch,preview_plain_world_transfer};
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    if plan.len()>65536{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
    let rows=value.as_array().filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(bad)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(bad)?;
    let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
    let mut selections=Vec::with_capacity(rows.len());
    let mut destinations=HashMap::<String,PlainGridDestination>::new();
    let mut poses=Vec::with_capacity(rows.len());
    let mut anchors=HashSet::new();
    for row in rows{
        let o=row.as_object().filter(|o|o.len()==9&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"))).ok_or(bad)?;
        let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let orientation=|k:&str|o.get(k).and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).map(str::to_owned).ok_or(bad);
        selections.push((ordinal,item,(int("expectedX")?,int("expectedY")?),"full".to_owned(),Some(orientation("expectedOrientation")?)));
        let witness=o.get("destination").ok_or(bad)?;let key=witness.to_string();
        if !destinations.contains_key(&key){destinations.insert(key.clone(),resolve_plain_grid_destination(profile,witness)?);}
        let d=destinations.get(&key).ok_or(bad)?;
        let xy=(int("x")?,int("y")?);
        if xy.0<0||xy.1<0||xy.0 as u32>=d.size.0*d.tessellation||xy.1 as u32>=d.size.1*d.tessellation||!anchors.insert((d.grid_id.clone(),xy)){return Err(bad);}
        poses.push((key,xy,orientation("orientation")?));
    }
    let targets=resolve_grid_mixed_targets(profile,&selections)?;
    let selected:HashSet<_>=targets.iter().map(|t|(t.grid_id.clone(),t.object_id.clone())).collect();
    let mut new_counts=HashMap::<String,u64>::new();
    let mut old_refs=HashMap::<String,Vec<String>>::new();
    let mut same=Vec::new();
    let mut cross=Vec::new();
    for ((target,selection),(key,xy,orientation)) in targets.iter().zip(&selections).zip(&poses){
        let source=grids.get(&target.grid_id).ok_or(bad)?;
        let layout=source.get("GridDefaultLayoutPath").and_then(Value::as_str).ok_or(bad)?;
        let data=source.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?;
        let d=destinations.get(key).ok_or(bad)?;
        let scope=|s:&str|s.strip_prefix("SceneLayouts/").and_then(|s|s.split('/').next()).map(str::to_owned);
        if scope(layout).is_none()||scope(&d.layout_path).is_none()||!data.starts_with("GridData/")||
           source.get("ID").and_then(Value::as_u64)!=key_id(&target.grid_id)||
           collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&target.grid_id)))||
           grids.values().filter(|g|g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(layout)&&g.get("GridDataPath").and_then(Value::as_str)==Some(data)).count()!=1{return Err(bad);}
        let old=source.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(Value::as_object).ok_or(bad)?;
        if !matches!(old.len(),5|6)||old.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
           old.get("State").is_some_and(|v|!v.is_null())||old.get("ID").and_then(Value::as_u64)!=key_id(&target.object_id){return Err(bad);}
        let occupied=grids.get(&d.grid_id).and_then(|v|v.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
        if occupied.iter().any(|(id,v)|!selected.contains(&(d.grid_id.clone(),id.clone()))&&v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(bad);}
        let before=selection.4.as_ref().ok_or(bad)?;
        if target.grid_id==d.grid_id{
            if *xy!=selection.2||before!=orientation{
                same.push(GridMixedEdit{target:target.clone(),expected:selection.2,position:(*xy!=selection.2).then_some(*xy),orientation:(before!=orientation).then(||(before.clone(),orientation.clone()))});
            }
        }else{
            *new_counts.entry(d.grid_id.clone()).or_default()+=1;
            old_refs.entry(target.grid_id.clone()).or_default().push(target.object_id.clone());
            cross.push((target,selection.2,d,*xy,orientation));
        }
    }
    if same.is_empty()&&cross.is_empty(){return Err(bad);}
    for (grid,ids) in old_refs{
        let refs=grid_identity_dependencies_for_ids(profile,&grid,&ids)?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
    }
    for (grid,count) in new_counts{
        let next=grids.get(&grid).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?;
        let ids=(0..count).map(|offset|next.checked_add(offset).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
        let refs=grid_identity_dependencies_for_ids(profile,&grid,&ids)?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    let update=|working:&mut Zeroizing<String>,mut draft:ddv_save_patch::GridCoordinateDraft|->Result<(),CodecError>{
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        working.zeroize();**working=draft.patched_json;Ok(())
    };
    if !same.is_empty(){
        let draft=preview_existing_grid_mixed_batch(&working,&same).map_err(|_|CodecError::Patch)?;
        update(&mut working,draft)?;
    }
    for (target,expected,d,xy,orientation) in cross{
        let draft=preview_plain_world_transfer(&working,target,expected,d,xy,orientation).map_err(|_|CodecError::Patch)?;
        update(&mut working,draft)?;
    }
    Ok(std::mem::take(&mut *working))
}

#[cfg(test)]
mod tests{
    use super::*;

    #[test]
    fn group_pickup_resolves_once_and_returns_all_stock_or_nothing(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Unknown":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
        let mut rows=serde_json::json!([
         {"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"},
         {"localOrdinal":2,"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down"}
        ]);
        let d=group_pickup_candidate(raw,&rows.to_string()).unwrap();
        let result:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],4);
        assert!(result["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],3);
        assert!(d.contains("\"Unknown\":1e2"));
        rows[1]["expectedX"]=Value::from(3);
        assert!(group_pickup_candidate(raw,&rows.to_string()).is_err());
        rows[1]["expectedX"]=Value::from(2);
        let mut invalid:Value=serde_json::from_slice(raw).unwrap();
        invalid["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["State"]=serde_json::json!({"Unknown":5});
        assert!(group_pickup_candidate(&serde_json::to_vec(&invalid).unwrap(),&rows.to_string()).is_err());
    }

    #[test]
    fn group_cut_preserves_stock_and_same_grid_ids_and_checks_cross_grid_refs(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let a=serde_json::json!({"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/A.json","factor":1,"sizeX":16,"sizeY":16});
        let b=serde_json::json!({"layoutId":"SceneLayouts/Village04/B.json","gridDataPath":"GridData/B.json","factor":1,"sizeX":16,"sizeY":16});
        let mut plan=serde_json::json!([
          {"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","destination":a,"x":4,"y":4,"orientation":"GridOrientation_Left"},
          {"localOrdinal":2,"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":b,"x":5,"y":5,"orientation":"GridOrientation_Down"}
        ]);
        let d=group_cut_candidate(raw,&plan.to_string()).unwrap();
        let j:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["ID"],1);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"],4);
        assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("2").is_none());
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["ItemID"],40000001);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"],6);
        assert!(d.contains("\"Marker\":1e2"));
        let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":2}]);
        assert!(group_cut_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        plan[1]["expectedX"]=Value::from(3);assert!(group_cut_candidate(raw,&plan.to_string()).is_err());
    }

    #[test]
    fn cut_between_outdoor_worlds_rechecks_both_addresses_and_preserves_inventory(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/VillageExpansion01/B.json","GridDataPath":"GridData/Villages/VillageExpansion01/VillageExpansion01-DesertArea01LevelGrid01-GridData.json","TessellationFactor":2,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let dest=serde_json::json!({"layoutId":"SceneLayouts/VillageExpansion01/B.json","gridDataPath":"GridData/Villages/VillageExpansion01/VillageExpansion01-DesertArea01LevelGrid01-GridData.json","factor":2,"sizeX":16,"sizeY":16});
        let plan=serde_json::json!([{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","destination":dest,"x":5,"y":5,"orientation":"GridOrientation_Left"}]);
        let d=group_cut_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d).unwrap();
        assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["Orientation"],"GridOrientation_Left");
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"],6);
        assert!(d.contains("\"Marker\":1e2"));
        let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":1}]);
        assert!(group_cut_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        let mut wrong:Value=serde_json::from_slice(raw).unwrap();
        wrong["World"]["GridCollection"]["Grids"]["42"]["GridDataPath"]=Value::from("GridData/Room.json");
        assert!(group_cut_candidate(&serde_json::to_vec(&wrong).unwrap(),&plan.to_string()).is_err());
    }

    #[test]
    fn group_paste_checks_stock_and_all_allocator_addresses_before_staging(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}}}}}}"#;
        let dest=serde_json::json!({"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/A.json","factor":1,"sizeX":16,"sizeY":16});
        let mut plan=serde_json::json!([
          {"itemId":"40000001","destination":dest,"x":1,"y":2,"orientation":"GridOrientation_Down"},
          {"itemId":"40000001","destination":dest,"x":4,"y":2,"orientation":"GridOrientation_Left"}
        ]);
        let d=group_paste_candidate(raw,&plan.to_string()).unwrap();
        let j:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],5);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]["Orientation"],"GridOrientation_Left");
        assert!(d.contains("\"Marker\":1e2"));
        plan[1]["x"]=Value::from(1);assert!(group_paste_candidate(raw,&plan.to_string()).is_err());
        plan[1]["x"]=Value::from(4);let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"]=Value::from(1);
        assert!(group_paste_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        stale["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"]=Value::from(2);
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":4}]);
        assert!(group_paste_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
    }

    fn project(input:&[u8])->Value{
        serde_json::from_str(&saved_grid_instances_json(input).unwrap()).unwrap()
    }

    #[test]
    fn per_object_source_candidates_do_not_claim_native_save_identity(){
        let save=br#"{"World":{"GridCollection":{
          "Grids":{
            "101":{"ID":101,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
              "GridDataPath":"GridData/Test/Grid.json",
              "Objects":{"1":{"ID":1,"ItemID":77,"X":31,"Y":2}}},
            "102":{"ID":102,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Other.json",
              "GridDataPath":"GridData/Test/Other.json",
              "Objects":{"3":{"ID":3,"ItemID":33,"X":12,"Y":1}}},
            "103":{"ID":103,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
              "GridDataPath":"GridData/Test/Missing.json",
              "Objects":{"4":{"ID":4,"ItemID":44,"X":4,"Y":5}}}
          },
          "DiffGrids":{"202":{"ID":202,
            "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
            "GridDefaultLayoutType":"Meta.GridCollection, Meta",
            "DefaultLayoutGridID":7,"DefaultGridHashCode":19,
            "DefaultGridDataHashCode":-9,
            "ModifiedObjects":{"6":{"ID":6,"ItemID":88,"X":3,"Y":3}}}}
        }}}"#;
        let witness=serde_json::json!({
            "contract":"wand.db05.db04-object-source-witness@1",
            "gridRefs":[
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":7,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2},
                {"layoutId":"SceneLayouts/Test/Other.json",
                 "gridDataPath":"GridData/Test/Other.json",
                 "nativeGridId":8,"nativeSizeX":null,"nativeSizeY":null,
                 "tessellationFactor":null},
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Missing.json",
                 "nativeGridId":9,"nativeSizeX":null,"nativeSizeY":null,
                 "tessellationFactor":1}
            ]
        }).to_string();
        let r=saved_db04_object_source_context_json(save,&witness).unwrap();
        let result:Value=serde_json::from_str(&r).unwrap();
        let rows=result["rows"].as_array().unwrap();
        assert_eq!(rows.len(),4);
        assert_eq!(rows[0]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[0]["nativeSizeX"],10);
        assert_eq!(rows[0]["nativeSizeY"],20);
        assert_eq!(rows[0]["tessellationFactor"],2);
        assert_eq!(rows[0]["sourceAnchorEnvelopeWidth"],20);
        assert_eq!(rows[0]["sourceAnchorEnvelopeHeight"],40);
        assert_eq!(rows[0]["savedPositionNumericRelation"],
            "outside_source_anchor_numeric_envelope");
        assert_eq!(rows[1]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[1]["nativeSizeX"],Value::Null);
        assert_eq!(rows[2]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[2]["nativeSizeX"],Value::Null);
        assert_eq!(rows[3]["sourceStatus"],
            "diff_structural_candidate_hash_unverified");
        assert_eq!(rows[3]["nativeSizeX"],10);
        assert_eq!(rows[1]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[2]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[3]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[3]["sourceAnchorEnvelopeWidth"],Value::Null);
        assert_eq!(result["savedSourceCoordinateEquivalenceVerified"],false);
        // Source factor-two bounds are [0,2*SizeX) x [0,2*SizeY)
        // only as a numeric observation, not a legal placement condition.
        let inside=String::from_utf8(save.to_vec()).unwrap()
            .replacen(r#""X":31,"Y":2"#,r#""X":19,"Y":39"#,1);
        let inside_result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(inside.as_bytes(),&witness)
                .unwrap()
        ).unwrap();
        assert_eq!(inside_result["rows"][0]["savedPositionNumericRelation"],
            "within_source_anchor_numeric_envelope");
        let boundary=String::from_utf8(save.to_vec()).unwrap()
            .replacen(r#""X":31,"Y":2"#,r#""X":20,"Y":0"#,1);
        let boundary_result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(boundary.as_bytes(),&witness)
                .unwrap()
        ).unwrap();
        assert_eq!(boundary_result["rows"][0]["savedPositionNumericRelation"],
            "outside_source_anchor_numeric_envelope");
        for text in ["SceneLayouts/","GridData/","\"101\"","\"202\"",
                     "\"GridDefaultLayoutPath\"","\"ItemID\""]{
            assert!(!r.contains(text),"unexpected private/source field: {text}");
        }
        assert_eq!(result["savedGridIdentityVerified"],false);
        assert_eq!(result["placementLegalityVerified"],false);
        let duplicate=serde_json::json!({
            "contract":"wand.db05.db04-object-source-witness@1",
            "gridRefs":[
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":7,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2},
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":11,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2}
            ]
        }).to_string();
        let result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(save,&duplicate).unwrap()
        ).unwrap();
        assert_eq!(result["rows"][0]["sourceStatus"],"ambiguous_source_candidates");
        assert_eq!(result["rows"][0]["candidateCount"],2);
        assert_eq!(result["rows"][0]["nativeSizeX"],Value::Null);
        assert_eq!(result["rows"][3]["sourceStatus"],
            "diff_structural_candidate_hash_unverified");
        assert_eq!(saved_db04_object_source_context_json(save,r#"{"x":1}"#).err(),
            Some(CodecError::Json));
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
        assert_eq!(v["rows"][0]["localGridOrdinal"],1);
        assert_eq!(v["rows"][1]["localGridOrdinal"],1);
        assert_eq!(v["rows"][2]["localGridOrdinal"],2);
        assert_eq!(v["rows"][1]["coordinatesObserved"],false);
        assert_eq!(v["rows"][1]["x"],Value::Null);
        assert_eq!(v["rows"][2]["recordKind"],"diff_modified");
        assert_eq!(v["rows"][2]["y"],-7);
        assert_eq!(v["removedObjectMarkers"],1);
        assert_eq!(v["rowsMissingCoordinates"],1);
        assert_eq!(v["effectivePlacementVerified"],false);
        assert_eq!(v["saveWritingAuthorized"],false);
        // UI-only ordinals intentionally do not disclose the private grid ID.
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

    #[test]
    fn exclusive_anchor_moves_reject_same_class_only_with_atomic_final_positions(){
        let source=br#"{"World":{"GridCollection":{"Grids":{
          "101":{"Objects":{
            "1":{"ItemID":40100001,"X":0,"Y":0},
            "2":{"ItemID":40100002,"X":1,"Y":0},
            "3":{"ItemID":40700001,"X":2,"Y":0},
            "4":{"ItemID":40700002,"X":3,"Y":0},
            "5":{"ItemID":40000001,"X":4,"Y":0},
            "6":{"ItemID":40100003,"X":8,"Y":0},
            "7":{"ItemID":40100004,"X":8,"Y":0}}},
          "102":{"Objects":{"1":{"ItemID":40100002,"X":9,"Y":0}}}
        },"DiffGrids":{"201":{"ModifiedObjects":{
          "1":{"ItemID":40100001,"X":0,"Y":0}}}}}}}"#;
        let t=|id:&str,item_id:u64|GridCoordinateTarget{kind:GridObjectKind::Full,
            grid_id:"101".into(),object_id:id.into(),item_id};
        let road=t("1",40100001);let road2=t("2",40100002);
        let fence=t("3",40700001);let furniture=t("5",40000001);
        assert!(validate_exclusive_grid_moves(source,&[(&road,(1,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&fence,(3,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(8,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(2,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(4,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(9,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&furniture,(1,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(1,0)),(&road2,(0,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(5,0)),(&road2,(5,0))]).is_err());
        let diff=GridCoordinateTarget{kind:GridObjectKind::DiffModified,grid_id:"201".into(),
            object_id:"1".into(),item_id:40100001};
        assert!(validate_exclusive_grid_moves(source,&[(&diff,(5,0))]).is_err());
        assert_eq!(exclusive_anchor_class(50100001),None);
        assert_eq!(exclusive_anchor_class(40200001),None);
    }
    #[test]
    fn exclusive_move_requires_known_other_same_class_coordinates(){
        let source=br#"{"World":{"GridCollection":{"Grids":{"1":{"Objects":{
          "1":{"ItemID":40100001,"X":0,"Y":0},"2":{"ItemID":40100002,"X":2}
        }}}}}}"#;
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"1".into(),
            object_id:"1".into(),item_id:40100001};
        assert!(validate_exclusive_grid_moves(source,&[(&target,(3,0))]).is_err());
    }
}

#[cfg(test)]
mod terrain_session_tests{
    use super::*;
    #[test]
    fn terrain_session_uses_exact_paths_and_native_default_factor(){
        let save=br#"{"World":{"GridCollection":{"Grids":{
          "1":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","Objects":{"1":{"ItemID":40005160,"X":0,"Y":1,"Orientation":"GridOrientation_Down"}}},
          "2":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"Objects":{"2":{"ItemID":40005160,"X":2,"Y":3}}},
          "3":{"GridDefaultLayoutPath":"SceneLayouts/Other.json","GridDataPath":"GridData/Test.json","Objects":{"3":{"ItemID":40005160,"X":0,"Y":0}}}
        }}}}"#;
        let witness=r#"{"contract":"wand.db05.db04-object-source-witness@1","gridRefs":[{"layoutId":"SceneLayouts/Test.json","gridDataPath":"GridData/Test.json","nativeGridId":0,"nativeSizeX":10,"nativeSizeY":10,"tessellationFactor":1}]}"#;
        let r:Value=serde_json::from_str(&saved_db04_terrain_session_json(save,witness).unwrap()).unwrap();
        assert_eq!(r["rows"].as_array().unwrap().len(),3);
        assert_eq!(r["bindings"].as_array().unwrap().len(),2);
        assert_eq!(r["bindings"][0]["savedFactor"],1);
        assert_eq!(r["bindings"][0]["sourceLocalCoordinateMappingVerified"],true);
        assert_eq!(r["bindings"][1]["sourceLocalCoordinateMappingVerified"],false);
        assert!(!r.to_string().contains("SceneLayouts/"));
    }
    #[test]
    fn dependency_scan_distinguishes_historical_active_and_unknown_addresses(){
        let profile=br#"{"World":{"GridCollection":{"Grids":{"10":{"ID":10,"NextGridObjectID":2,"Objects":{"2":{"ID":2,"ItemID":40005160},"7":{"ID":7,"State":{"TreeAndBush":{"SaplingGridObjectID":2}}}}},"20":{"ID":20,"Objects":{"7":{"ID":7,"State":{"TreeAndBush":{"SaplingGridObjectID":2}}}}}}},"Events":{"SpawnedObjects":[{"GridID":10,"GridObjectID":2},{"GridID":20,"GridObjectID":2}]}},"Player":{"Achievements":{"GridObjectsCollected":[{"GridId":10,"GridObjectId":2}]},"LastUsedLinkedEnvironmentEnter":{"1":{"GridID":10,"GridObjectID":2}},"Unknown":{"GridID":10,"GridObjectID":2}}}"#;
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"10".into(),object_id:"2".into(),item_id:40005160};
        let r=grid_identity_dependencies(profile,&target).unwrap();
        assert_eq!((r.active,r.historical,r.navigation,r.related,r.unknown),(1,1,1,1,1));assert_eq!(r.blocking(),4);
    }
    #[test]
    fn transfer_destination_resolves_empty_full_grid_and_rejects_ambiguity(){
        let save=br#"{"World":{"GridCollection":{"Grids":{"20":{"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","NextGridObjectID":3,"Objects":{}}},"DiffGrids":{}}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/B.json","gridDataPath":"GridData/B.json","factor":1,"sizeX":20,"sizeY":20});
        let d=resolve_plain_grid_destination(save,&witness).unwrap();
        assert_eq!(d.grid_id,"20");assert_eq!(d.tessellation,1);
        let mut wrong=witness.clone();wrong["factor"]=serde_json::json!(2);
        assert!(resolve_plain_grid_destination(save,&wrong).is_err());
        for key in ["SpawnedObjects","GridObjectsCollected","LastUsedLinkedEnvironmentEnter","Unknown"]{
            let mut referenced:Value=serde_json::from_slice(save).unwrap();
            referenced["Player"]=serde_json::json!({(key):[{"GridID":20,"GridObjectID":3}]});
            assert!(resolve_plain_grid_destination(&serde_json::to_vec(&referenced).unwrap(),&witness).is_err());
            referenced["Player"][key][0]["GridID"]=serde_json::json!(21);
            assert!(resolve_plain_grid_destination(&serde_json::to_vec(&referenced).unwrap(),&witness).is_ok());
        }
        let mut root:Value=serde_json::from_slice(save).unwrap();
        let other=root["World"]["GridCollection"]["Grids"]["20"].clone();
        root["World"]["GridCollection"]["Grids"]["21"]=other;
        root["World"]["GridCollection"]["Grids"]["21"]["ID"]=serde_json::json!(21);
        assert!(resolve_plain_grid_destination(&serde_json::to_vec(&root).unwrap(),&witness).is_err());
    }
    #[test]
    fn support_stock_place_and_pickup_are_atomic_and_preserve_other_records(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005161":{"Amount":2,"Marker":"ItemMarker_Favorite"}}}},"Other":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","stock":{"action":"place","itemId":40005161,"expectedStock":2,"x":2,"y":0,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(save,&plan).unwrap();
        let original:Value=serde_json::from_slice(save).unwrap();let mut expected=original.clone();
        expected["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"]=Value::from(1);
        expected["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=Value::from(3);
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005161,"X":2,"Y":0,"Orientation":"GridOrientation_Left"});
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);assert!(draft.patched_json.contains("\"Other\":1e2"));
        plan["stock"]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"]["y"]=Value::from(0);plan["stock"]["expectedStock"]=Value::from(1);assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"]["expectedStock"]=Value::from(2);plan["stock"]["x"]=Value::from(0);assert!(support_child_candidate(save,&plan).is_err());
        plan.as_object_mut().unwrap().remove("terrainPath");
        plan["stock"]=serde_json::json!({"action":"pickup","itemId":40005161,"expectedStock":1,"index":1,"expectedX":2,"expectedY":0,"expectedOrientation":"GridOrientation_Left"});
        let picked=support_child_candidate(draft.patched_json.as_bytes(),&plan).unwrap();
        let mut expected_after=original.clone();expected_after["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=Value::from(3);
        assert_eq!(serde_json::from_str::<Value>(&picked.patched_json).unwrap(),expected_after);
        let mut empty=original.clone();empty["World"]["GridCollection"]["Grids"]["8"]["Objects"]=serde_json::json!({});
        plan["terrainPath"]=Value::from("GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json");
        plan["stock"]=serde_json::json!({"action":"place","itemId":40005161,"expectedStock":2,"x":2,"y":0,"orientation":"GridOrientation_Left"});
        assert!(support_child_candidate(&serde_json::to_vec(&empty).unwrap(),&plan).is_ok());
    }
    #[test]
    fn support_free_move_uses_exact_source_raster_and_rejects_holes(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","edits":[{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":2,"y":0,"orientation":"GridOrientation_Left"}]});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["X"]=Value::from(2);
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Left");
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["edits"][0]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["edits"][0]["y"]=Value::from(4);assert!(support_child_candidate(save,&plan).is_err());
        plan["edits"][0]["y"]=Value::from(0);plan["terrainPath"]=Value::from("GridData/Furniture/NonIP_SetLess/Table01-GridData.json");assert!(support_child_candidate(save,&plan).is_err());
    }
    #[test]
    fn support_transfer_is_atomic_and_stock_independent(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}},"2":{"ID":2,"ItemID":40005160,"X":8,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":9}}}}},
          "8":{"ID":8,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}},
          "9":{"ID":9,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":4,"Objects":{}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"transfer":{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","destination":{"localOrdinal":2,"itemId":40005160,"expectedX":8,"expectedY":6,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json"},"x":2,"y":0,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]=serde_json::json!({});
        expected["World"]["GridCollection"]["Grids"]["9"]["Objects"]=serde_json::json!({"4":{"ID":4,"ItemID":40005161,"X":2,"Y":0,"Orientation":"GridOrientation_Left"}});
        expected["World"]["GridCollection"]["Grids"]["9"]["NextGridObjectID"]=Value::from(5);
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["transfer"]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["transfer"]["y"]=Value::from(0);plan["transfer"]["destination"]["expectedX"]=Value::from(9);assert!(support_child_candidate(save,&plan).is_err());
    }
    #[test]
    fn child_rotation_and_swap_change_only_selected_scalars(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":1,"Y":2,"Orientation":"GridOrientation_Left","State":null},"2":{"ID":2,"ItemID":40005162,"X":3,"Y":4,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"edits":[{"index":0,"itemId":40005161,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Left","x":1,"y":2,"orientation":"GridOrientation_Down"}]});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Down");
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["edits"][0]["x"]=Value::from(3);assert!(support_child_candidate(save,&plan).is_err());
        plan["edits"]=serde_json::json!([
          {"index":0,"itemId":40005161,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Left","x":3,"y":4,"orientation":"GridOrientation_Left"},
          {"index":1,"itemId":40005162,"expectedX":3,"expectedY":4,"expectedOrientation":"GridOrientation_Down","x":1,"y":2,"orientation":"GridOrientation_Down"}
        ]);
        let draft=support_child_candidate(save,&plan).unwrap();let mut expected:Value=serde_json::from_slice(save).unwrap();
        for (id,x,y) in [("1",3,4),("2",1,2)]{expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["X"]=Value::from(x);expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["Y"]=Value::from(y);}
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        plan["edits"][1]["y"]=Value::from(7);assert!(support_child_candidate(save,&plan).is_err());
        plan["path"]=serde_json::json!([0]);assert!(support_child_candidate(save,&plan).is_err());
    }
    #[test]
    fn support_tree_and_parent_translation_preserve_descendants_and_block_aliases(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Other":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{
            "1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":1,"Y":2,"Orientation":"GridOrientation_Left","State":{"SubGrid":{"GridID":9}}}}},
          "9":{"ID":9,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":1,"Orientation":"GridOrientation_Down","Unknown":1e2}}}
        }}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/Test.json","gridDataPath":"GridData/Test.json","factor":2,"sizeX":20,"sizeY":20});
        let view:Value=serde_json::from_str(&inspect_subgrid_json(save,1,40005160,(4,6)).unwrap()).unwrap();
        assert_eq!(view["tree"]["objects"][0]["child"]["objects"][0]["itemId"],40005162);
        assert_eq!(view["tree"]["objects"][0]["orientation"],"GridOrientation_Left");
        assert!(!view.to_string().contains("GridID"));assert!(!view.to_string().contains("Unknown"));
        let draft=support_parent_move_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();expected["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["X"]=Value::from(10);expected["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["Y"]=Value::from(12);
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Unknown\":1e2"));assert!(draft.patched_json.contains("\"Other\":1e2"));
        assert!(support_parent_move_candidate(save,1,40005160,(4,6),(40,12),&witness,None,None).is_err());
        let rotation=support_parent_move_candidate(save,1,40005160,(4,6),(4,6),&witness,Some(("GridOrientation_Down","GridOrientation_Left")),None).unwrap();
        let mut rotated:Value=serde_json::from_slice(save).unwrap();
        rotated["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Left");
        assert_eq!(serde_json::from_str::<Value>(&rotation.patched_json).unwrap(),rotated);
        assert!(rotation.patched_json.contains("\"Unknown\":1e2"));
        assert!(support_parent_move_candidate(save,1,40005160,(4,6),(4,6),&witness,Some(("GridOrientation_Up","GridOrientation_Left")),None).is_err());
        let mut cross:Value=serde_json::from_slice(save).unwrap();
        cross["World"]["GridCollection"]["Grids"]["10"]=serde_json::json!({"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/Other.json","GridDataPath":"GridData/Other.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{}});
        let dest=serde_json::json!({"layoutId":"SceneLayouts/Village04/Other.json","gridDataPath":"GridData/Other.json","factor":2,"sizeX":20,"sizeY":20});
        let bytes=serde_json::to_vec(&cross).unwrap();
        let d=support_parent_move_candidate(&bytes,1,40005160,(4,6),(4,6),&dest,None,Some(&witness)).unwrap();
        let mut moved=cross.clone();let mut parent=moved["World"]["GridCollection"]["Grids"]["7"]["Objects"].as_object_mut().unwrap().remove("1").unwrap();
        parent["ID"]=Value::from(3);moved["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]=parent;
        moved["World"]["GridCollection"]["Grids"]["10"]["NextGridObjectID"]=Value::from(4);
        assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),moved);
        assert!(support_parent_move_candidate(&bytes,1,40005160,(4,6),(4,6),&dest,None,None).is_err());
        let mut alias:Value=serde_json::from_slice(save).unwrap();
        let mut duplicate=alias["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"].clone();duplicate["ID"]=Value::from(2);alias["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]=duplicate;
        alias["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"]=Value::from(3);
        assert!(inspect_subgrid_json(&serde_json::to_vec(&alias).unwrap(),1,40005160,(4,6)).is_err());
        let mut cycle:Value=serde_json::from_slice(save).unwrap();cycle["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]["State"]=serde_json::json!({"SubGrid":{"GridID":7}});
        assert!(inspect_subgrid_json(&serde_json::to_vec(&cycle).unwrap(),1,40005160,(4,6)).is_err());
    }
    #[test]
    fn subgrid_parent_is_local_structural_evidence_and_mixed_edit_guard(){
        let save=br#"{"World":{"GridCollection":{"Grids":{
          "1":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","Objects":{
            "1":{"ItemID":40005160,"X":0,"Y":1,"State":{"SubGrid":{"GridID":99}}},
            "2":{"ItemID":40005160,"X":2,"Y":3,"State":{"SubGrid":{"GridID":88}}},
            "3":{"ItemID":40005160,"X":4,"Y":5}}},
          "99":{"Objects":{"7":{"ItemID":40005160,"X":0,"Y":0}}}
        }}}}"#;
        let witness=r#"{"contract":"wand.db05.db04-object-source-witness@1","gridRefs":[{"layoutId":"SceneLayouts/Test.json","gridDataPath":"GridData/Test.json","nativeGridId":0,"nativeSizeX":10,"nativeSizeY":10,"tessellationFactor":1}]}"#;
        let r:Value=serde_json::from_str(&saved_db04_terrain_session_json(save,witness).unwrap()).unwrap();
        assert_eq!(r["bindings"][0]["subgrid"],serde_json::json!({"status":"resolved_full","objectCount":1}));
        assert_eq!(r["bindings"][1]["subgrid"],serde_json::json!({"status":"unresolved","objectCount":null}));
        assert!(r["bindings"][2]["subgrid"].is_null());
        assert!(!r.to_string().contains("GridID"));
        assert!(resolve_grid_mixed_targets(save,&[(1,40005160,(0,1),"full".into(),None)]).is_err());
        assert!(resolve_grid_mixed_targets(save,&[(2,40005160,(2,3),"full".into(),None)]).is_err());
        assert!(resolve_grid_mixed_targets(save,&[(3,40005160,(4,5),"full".into(),None)]).is_ok());
    }
}
