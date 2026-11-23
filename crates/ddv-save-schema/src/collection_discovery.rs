//! Read-only CollectionSet discovery projection from STRICTLY decoded save JSON.
//! Only exact integer-ID boolean history is returned. This is NOT ownership,
//! entitlement, unlock state, Collection runtime visibility, or a Save Writer.
//! The native boolean semantic was established for Switch 1.24.13/1.25.0;
//! Steam 1.26.2 schema 643 is shape-compatible, not native-method equivalent.
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const CONTRACT: &str = "wand.collection.saved-discovery-projection@1";
pub const IMPORT_SCHEMA: &str = "wand.collection.mapped-save-discovery@1";
const MAX_SAFE_ID: u64 = 9_007_199_254_740_991;
// Original Steam v1.26.2 has 305 source CollectionSets. Bounds are
// intentionally higher than the source definition census, but finite.
const MAX_SETS: usize = 512;
const MAX_GROUPS: usize = 8192;
const MAX_REFERENCES: usize = 65_536;
const MAX_INPUT_BYTES: usize = 128 * 1024 * 1024;
const ERROR: &str = r#"{"error":"SAVE_COLLECTION_DISCOVERY_RUST_INVALID","saveFileModified":false,"ownershipVerified":false}"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DiscoveredItem {
    pub item_id: u64,
    pub discovered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct CollectionDiscovery {
    pub contract: &'static str,
    pub import_schema: &'static str,
    pub save_schema: Option<i64>,
    pub status: &'static str,
    pub entries: Vec<DiscoveredItem>,
    pub observed_references: usize,
    pub observed_groups: usize,
    pub invalid_references: usize,
    pub ambiguous_item_ids: usize,
    pub sampled: bool,
    pub semantic: &'static str,
    pub native_evidence_version: &'static str,
    pub current_steam_native_equivalent_proven: bool,
    pub save_file_modified: bool,
    pub ownership_verified: bool,
    pub publishable: bool,
}

fn safe_schema(v: Option<&Value>) -> Option<i64> {
    let n = v?;
    if let Some(i) = n.as_i64() {
        return (i.unsigned_abs() <= MAX_SAFE_ID).then_some(i);
    }
    if let Some(u) = n.as_u64() {
        return (u <= MAX_SAFE_ID).then_some(u as i64);
    }
    let f = n.as_f64()?;
    (f.is_finite() && f.fract() == 0.0 && f.abs() <= MAX_SAFE_ID as f64)
        .then_some(f as i64)
}
fn canonical_id(key: &str) -> Option<u64> {
    let id = key.parse::<u64>().ok()?;
    (id > 0 && id <= MAX_SAFE_ID && id.to_string() == key).then_some(id)
}

