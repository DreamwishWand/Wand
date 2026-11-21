//! Read-only DB-05 references, compiled from the same 14 public native path rules
//! used by the JS diagnostic adapter. This is NOT a P1G decoder or Writer.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

const SOURCE: &str = include_str!("../../../data/ddv/save/reference-relations.v1.json");
const CONTRACT: &str = "wand.db05.save-reference-probe@1";
const MAX_COLLECTION: usize = 4096;
const MAX_VISITS: usize = 65_536;
const MAX_SAFE_ID: u64 = 9_007_199_254_740_991;
const MAX_INPUT_BYTES: usize = 128 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Rules {
    schema: String,
    index_templates: IndexTemplates,
    rules: Vec<Rule>,
}
#[derive(Deserialize)]
struct IndexTemplates {
    container: String,
    grid: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Rule {
    id: String,
    source_public_template: String,
    traversal_template: String,
    mode: String,
    target_index: Option<String>,
}

#[derive(Default)]
struct Scan {
    visited: usize,
    sampled: bool,
    type_issues: usize,
}
#[derive(Default)]
struct Index {
    ids: HashSet<u64>,
    available: bool,
    sampled: bool,
    type_issues: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleObservation {
    pub id: String,
    pub source_public_template: String,
    pub mode: String,
    pub target_index: Option<String>,
    pub status: &'static str,
    pub observed: usize,
    pub resolved: usize,
    pub unresolved: usize,
    pub missing: usize,
    pub malformed: usize,
    pub type_issues: usize,
    pub sampled: bool,
    pub writer_authorized: bool,
}
#[derive(Debug, Serialize)]
pub struct IndexSizes {
    pub container: usize,
    pub grid: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceProbe {
    pub contract: &'static str,
    pub status: &'static str,
    pub root_valid: bool,
    pub rules: Vec<RuleObservation>,
    pub index_sizes: IndexSizes,
    pub platform_and_version_used_as_gates: bool,
    pub reference_closure_verified: bool,
    pub exhaustive: bool,
    pub writer_authorized: bool,
    pub export_authorized: bool,
}

fn valid_id(value: &Value) -> Option<u64> {
    value.as_u64().filter(|n| *n <= MAX_SAFE_ID)
}
fn map_id(text: &str) -> Option<u64> {
    let parsed = text.parse::<u64>().ok()?;
    (parsed <= MAX_SAFE_ID && parsed.to_string() == text).then_some(parsed)
}
fn is_map_token(token: &str) -> bool {
    token.starts_with('{') && token.ends_with('}')
        && token.len() > 2 && token[1..token.len()-1]
            .bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
/// Traversal counts *each visited node*, not just leaves, so nested maps
/// cannot bypass the 65k budget by containing absent descendants.
/// Keys/values are passed to a local callback, never copied to reports.
fn descend<'a, F>(
    node: &'a Value, tokens: &[&str], map_key: Option<&'a str>,
    scan: &mut Scan, visit: &mut F
) where F: FnMut(&'a Value, Option<&'a str>) {
    if scan.visited >= MAX_VISITS { scan.sampled = true; return; }
    scan.visited += 1;
    if tokens.is_empty() { visit(node, map_key); return; }
    let token = tokens[0];
    let rest = &tokens[1..];
    if is_map_token(token) {
        let Some(map) = node.as_object() else { scan.type_issues += 1; return; };
        if map.len() > MAX_COLLECTION { scan.sampled = true; }
        for (key, value) in map.iter().take(MAX_COLLECTION) {
            if scan.visited >= MAX_VISITS { scan.sampled = true; break; }
            descend(value, rest, Some(key), scan, visit);
        }
    } else if let Some(name) = token.strip_suffix("[]") {
        let Some(map) = node.as_object() else { scan.type_issues += 1; return; };
        let Some(array_value) = map.get(name) else { return; };
        let Some(array) = array_value.as_array() else { scan.type_issues += 1; return; };
        if array.len() > MAX_COLLECTION { scan.sampled = true; }
        for value in array.iter().take(MAX_COLLECTION) {
            if scan.visited >= MAX_VISITS { scan.sampled = true; break; }
            descend(value, rest, map_key, scan, visit);
        }
    } else {
        let Some(map) = node.as_object() else { scan.type_issues += 1; return; };
        if let Some(value) = map.get(token) {
            descend(value, rest, map_key, scan, visit);
        }
    }
}
fn walk<'a, F>(root: &'a Value, path: &str, mut f: F) -> Scan
where F: FnMut(&'a Value, Option<&'a str>) {
    let tokens: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    let mut scan = Scan::default();
    descend(root, &tokens, None, &mut scan, &mut f);
    scan
}

fn build_index(root: &Value, paths: &[&str]) -> Index {
    let mut index = Index::default();
    for path in paths {
        let scan = walk(root, path, |node, _| {
            let Some(map) = node.as_object() else { index.type_issues += 1; return; };
            index.available = true;
            if map.len() > MAX_COLLECTION { index.sampled = true; }
            for key in map.keys().take(MAX_COLLECTION) {
                if let Some(id) = map_id(key) { index.ids.insert(id); }
                else { index.type_issues += 1; }
            }
        });
        index.sampled |= scan.sampled;
        index.type_issues += scan.type_issues;
    }
    index
}
fn inspect_rule(root: &Value, rule: &Rule, container: &Index, grid: &Index)
    -> RuleObservation {
    let identity = rule.mode == "id_matches_map_key";
    let path = if identity {
        rule.traversal_template.strip_suffix("/ID").unwrap_or(&rule.traversal_template)
    } else { &rule.traversal_template };
    let target = match rule.target_index.as_deref() {
        Some("container") => Some(container),
        Some("grid") => Some(grid),
        _ => None
    };
    let mut observed = 0;
    let mut resolved = 0;
    let mut unresolved = 0;
    let mut missing = 0;
    let mut malformed = 0;
    let scan = walk(root, path, |node, key| {
        observed += 1;
        if identity {
            let Some(map) = node.as_object() else { malformed += 1; return; };
            let Some(internal) = map.get("ID") else { missing += 1; return; };
            let (Some(id), Some(key)) = (valid_id(internal), key.and_then(map_id))
            else { malformed += 1; return; };
            if id == key { resolved += 1; } else { unresolved += 1; }
        } else {
            let Some(id) = valid_id(node) else { malformed += 1; return; };
            let Some(index) = target else { missing += 1; return; };
            if !index.available { missing += 1; }
            else if index.ids.contains(&id) { resolved += 1; }
            else { unresolved += 1; }
        }
    });
    let sampled = scan.sampled || target.is_some_and(|x| x.sampled);
    let type_issues = scan.type_issues + target.map_or(0, |x| x.type_issues);
    let status = if type_issues > 0 || malformed > 0 || unresolved > 0 {
        "observed_anomaly"
    } else if observed == 0 {
        "not_observed"
    } else if sampled {
        "sampled_inconclusive"
    } else if missing > 0 {
        "insufficient_evidence"
    } else { "observed_consistent" };
    RuleObservation {
        id: rule.id.clone(), source_public_template: rule.source_public_template.clone(),
        mode: rule.mode.clone(), target_index: rule.target_index.clone(),
        status, observed, resolved, unresolved, missing, malformed,
        type_issues, sampled, writer_authorized: false,
    }
}
fn empty_probe() -> ReferenceProbe {
    ReferenceProbe {
        contract: CONTRACT, status: "invalid_root", root_valid: false,
        rules: Vec::new(), index_sizes: IndexSizes { container: 0, grid: 0 },
        platform_and_version_used_as_gates: false,
        reference_closure_verified: false, exhaustive: false,
        writer_authorized: false, export_authorized: false,
    }
}
/// An observation can never authorize save mutation or export.
/// Numeric-ID mismatches indicate candidates to investigate, not corruption.
pub fn inspect_references(root: &Value) -> ReferenceProbe {
    if !root.get("Player").is_some_and(Value::is_object) ||
       !root.get("World").is_some_and(Value::is_object) {
        return empty_probe();
    }
    let rules: Rules = serde_json::from_str(SOURCE).expect("Pinned DB-05 relation manifest");
    assert_eq!(rules.schema, "wand.db05.save-reference-relations@1");
    assert_eq!(rules.rules.len(), 14);
    let container = build_index(root, &[&rules.index_templates.container]);
    let grid_paths: Vec<&str> = rules.index_templates.grid.iter().map(String::as_str).collect();
    let grid = build_index(root, &grid_paths);
    let reports: Vec<_> = rules.rules.iter()
        .map(|rule| inspect_rule(root, rule, &container, &grid)).collect();
    let anomaly = reports.iter().any(|r| r.status == "observed_anomaly")
        || container.type_issues > 0 || grid.type_issues > 0;
    let incomplete = reports.iter().any(|r| {
        matches!(r.status, "not_observed" | "insufficient_evidence" | "sampled_inconclusive")
    }) || !container.available || !grid.available || container.sampled || grid.sampled;
    ReferenceProbe {
        contract: CONTRACT,
        status: if anomaly { "observed_anomaly" } else if incomplete { "inconclusive" }
                else { "observed_consistent" },
        root_valid: true,
        rules: reports,
        index_sizes: IndexSizes { container: container.ids.len(), grid: grid.ids.len() },
        platform_and_version_used_as_gates: false,
        reference_closure_verified: false, exhaustive: false,
        writer_authorized: false, export_authorized: false,
    }
}

/// Standalone read-only WASM entrypoint for already-decoded JSON supplied by
/// an existing strict Codec. This function is NOT a strict P1G decoder.
/// It never returns the JSON itself or any raw map keys / IDs.
#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub fn probe_save_references_json(decoded_json: &str) -> String {
    let result = if decoded_json.len() > MAX_INPUT_BYTES {
        empty_probe()
    } else {
        match serde_json::from_str::<Value>(decoded_json) {
            Ok(root) => inspect_references(&root),
            Err(_) => empty_probe(),
        }
    };
    serde_json::to_string(&result).expect("Anonymous DB-05 output serialization")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(version: u64) -> Value {
        serde_json::json!({
            "GameInfo":{"Version":version},
            "Player":{"ContainerInventories":{
                "31":{"ID":31,"Inventory":[]},
                "32":{"ID":32,"Inventory":[]}
            }},
            "World":{
                "GridCollection":{
                    "Grids":{
                        "0":{"ID":0,"Objects":{
                            "7":{"ID":7,"State":{"Storage":{"ContainerInventoryID":31},
                                "SubGrid":{"GridID":20}}}}},
                        "10":{"ID":10,"Objects":{
                            "8":{"ID":8,"State":{"Storage":{"ContainerInventoryID":32},
                                "SubGrid":{"GridID":0}}}}}
                    },
                    "DiffGrids":{
                        "20":{"ID":20,"ModifiedObjects":{
                            "9":{"ID":9,"State":{"Storage":{"ContainerInventoryID":31},
                                "SubGrid":{"GridID":10}}}}}
                    }
                },
                "PlayerHouses":[{"Floors":[{"Rooms":{
                    "1":{"FloorGridID":10,"WallGridIDs":{"1":0,"2":20}}
                }}]}],
                "BuildingInfos":{"5":{"GridIDs":{"List":[0,20]}}},
                "Villages":[{"Areas":{"7":{"GridIDs":[0,10,20]}}}],
                "FloatingIslands":{"8":{"GridIDs":[20,0]}}
            }
        })
    }
    fn rule<'a>(result: &'a ReferenceProbe, name: &str) -> &'a RuleObservation {
        result.rules.iter().find(|rule| rule.id == name).unwrap()
    }

    #[test]
    fn native_manifest_and_readonly_observation_reconcile_626_643() {
        for version in [626, 643] {
            let data = fixture(version);
            let expected = data.clone();
            let result = inspect_references(&data);
            assert_eq!(result.contract, CONTRACT);
            assert_eq!(result.status, "observed_consistent");
            assert_eq!(result.rules.len(), 14);
            assert_eq!(result.index_sizes.grid, 3);
            assert_eq!(result.index_sizes.container, 2);
            assert_eq!(rule(&result, "placed_storage_to_container").resolved, 2);
            assert_eq!(rule(&result, "house_walls_to_grid").resolved, 2);
            assert_eq!(rule(&result, "village_area_to_grid").resolved, 3);
            assert!(result.rules.iter().all(|r| r.status == "observed_consistent"));
            assert_eq!(data, expected, "read-only inspection must not mutate save");
            assert!(!result.reference_closure_verified);
            assert!(!result.writer_authorized);
            assert!(!result.export_authorized);
        }
    }
    #[test]
    fn missing_reference_type_mismatch_and_null_are_separate() {
        let mut data = fixture(643);
        data["Player"]["ContainerInventories"]["32"].as_object_mut().unwrap().remove("ID");
        data["World"]["GridCollection"]["Grids"]["10"]["Objects"]["8"]["ID"] =
            serde_json::json!(999);
        data["World"]["GridCollection"]["Grids"]["0"]["Objects"]["7"]
            ["State"]["Storage"]["ContainerInventoryID"] = serde_json::json!(987654321);
        let report = inspect_references(&data);
        assert_eq!(report.status, "observed_anomaly");
        assert_eq!(rule(&report, "container_key_identity").missing, 1);
        assert_eq!(rule(&report, "grid_object_key_identity").unresolved, 1);
        assert_eq!(rule(&report, "placed_storage_to_container").unresolved, 1);
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("987654321"));
        assert!(!serialized.contains("\"999\""));
    }
    #[test]
    fn incomplete_indexes_are_unknown_not_fabricated_orphans() {
        let mut data = fixture(643);
        data["Player"].as_object_mut().unwrap().remove("ContainerInventories");
        let report = inspect_references(&data);
        let links = rule(&report, "placed_storage_to_container");
        assert_eq!(links.unresolved, 0);
        assert_eq!(links.missing, 2);
        assert_eq!(links.status, "insufficient_evidence");
        assert_eq!(report.status, "inconclusive");
    }
    #[test]
    fn oversized_nested_maps_are_bounded_and_non_authoritative() {
        let mut data = fixture(643);
        let records = data["Player"]["ContainerInventories"].as_object_mut().unwrap();
        for n in 100..4300_u64 {
            records.insert(n.to_string(), serde_json::json!({"ID":n}));
        }
        let report = inspect_references(&data);
        assert!(rule(&report, "container_key_identity").sampled);
        assert_eq!(report.status, "inconclusive");
        assert!(!report.reference_closure_verified);
    }
    #[test]
    fn public_json_interface_is_anonymous_and_fails_closed() {
        let input = fixture(626);
        let json = input.to_string();
        let report = probe_save_references_json(&json);
        assert_eq!(serde_json::from_str::<Value>(&report).unwrap()["rules"]
            .as_array().unwrap().len(), 14);
        assert_eq!(probe_save_references_json("{bad").contains("invalid_root"), true);
        assert!(!report.contains("ContainerInventories/31"));
        assert!(!report.contains("\"ContainerInventoryID\":31"));
        assert!(!report.contains("\"GridID\":20"));
    }
}
