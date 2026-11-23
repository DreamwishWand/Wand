//! Read-only positive ListInventory stock witness. Actual Save traversal lives
//! in Rust, never in the browser's main thread. Positive saved Amount proves
//! an observed inventory entry, not Collection completion, DLC rights or a
//! negative (missing/unowned) state. Steam 1.26.2 getter parity is unverified.
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const CONTRACT: &str = "wand.collection.positive-list-inventory@1";
const MAX_ROLES: usize = 32;
const MAX_KEYS: usize = 20_000;
const MAX_AMOUNT: u64 = 2_147_483_647;
const MAX_SAFE_ID: u64 = 9_007_199_254_740_991;
const MAX_INPUT_BYTES: usize = 128 * 1024 * 1024;
const ERROR: &str = r#"{"error":"SAVED_LIST_OWNERSHIP_RUST_INVALID","gameSaveModified":false}"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositiveStockItem {
    pub item_id: u64,
    pub role: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositiveListInventory {
    pub contract: &'static str,
    pub status: &'static str,
    pub save_schema: Option<i64>,
    pub inspected_roles: usize,
    pub matched_roles: usize,
    pub positive_references: usize,
    pub zero_references: usize,
    pub invalid_references: usize,
    pub unverified_roles: usize,
    pub ambiguous_item_ids: usize,
    pub sampled: bool,
    pub entries: Vec<PositiveStockItem>,
    pub semantic: &'static str,
    pub missing_status_inferred: bool,
    pub zero_amount_means_missing: bool,
    pub inventory_type_verified_by_role: bool,
    pub current_steam_native_equivalent_proven: bool,
    pub game_save_modified: bool,
    pub personal_data_published: bool,
}

fn version(root: &Value) -> Option<i64> {
    let value = root.get("GameInfo")?.get("Version")?;
    let signed = value.as_i64().or_else(||value.as_u64()
        .filter(|v| *v <= MAX_SAFE_ID).map(|v| v as i64))?;
    (signed.unsigned_abs() <= MAX_SAFE_ID).then_some(signed)
}
fn canonical_id(key: &str) -> Option<u64> {
    let id = key.parse::<u64>().ok()?;
    (id > 0 && id <= MAX_SAFE_ID && id.to_string() == key).then_some(id)
}
// Keys 0..12 map to original ListInventory getters and matching saved
// CompatibleItemType. Role 6 (TouchOfMagic) intentionally excluded:
// ItemType 10 contains both collectible Decal and system Texture items.
fn signature(key: &str) -> Option<(&'static str, u64)> {
    match key {
        "0" => Some(("Furniture", 4)),
        "1" => Some(("Clothing", 5)),
        "2" => Some(("ActivityItem", 3)),
        "3" => Some(("Makeup", 14)),
        "4" => Some(("Trimming", 16)),
        "5" => Some(("Building", 2)),
        "7" => Some(("Skin", 17)),
        "8" => Some(("BoardGame", 18)),
        "9" => Some(("AvatarFeature", 7)),
        "10" => Some(("PhotoMode", 19)),
        "11" => Some(("MountGear", 21)),
        "12" => Some(("Environment", 6)),
        _ => None,
    }
}
fn compatible(actual: Option<&Value>, name: &str, item_type: u64) -> bool {
    actual.is_some_and(|value|
        value.as_u64() == Some(item_type) ||
        value.as_str().is_some_and(|s| s.eq_ignore_ascii_case(name)))
}
fn matching_id(record: &serde_json::Map<String,Value>, key: &str) -> bool {
    !record.contains_key("ID") ||
        record.get("ID").and_then(Value::as_u64) ==
            key.parse::<u64>().ok()
}

