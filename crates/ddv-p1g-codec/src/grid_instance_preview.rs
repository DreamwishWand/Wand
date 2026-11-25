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
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let grid=key_id(&target.grid_id).ok_or(CodecError::Json)?;
    let object=key_id(&target.object_id).ok_or(CodecError::Json)?;
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
                if object_values.iter().any(|v|*v==Some(object)){
                    if grid_values.iter().any(|v|*v==Some(grid)){
                        if flags.0{out.active+=1;}else if flags.1{out.historical+=1;}else if flags.2{out.navigation+=1;}else if flags.3{out.active+=1;}else{out.unknown+=1;}
                    }else if grid_values.is_empty()||grid_values.iter().any(Option::is_none){out.unknown+=1;}
                }
                for (key,value) in o{
                    let k=normal(key);
                    if k=="saplinggridobjectid"&&value.as_u64()==Some(object)&&owning.is_none_or(|g|g==grid){out.related+=1;}
                    else if k!="gridobjectid"&&k!="nextgridobjectid"&&k!="saplinggridobjectid"&&k.contains("gridobjectid")&&value.as_u64()==Some(object){out.unknown+=1;}
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

#[cfg(test)]
mod tests{
    use super::*;

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
