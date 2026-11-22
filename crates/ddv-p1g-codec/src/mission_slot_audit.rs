//! DB-05: local, read-only MissionSlot -> DB-03 public quest-ID comparison.
//! Never return private Mission IDs, slot/map keys, quest state or Save bytes.
//! A static quest-ID match does NOT prove completion, unlocks or entitlement.
use super::CodecError;
use serde_json::Value;
use std::collections::HashSet;

const MAX_PUBLIC_INDEX_BYTES:usize=2*1024*1024;
const MAX_QUESTS:usize=733;
const MAX_SLOT_MAPS:usize=512;
const MAX_SLOTS_PER_MAP:usize=512;
const MAX_OBSERVED:usize=256;
const MISSION_SHA:&str="f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24";

fn public_quest_ids(source:&str)->Result<HashSet<u64>,CodecError>{
    if source.is_empty()||source.len()>MAX_PUBLIC_INDEX_BYTES{
        return Err(CodecError::Bounds);
    }
    let index:Value=serde_json::from_str(source).map_err(|_|CodecError::Json)?;
    let root=index.as_object().ok_or(CodecError::Json)?;
    if root.get("schema").and_then(Value::as_str)
        !=Some("wand.db03.public-guide-quests@1"){
        return Err(CodecError::Json);
    }
    let target=root.get("target").and_then(Value::as_object)
        .ok_or(CodecError::Json)?;
    if target.get("platform").and_then(Value::as_str)!=Some("Steam")||
       target.get("gameVersion").and_then(Value::as_str)!=Some("1.26.2"){
        return Err(CodecError::Json);
    }
    let provenance=root.get("provenance").and_then(Value::as_object)
        .ok_or(CodecError::Json)?;
    if provenance.get("originalProjectionVersion").and_then(Value::as_str)
        !=Some("1.26.1")||
       provenance.get("missionFullFileSha256").and_then(Value::as_str)
        !=Some(MISSION_SHA)||
       provenance.get("sourceIsStaticNotPlayerProgress").and_then(Value::as_bool)
        !=Some(true){
        return Err(CodecError::Json);
    }
    let counts=root.get("counts").and_then(Value::as_object)
        .ok_or(CodecError::Json)?;
    if counts.get("quests").and_then(Value::as_u64)!=Some(733)||
       counts.get("steps").and_then(Value::as_u64)!=Some(7878)||
       counts.get("objectives").and_then(Value::as_u64)!=Some(11782)||
       counts.get("detailParts").and_then(Value::as_u64)!=Some(8){
        return Err(CodecError::Json);
    }
    let quests=root.get("quests").and_then(Value::as_array)
        .ok_or(CodecError::Json)?;
    if quests.len()!=MAX_QUESTS{return Err(CodecError::Json);}
    let mut known=HashSet::with_capacity(MAX_QUESTS);
    for quest in quests{
        let row=quest.as_object().ok_or(CodecError::Json)?;
        let id=row.get("id").and_then(Value::as_str).ok_or(CodecError::Json)?;
        if id.is_empty()||id.len()>16||id.starts_with('0')||
           !id.bytes().all(|b|b.is_ascii_digit()){
            return Err(CodecError::Json);
        }
        let id=id.parse::<u64>().map_err(|_|CodecError::Json)?;
        if id==0||!known.insert(id)||
           !row.get("detailPart").and_then(Value::as_u64)
              .is_some_and(|p|p<8){
            return Err(CodecError::Json);
        }
    }
    Ok(known)
}