/// Operates on a borrowed decoded document inside the isolated Save Worker.
/// Malformed/unknown groups cannot turn false into owned or undiscovered.
/// Ambiguous IDs are excluded while independently confirmed IDs remain usable.
pub fn inspect_collection_discovery(root: &Value) -> CollectionDiscovery {
    let version = safe_schema(root.get("GameInfo").and_then(|v|v.get("Version")));
    let supported = matches!(version, Some(624 | 643));
    let player = root.get("Player").and_then(Value::as_object);
    let has_collection = player.is_some_and(|p|p.contains_key("CollectionSets"));
    let sets = player.and_then(|p|p.get("CollectionSets"))
        .and_then(Value::as_array);
    let mut sampled = false;
    let mut observed = 0usize;
    let mut groups = 0usize;
    let mut invalid = 0usize;
    let mut values = BTreeMap::<u64, Option<bool>>::new();
    let mut conflicts = HashSet::<u64>::new();
    if supported {
        if let Some(sets) = sets {
            if sets.len() > MAX_SETS { sampled = true; }
            'sets: for set in sets.iter().take(MAX_SETS) {
                let Some(group_data) = set.get("GroupData").and_then(Value::as_array) else {
                    invalid += 1;
                    continue;
                };
                for group in group_data {
                    if groups >= MAX_GROUPS { sampled = true; break 'sets; }
                    groups += 1;
                    let Some(items) = group.get("GroupsCollectionItems")
                        .and_then(Value::as_object) else {
                        invalid += 1;
                        continue;
                    };
                    for (key, value) in items {
                        if observed + invalid >= MAX_REFERENCES {
                            sampled = true;
                            break 'sets;
                        }
                        let Some(id) = canonical_id(key) else {
                            invalid += 1;
                            continue;
                        };
                        observed += 1;
                        let actual = value.as_bool();
                        if actual.is_none() { invalid += 1; }
                        use std::collections::btree_map::Entry;
                        match values.entry(id) {
                            Entry::Vacant(entry) => { entry.insert(actual); },
                            Entry::Occupied(mut entry) => {
                                match (*entry.get(), actual) {
                                    (_, None) => { entry.insert(None); },
                                    (Some(before), Some(after)) if before != after => {
                                        entry.insert(None);
                                        conflicts.insert(id);
                                    },
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let entries = values.into_iter().filter_map(|(item_id, found)| {
        found.map(|discovered| DiscoveredItem {item_id, discovered})
    }).collect::<Vec<_>>();
    let status = if !supported { "unsupported_schema" }
        else if !has_collection { "not_observed" }
        else if sets.is_none() { "incompatible_structure" }
        else if sampled || invalid > 0 || !conflicts.is_empty() { "partial_inconclusive" }
        else if entries.is_empty() { "observed_empty" }
        else { "observed_boolean_discovery" };
    CollectionDiscovery {
        contract: CONTRACT, import_schema: IMPORT_SCHEMA,
        save_schema: version, status, entries,
        observed_references: observed, observed_groups: groups,
        invalid_references: invalid, ambiguous_item_ids: conflicts.len(),
        sampled, semantic: "collection_discovery_history_not_ownership",
        native_evidence_version: "switch-1.25.0",
        current_steam_native_equivalent_proven: false,
        save_file_modified: false, ownership_verified: false,
        publishable: false,
    }
}

/// WASM entrypoint: input is trusted only after the strict Rust JSON/P1G
/// decoder. It NEVER returns private fields, Save bytes, or arbitrary values.
#[cfg_attr(feature="wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub fn probe_collection_discovery_json(decoded_json: &str) -> String {
    if decoded_json.len() > MAX_INPUT_BYTES { return ERROR.to_owned(); }
    match serde_json::from_str::<Value>(decoded_json) {
        Ok(root) => serde_json::to_string(&inspect_collection_discovery(&root))
            .expect("Collection summary serializes only fixed safe fields"),
        Err(_) => ERROR.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn native_boolean_history_is_not_owned_and_removes_private_fields() {
        let root=json!({"GameInfo":{"Version":643},
            "Player":{"PrivateName":"never-export","CollectionSets":[{
                "CollectionDefinitionID":2120000001,
                "GroupData":[
                  {"GroupIndex":0,"GroupsCollectionItems":{"101":true,"102":false,"103":true}},
                  {"GroupIndex":1,"GroupsCollectionItems":{"101":true,"104":false}}
                ]
            }]}, "World":{"Secret":"never-export-world"}});
        let before=root.clone();
        let p=inspect_collection_discovery(&root);
        assert_eq!(root,before);
        assert_eq!(p.status,"observed_boolean_discovery");
        assert_eq!(p.observed_references,5);
        assert_eq!(p.ambiguous_item_ids,0);
        assert_eq!(p.entries, vec![
            DiscoveredItem{item_id:101,discovered:true},
            DiscoveredItem{item_id:102,discovered:false},
            DiscoveredItem{item_id:103,discovered:true},
            DiscoveredItem{item_id:104,discovered:false}
        ]);
        let serialized=serde_json::to_string(&p).unwrap();
        for secret in ["never-export", "CollectionDefinitionID", "GroupIndex",
            "PrivateName", "Secret", "owned", "amount", "unlock"] {
            assert!(!serialized.contains(secret), "{secret}");
        }
        assert!(!p.ownership_verified && !p.current_steam_native_equivalent_proven);
    }

    #[test]
    fn conflicting_item_across_sets_does_not_clear_other_discovery() {
        let root=json!({"GameInfo":{"Version":643},"Player":{"CollectionSets":[{
            "GroupData":[
                {"GroupsCollectionItems":{"40003256":true,"40006110":false}},
                {"GroupsCollectionItems":{"40003256":false,"40006110":false}},
                {"GroupsCollectionItems":{"40003256":true,"40005160":true}}
            ]
        }]}});
        let p=inspect_collection_discovery(&root);
        assert_eq!(p.status,"partial_inconclusive");
        assert_eq!(p.ambiguous_item_ids,1);
        assert_eq!(p.entries,vec![
            DiscoveredItem{item_id:40005160,discovered:true},
            DiscoveredItem{item_id:40006110,discovered:false}
        ]);
    }

    #[test]
    fn nonboolean_poison_malformed_keys_and_skipped_data_do_not_set_discovery() {
        let root=json!({"GameInfo":{"Version":643},"Player":{"CollectionSets":[{
            "GroupData":[
                {"GroupsCollectionItems":{"101":false,"102":null,"103":1,"0104":true}},
                {"GroupsCollectionItems":{"102":true,"103":false,"105":"true",
                                         "106":{"private":"never-export"}}}
            ]
        }]}});
        let p=inspect_collection_discovery(&root);
        assert_eq!(p.status,"partial_inconclusive");
        assert_eq!(p.invalid_references,5);
        assert_eq!(p.ambiguous_item_ids,0);
        assert_eq!(p.entries,vec![DiscoveredItem{item_id:101,discovered:false}]);
    }

    #[test]
    fn finite_bound_handles_more_than_legacy_128_source_sets() {
        let sets:Vec<_>=(1..=305).map(|id|json!({
            "GroupData":[{"GroupsCollectionItems":{format!("{id}"):true}}]
        })).collect();
        let root=json!({"GameInfo":{"Version":643},"Player":{"CollectionSets":sets}});
        let p=inspect_collection_discovery(&root);
        assert_eq!(p.status,"observed_boolean_discovery");
        assert_eq!(p.observed_groups,305);
        assert_eq!(p.entries.len(),305);
        assert!(!p.sampled);
        let sets=(0..=MAX_SETS).map(|_|json!({"GroupData":[]})).collect();
        let root=json!({"GameInfo":{"Version":643},"Player":{"CollectionSets":sets}});
        let bounded=inspect_collection_discovery(&root);
        assert_eq!(bounded.status,"partial_inconclusive");
        assert!(bounded.sampled);
    }

    #[test]
    fn unsupported_incompatible_and_missing_never_authorize_any_import() {
        let unsupported=json!({"GameInfo":{"Version":644},"Player":{"CollectionSets":[{
            "GroupData":[{"GroupsCollectionItems":{"101":true}}]}]}});
        assert_eq!(inspect_collection_discovery(&unsupported).status,"unsupported_schema");
        assert!(inspect_collection_discovery(&unsupported).entries.is_empty());
        assert_eq!(inspect_collection_discovery(&json!({"GameInfo":{"Version":643},
            "Player":{}})).status,"not_observed");
        assert_eq!(inspect_collection_discovery(&json!({"GameInfo":{"Version":643},
            "Player":{"CollectionSets":{}}})).status,"incompatible_structure");
        let empty=json!({"GameInfo":{"Version":624},"Player":{"CollectionSets":[]}}); 
        assert_eq!(inspect_collection_discovery(&empty).status,"observed_empty");
    }

    #[test]
    fn wasm_entrypoint_never_echoes_invalid_json_or_private_strings() {
        let invalid=probe_collection_discovery_json("{SENSITIVE_PERSONAL_DATA");
        assert!(invalid.contains("SAVE_COLLECTION_DISCOVERY_RUST_INVALID"));
        assert!(!invalid.contains("SENSITIVE_PERSONAL_DATA"));
        let good=probe_collection_discovery_json(&json!({"GameInfo":{"Version":643},
            "Player":{"CollectionSets":[{"GroupData":[
                {"GroupsCollectionItems":{"101":true}}]}],
                "PrivateToken":"never-export"}}).to_string());
        let p:Value=serde_json::from_str(&good).unwrap();
        assert_eq!(p["entries"][0]["itemId"],101);
        assert_eq!(p["ownershipVerified"],false);
        assert!(!good.contains("never-export"));
    }
}
