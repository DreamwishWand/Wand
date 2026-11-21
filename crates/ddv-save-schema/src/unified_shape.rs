//! DB-05: borrowed observations of all 440 public save field templates.
//! This is not a strict JSON/P1G Codec or a Writer; never output private IDs.
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const CONTRACT: &str = "wand.db05.unified-shape-probe@1";
const MAX_INPUT_BYTES: usize = 128 * 1024 * 1024;
const MAX_BRANCH: usize = 32;
const MAX_NODES: usize = 1024;
const SOURCES: [&str; 6] = [
    include_str!("../../../data/ddv/save/legacy626-fields.v1.json"),
    include_str!("../../../data/ddv/save/common626643-fields.v1.json"),
    include_str!("../../../data/ddv/save/native1261-observed-fields.v1.json"),
    include_str!("../../../data/ddv/save/native1261-nested-fields.v1.json"),
    include_str!("../../../data/ddv/save/native1261-deep-fields.v1.json"),
    include_str!("../../../data/ddv/save/native1262-domain-fields.v1.json"),
];
struct Field { domain: String, path: String, allowed: Vec<String> }
fn catalog() -> Vec<Field> {
    let mut result = Vec::new();
    for (i, src) in SOURCES.iter().enumerate() {
        let meta: Value = serde_json::from_str(src).expect("Checked-in DB-05 metadata");
        for f in meta["fields"].as_array().expect("Field entries") {
            let allowed = match i {
                0 | 1 => f["type"].as_str().expect("Kind").split('|').map(str::to_owned).collect(),
                2 => vec![f["jsonType"].as_str().expect("Kind").to_owned()],
                _ => f["allowedJsonKinds"].as_array().expect("Kinds").iter()
                    .map(|v| v.as_str().expect("Kind").to_owned()).collect(),
            };
            result.push(Field {
                domain: f["domain"].as_str().expect("Domain").to_owned(),
                path: f["path"].as_str().expect("Path").to_owned(),
                allowed,
            });
        }
    }
    result
}
fn kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
        Value::Number(number) => match number.as_f64() {
            Some(n) if n.is_finite() && n.fract() == 0.0 &&
                n.abs() <= 9_007_199_254_740_991.0 => "integer",
            _ => "number",
        },
    }
}
fn wildcard(token: &str) -> bool {
    let Some(inner) = token.strip_prefix('{').and_then(|v| v.strip_suffix('}')) else {
        return false;
    };
    let mut chars = inner.chars();
    matches!(chars.next(), Some('a'..='z' | 'A'..='Z')) &&
        chars.all(|ch| ch.is_ascii_alphanumeric())
}
struct Observation { status: &'static str, kinds: Vec<String>, sampled: bool }
fn observe(root: &Value, field: &Field) -> Observation {
    let tokens: Vec<&str> = field.path.trim_start_matches('/').split('/').collect();
    let mut nodes = vec![root];
    let mut sampled = false;
    for (i, token) in tokens.iter().enumerate() {
        let last = i + 1 == tokens.len();
        let mut next = Vec::new();
        for node in nodes {
            let Some(object) = node.as_object() else { continue; };
            if wildcard(token) {
                if object.len() > MAX_BRANCH { sampled = true; }
                next.extend(object.values().take(MAX_BRANCH));
            } else if let Some(key) = token.strip_suffix("[]") {
                if let Some(child) = object.get(key) {
                    let Some(array) = child.as_array() else {
                        return Observation { status:"type_conflict", kinds:vec![], sampled };
                    };
                    if last { next.push(child); }
                    else {
                        if array.len() > MAX_BRANCH { sampled = true; }
                        next.extend(array.iter().take(MAX_BRANCH));
                    }
                }
            } else if let Some(value) = object.get(*token) { next.push(value); }
            if next.len() > MAX_NODES {
                next.truncate(MAX_NODES);
                sampled = true;
                break;
            }
        }
        nodes = next;
        if nodes.is_empty() {
            return Observation { status:"not_observed", kinds:vec![], sampled };
        }
    }
    let kinds: Vec<String> = nodes.iter().map(|v| kind(v).to_owned())
        .collect::<BTreeSet<_>>().into_iter().collect();
    let status = if kinds.iter().all(|k| field.allowed.contains(k)) {
        "observed"
    } else { "type_conflict" };
    Observation { status, kinds, sampled }
}
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct ObservedField { path: String, kinds: Vec<String> }
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DomainShape {
    domain: String, registered_field_count: usize, observed_field_count: usize,
    status: &'static str, observed_fields: Vec<ObservedField>,
    conflicting_paths: Vec<String>, sampled: bool, writer_authorized: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct UnifiedShape {
    contract: &'static str, public_template_count: usize,
    platform_and_version_used_as_gates: bool, native_build_attested: bool,
    domains: Vec<DomainShape>, exhaustive: bool, strict_decoder_verified: bool,
    writer_authorized: bool,
}
/// Input is already decoded and borrowed; result has only static public paths
/// and type names. No Build, platform or schema-number gate authorizes writing.
pub fn inspect_unified_shape(root: &Value) -> UnifiedShape {
    let fields = catalog();
    let mut groups: BTreeMap<&str, Vec<&Field>> = BTreeMap::new();
    for f in &fields { groups.entry(&f.domain).or_default().push(f); }
    let domains = groups.into_iter().map(|(domain, fields)| {
        let registered_field_count = fields.len();
        let mut observed_fields = Vec::new();
        let mut conflicting_paths = Vec::new();
        let mut sampled = false;
        for f in fields {
            let obs = observe(root, f);
            sampled |= obs.sampled;
            match obs.status {
                "observed" => observed_fields.push(ObservedField {
                    path:f.path.clone(), kinds:obs.kinds,
                }),
                "type_conflict" => conflicting_paths.push(f.path.clone()),
                _ => {}
            }
        }
        conflicting_paths.sort();
        let status = if !conflicting_paths.is_empty() { "shape_conflict" }
            else if observed_fields.is_empty() { "not_observed" }
            else if sampled { "sampled_candidate" } else { "shape_candidate" };
        DomainShape {
            domain:domain.to_owned(), registered_field_count,
            observed_field_count:observed_fields.len(), status,
            observed_fields, conflicting_paths, sampled, writer_authorized:false,
        }
    }).collect();
    UnifiedShape {
        contract:CONTRACT, public_template_count:fields.len(),
        platform_and_version_used_as_gates:false, native_build_attested:false,
        domains, exhaustive:false, strict_decoder_verified:false,
        writer_authorized:false,
    }
}
/// Must be invoked only AFTER an external strict duplicate-safe JSON Codec.
/// This parser never substitutes for original-byte preservation.
#[cfg_attr(feature="wasm", wasm_bindgen::prelude::wasm_bindgen)]
pub fn probe_unified_shape_json(decoded_json: &str) -> String {
    const ERROR: &str = r#"{"error":"DB05_UNIFIED_INPUT_INVALID","writerAuthorized":false,"exportAuthorized":false}"#;
    if decoded_json.len() > MAX_INPUT_BYTES { return ERROR.into(); }
    match serde_json::from_str::<Value>(decoded_json) {
        Ok(root) => serde_json::to_string(&inspect_unified_shape(&root))
            .expect("Redacted static output"),
        Err(_) => ERROR.into(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn six_source_classes_have_440_static_paths() {
        assert_eq!(catalog().len(), 440);
        let report = inspect_unified_shape(&json!({"GameInfo":{"Version":643},"Player":{},"World":{}}));
        assert_eq!(report.public_template_count, 440);
        assert_eq!(report.domains.iter().map(|d| d.registered_field_count).sum::<usize>(), 440);
        assert!(!report.writer_authorized && !report.native_build_attested);
        assert!(report.domains.iter().all(|d| !d.writer_authorized));
    }
    #[test]
    fn wildcard_probe_reports_public_paths_but_no_private_keys() {
        let doc = json!({"GameInfo":{"Version":626},"Player":{"ContainerInventories":{
            "8888":{"Inventory":[{"State":{"MealData":{"IngredientsUsed":[]}}}]}
        }},"World":{},"PrivatePlayerName":"DO_NOT_LOG_ME"});
        let report = probe_unified_shape_json(&doc.to_string());
        assert!(report.contains("/Player/ContainerInventories/{id}/Inventory[]/State/MealData"));
        assert!(!report.contains("8888") && !report.contains("DO_NOT_LOG_ME"));
        let parsed: Value = serde_json::from_str(&report).unwrap();
        assert_eq!(parsed["writerAuthorized"], false);
        assert_eq!(parsed["strictDecoderVerified"], false);
    }
    #[test]
    fn malformed_input_fails_closed_without_reflecting_input() {
        let r = probe_unified_shape_json("{PRIVATE_DATA_BAD");
        assert!(r.contains("DB05_UNIFIED_INPUT_INVALID"));
        assert!(!r.contains("PRIVATE_DATA_BAD"));
    }
}