/// The input is an already strictly opened Rust profile, never a JSON
/// representation supplied by an untrusted page. Only aggregate counters
/// cross the Worker boundary; no Mission ID, map key or Save property values.
pub(super) fn match_mission_slots_json(
    profile:&[u8],published_index:&str
)->Result<String,CodecError>{
    let known=public_quest_ids(published_index)?;
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let world=root.get("World").and_then(Value::as_object)
        .ok_or(CodecError::RequiredRoot)?;
    let slots=world.get("MissionSlots");
    let mut observed=0usize;
    let mut matched=0usize;
    let mut unresolved=0usize;
    let mut malformed=0usize;
    let mut zero=0usize;
    let mut type_issues=0usize;
    let mut missing=0usize;
    let mut sampled=false;
    let mut distinct=HashSet::<u64>::new();
    let status=if slots.is_none(){
        "not_observed"
    }else if !slots.is_some_and(Value::is_object){
        "incompatible_structure"
    }else{
        let groups=slots.and_then(Value::as_object).ok_or(CodecError::Json)?;
        if groups.len()>MAX_SLOT_MAPS{sampled=true;}
        'outer:for container in groups.values().take(MAX_SLOT_MAPS){
            let Some(container)=container.as_object() else {
                type_issues+=1;continue;
            };
            let Some(value)=container.get("Slots") else {
                // Some modded or older saves omit this optional field.
                missing+=1;continue;
            };
            let Some(list)=value.as_array() else {
                type_issues+=1;continue;
            };
            if list.len()>MAX_SLOTS_PER_MAP{sampled=true;}
            for slot in list.iter().take(MAX_SLOTS_PER_MAP){
                let Some(row)=slot.as_object() else {
                    type_issues+=1;continue;
                };
                let Some(mission)=row.get("MissionId") else {
                    missing+=1;continue;
                };
                if observed>=MAX_OBSERVED{
                    sampled=true;break 'outer;
                }
                observed+=1;
                if mission.as_u64()==Some(0){
                    zero+=1;continue;
                }
                // Native MissionId is an integer, never a string or a float.
                let Some(id)=mission.as_u64().filter(|v|*v>0&&*v<10_000_000_000_000_000) else {
                    malformed+=1;continue;
                };
                distinct.insert(id);
                if known.contains(&id){matched+=1;}else{unresolved+=1;}
            }
        }
        if type_issues>0||malformed>0||sampled{
            "partial_inconclusive"
        }else if observed==0{
            "not_observed"
        }else if zero==observed{
            "zero_sentinels_only"
        }else if unresolved>0{
            "unresolved_in_guide_subset"
        }else{
            "source_mission_candidates"
        }
    };
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.db03-mission-slot-summary@1",
        "status":status,
        "observedMissionSlots":observed,
        "matchedPlayableQuestReferences":matched,
        "unresolvedPlayableQuestReferences":unresolved,
        "zeroSentinels":zero,
        "malformedMissionIds":malformed,
        "typeIssues":type_issues,
        "missingOptionalMissionIds":missing,
        "distinctPositiveMissionIds":distinct.len(),
        "sampled":sampled,
        "publishedQuestDefinitions":MAX_QUESTS,
        "sourceGameVersion":"1.26.2",
        "indexMetadataValidated":true,
        "originalGameSourceBytesRehashed":false,
        "conditionCompatibilityVerified":false,
        "completeQuestHistoryVerified":false,
        "questProgressVerified":false,
        "questCompletionVerified":false,
        "entitlementVerified":false,
        "saveWritingAuthorized":false,
        "exportAuthorized":false
    })).map_err(|_|CodecError::Json)
}

#[cfg(test)]
mod tests{
    use super::*;

    fn index()->String{
        let quests:Vec<Value>=(0..733).map(|i|serde_json::json!({
            "id":format!("{}",2070000000u64+i),"detailPart":i%8
        })).collect();
        serde_json::json!({
            "schema":"wand.db03.public-guide-quests@1",
            "target":{"platform":"Steam","gameVersion":"1.26.2"},
            "provenance":{"originalProjectionVersion":"1.26.1",
                "missionFullFileSha256":MISSION_SHA,
                "sourceIsStaticNotPlayerProgress":true},
            "counts":{"quests":733,"steps":7878,"objectives":11782,"detailParts":8},
            "quests":quests
        }).to_string()
    }
    #[test]
    fn counts_known_and_unknown_without_disclosing_private_quest_ids(){
        let profile=br#"{"GameInfo":{"Version":643},"Player":{},
            "World":{"MissionSlots":{"private-map":{
                "Slots":[{"MissionId":2070000001,"Secret":"private-quest-state"},
                {"MissionId":2070000001},{"MissionId":8765432101},
                {"MissionId":0},{"MissionId":null},{"Other":9}]
            },"modded-or-missing":{}},
            "ExtraMod":{"Secret":"do-not-export"}}}"#;
        let result=match_mission_slots_json(profile,&index()).unwrap();
        let v:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(v["status"],"partial_inconclusive");
        assert_eq!(v["observedMissionSlots"],5);
        assert_eq!(v["matchedPlayableQuestReferences"],2);
        assert_eq!(v["unresolvedPlayableQuestReferences"],1);
        assert_eq!(v["zeroSentinels"],1);
        assert_eq!(v["malformedMissionIds"],1);
        // One missing Slots container + one slot missing MissionId.
        assert_eq!(v["missingOptionalMissionIds"],2);
        assert_eq!(v["distinctPositiveMissionIds"],2);
        for secret in ["private-map","private-quest-state",
            "do-not-export","2070000001","8765432101"]{
            assert!(!result.contains(secret));
        }
        assert_eq!(v["questCompletionVerified"],false);
        assert_eq!(v["saveWritingAuthorized"],false);
    }
    #[test]
    fn partial_history_absent_slots_and_zero_sentinels_are_not_corruption(){
        let absent=br#"{"GameInfo":{"Version":643},"Player":{},"World":{}}"#;
        let r=match_mission_slots_json(absent,&index()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&r).unwrap()["status"],
            "not_observed");
        let zero=br#"{"GameInfo":{"Version":643},"Player":{},
            "World":{"MissionSlots":{"1":{"Slots":[{"MissionId":0}]}}}}"#;
        let r=match_mission_slots_json(zero,&index()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&r).unwrap()["status"],
            "zero_sentinels_only");
    }
    #[test]
    fn rejects_forged_or_inconsistent_public_index(){
        let good=index();
        let mut tampered:Value=serde_json::from_str(&good).unwrap();
        tampered["quests"][1]["id"]=Value::from("2070000000");
        assert!(match_mission_slots_json(br#"{"World":{}}"#,
            &tampered.to_string()).is_err());
        tampered["quests"][1]["id"]=Value::from("2070000001");
        tampered["provenance"]["missionFullFileSha256"]=Value::from("not-original");
        assert!(match_mission_slots_json(br#"{"World":{}}"#,
            &tampered.to_string()).is_err());
    }
}