pub fn inspect_positive_list_inventory(root: &Value) -> PositiveListInventory {
    let save_schema = version(root);
    let supported = matches!(save_schema, Some(624 | 643));
    let player = root.get("Player").and_then(Value::as_object);
    let observed_field = player.is_some_and(|p| p.contains_key("ListInventories"));
    let map = player.and_then(|p|p.get("ListInventories")).and_then(Value::as_object);
    let mut inspected_roles = 0;
    let mut matched_roles = 0;
    let mut positive_references = 0;
    let mut zero_references = 0;
    let mut invalid_references = 0;
    let mut unverified_roles = 0;
    let mut sampled = false;
    let mut positive = BTreeMap::<u64, &'static str>::new();
    let mut ambiguous = HashSet::<u64>::new();

    if supported {
        if let Some(map) = map {
            if map.len() > MAX_ROLES { sampled = true; }
            for (role_key, value) in map.iter().take(MAX_ROLES) {
                let Some((role, item_type)) = signature(role_key) else { continue; };
                inspected_roles += 1;
                let Some(inv) = value.as_object() else {
                    unverified_roles += 1;
                    continue;
                };
                let Some(entries) = inv.get("Inventory").and_then(Value::as_object) else {
                    unverified_roles += 1;
                    continue;
                };
                if !compatible(inv.get("CompatibleItemType"), role, item_type) ||
                    !matching_id(inv,role_key) {
                    unverified_roles += 1;
                    continue;
                }
                matched_roles += 1;
                for (key, raw) in entries {
                    if positive_references + zero_references + invalid_references >= MAX_KEYS {
                        sampled = true;
                        break;
                    }
                    let id = canonical_id(key);
                    let amount = raw.get("Amount").and_then(Value::as_u64);
                    if !id.is_some_and(|id| id/10_000_000 == item_type) ||
                        !amount.is_some_and(|n| n <= MAX_AMOUNT) ||
                        !raw.is_object() {
                        invalid_references += 1;
                        continue;
                    }
                    if amount == Some(0) {
                        zero_references += 1;
                        continue;
                    }
                    positive_references += 1;
                    let id = id.expect("validated above");
                    if positive.insert(id, role).is_some() {
                        ambiguous.insert(id);
                    }
                }
            }
        }
    }
    let entries = positive.into_iter()
        .filter(|(id,_)| !ambiguous.contains(id))
        .map(|(item_id,role)| PositiveStockItem{item_id,role})
        .collect::<Vec<_>>();
    let status = if !supported { "unsupported_schema" }
        else if !observed_field { "not_observed" }
        else if map.is_none() { "incompatible_structure" }
        else if sampled || invalid_references>0 || unverified_roles>0 ||
            !ambiguous.is_empty() { "partial_inconclusive" }
        else if positive_references>0 { "positive_stock_observed" }
        else { "observed_no_positive_stock" };
    PositiveListInventory {
        contract: CONTRACT, status, save_schema, inspected_roles, matched_roles,
        positive_references, zero_references, invalid_references,
        unverified_roles, ambiguous_item_ids: ambiguous.len(), sampled, entries,
        semantic: "explicit_positive_list_amount_only",
        missing_status_inferred: false, zero_amount_means_missing: false,
        inventory_type_verified_by_role: true,
        current_steam_native_equivalent_proven: false,
        game_save_modified: false, personal_data_published: false,
    }
}
/// Called after strict local plaintext/P1G decoding. No arbitrary Save data
/// leaves the Worker: only canonical IDs, role names and bounded counters.
#[cfg_attr(feature="wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub fn probe_positive_list_inventory_json(decoded_json: &str) -> String {
    if decoded_json.len()>MAX_INPUT_BYTES { return ERROR.to_owned(); }
    match serde_json::from_str::<Value>(decoded_json) {
        Ok(root) => serde_json::to_string(&inspect_positive_list_inventory(&root))
            .expect("summary contains fixed safe fields only"),
        Err(_) => ERROR.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_positive_exact_stock_is_observed_without_private_data() {
        let source = json!({"GameInfo":{"Version":643},"Player":{
            "Secret":"private-identity", "ListInventories":{
                "0":{"ID":0,"CompatibleItemType":"Furniture",
                    "Inventory":{"40005160":{"Amount":2,"Marker":"secret-marker"},
                        "40006110":{"Amount":0},
                        "40005161":{"Amount":1}}},
                "1":{"ID":1,"CompatibleItemType":5,
                    "Inventory":{"50000001":{"Amount":1}}},
                "6":{"ID":6,"CompatibleItemType":10,
                    "Inventory":{"100000731":{"Amount":8}}}
            }}});
        let before = source.clone();
        let projected = inspect_positive_list_inventory(&source);
        assert_eq!(source,before);
        assert_eq!(projected.status,"positive_stock_observed");
        assert_eq!(projected.positive_references,3);
        assert_eq!(projected.zero_references,1);
        assert_eq!(projected.entries,vec![
            PositiveStockItem{item_id:40005160,role:"Furniture"},
            PositiveStockItem{item_id:40005161,role:"Furniture"},
            PositiveStockItem{item_id:50000001,role:"Clothing"}
        ]);
        let result = serde_json::to_string(&projected).unwrap();
        for secret in ["private-identity","secret-marker","Inventory","100000731"] {
            assert!(!result.contains(secret),"private field: {secret}");
        }
        assert!(!result.contains(r#""Amount":"#));
        assert!(!projected.missing_status_inferred &&
            !projected.current_steam_native_equivalent_proven);
    }
    #[test]
    fn compatible_role_and_item_type_are_both_required() {
        let p=inspect_positive_list_inventory(&json!({"GameInfo":{"Version":643},
            "Player":{"ListInventories":{
                "0":{"ID":0,"CompatibleItemType":"Clothing",
                    "Inventory":{"40005160":{"Amount":1}}},
                "1":{"ID":1,"CompatibleItemType":"Clothing",
                    "Inventory":{"50000001":{"Amount":1}}},
                "11":{"ID":11,"CompatibleItemType":21,
                    "Inventory":{"190000023":{"Amount":1}}}
            }}}));
        assert_eq!(p.status,"partial_inconclusive");
        assert_eq!(p.unverified_roles,1);
        assert_eq!(p.invalid_references,1);
        assert_eq!(p.entries,vec![PositiveStockItem{item_id:50000001,role:"Clothing"}]);
    }
    #[test]
    fn missing_or_invalid_amount_does_not_mark_owned() {
        let p=inspect_positive_list_inventory(&json!({"GameInfo":{"Version":624},
            "Player":{"ListInventories":{
                "0":{"ID":0,"CompatibleItemType":4,"Inventory":{
                    "40005160":{"Amount":0},"40005161":{"Amount":-1},
                    "40005162":{"Amount":"2"},"40005163":{"Amount":1.5},
                    "40005164":{"Amount":2147483648u64},
                    "40005165":{"Marker":"none"},"040005160":{"Amount":1}
                }}
            }}}));
        assert_eq!(p.status,"partial_inconclusive");
        assert_eq!(p.zero_references,1);
        assert_eq!(p.invalid_references,6);
        assert!(p.entries.is_empty());
    }
    #[test]
    fn unknown_schema_or_missing_map_is_inconclusive() {
        let unsupported=json!({"GameInfo":{"Version":644},
            "Player":{"ListInventories":{"0":{"Inventory":{"40005160":{"Amount":2}}}}}});
        assert_eq!(inspect_positive_list_inventory(&unsupported).status,"unsupported_schema");
        assert!(inspect_positive_list_inventory(&unsupported).entries.is_empty());
        assert_eq!(inspect_positive_list_inventory(&json!({"GameInfo":{"Version":643},
            "Player":{}})).status,"not_observed");
        assert_eq!(inspect_positive_list_inventory(&json!({"GameInfo":{"Version":643},
            "Player":{"ListInventories":[]}})).status,"incompatible_structure");
    }
    #[test]
    fn malformed_text_cannot_echo_private_input() {
        let result=probe_positive_list_inventory_json("{SECRET_DATA");
        assert!(result.contains("SAVED_LIST_OWNERSHIP_RUST_INVALID"));
        assert!(!result.contains("SECRET_DATA"));
    }
}
