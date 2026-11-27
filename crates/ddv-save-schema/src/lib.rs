//! DB-05: immutable save-schema metadata used after an existing strict Codec.
//! No P1G decoder, no session admission, no Writer or re-serialization.
pub mod reference_graph;
pub mod unified_shape;
pub mod collection_discovery;
pub mod memory_flags;
pub mod avatar_appearance;
pub use memory_flags::{inspect_memory_flags,probe_collection_read_projections_json,MemoryFlags};
pub use collection_discovery::{inspect_collection_discovery, probe_collection_discovery_json, CollectionDiscovery};
pub use unified_shape::{inspect_unified_shape, probe_unified_shape_json, UnifiedShape};
pub use reference_graph::{inspect_references, probe_save_references_json, ReferenceProbe, RuleObservation};

use serde::Deserialize;
use serde_json::Value;

pub const CONTRACT: &str = "wand.db05.save-readonly-inspection@1";
const REGISTRY: &str = include_str!("../../../data/ddv/save/registry.v1.json");
const LEGACY_FIELDS: &str = include_str!("../../../data/ddv/save/legacy626-fields.v1.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCandidate {
    pub key: String,
    pub platform: String,
    pub game_version: String,
    pub schema_version: u64,
    pub identity_kind: String,
    pub identity: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct Registry {
    pub schema: String,
    pub builds: Vec<BuildCandidate>,
}

#[derive(Debug, Clone)]
pub struct DeclaredBuild<'a> {
    pub platform: &'a str,
    pub identity_kind: &'a str,
    pub identity: &'a str,
    pub schema_version: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ReadOnlyAssessment {
    pub build_candidate: Option<String>,
    pub save_schema_version: Option<u64>,
    pub compatibility_basis: &'static str,
    pub root_shape_valid: bool,
    pub issues: Vec<&'static str>,
    pub strict_decoder_verified: bool,
    pub external_build_verified: bool,
    pub reference_closure_verified: bool,
    pub writer_authorized: bool,
    pub export_authorized: bool,
}

pub fn registry() -> Result<Registry, serde_json::Error> {
    serde_json::from_str(REGISTRY)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyFieldMap {
    pub schema: String,
    pub save_schema_version: u64,
    pub fields: Vec<LegacyField>,
}

#[derive(Debug, Deserialize)]
pub struct LegacyField {
    pub domain: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub builds: Vec<String>,
    pub writable: bool,
    #[serde(rename = "idReference")]
    pub id_reference: Option<LegacyIdReference>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyIdReference {
    pub namespace: String,
    pub catalog: Option<String>,
    pub extraction: String,
    pub join: String,
    pub current_catalog_coverage_verified: bool,
    pub status: String,
}

pub fn legacy_fields() -> Result<LegacyFieldMap, serde_json::Error> {
    serde_json::from_str(LEGACY_FIELDS)
}

/// The observed decoded field shape is independent of platform/build/version.
/// The Codec still owns strict parsing, and this assessment cannot grant writes.
pub fn inspect_structure(document: &Value) -> ReadOnlyAssessment {
    let mut issues = Vec::new();
    if !document.is_object() { issues.push("ROOT_MUST_BE_OBJECT"); }
    let info = document.get("GameInfo");
    if !info.is_some_and(Value::is_object) { issues.push("GAMEINFO_MUST_BE_OBJECT"); }
    let save_schema_version = info.and_then(|v| v.get("Version")).and_then(Value::as_u64);
    if save_schema_version.is_none() { issues.push("GAMEINFO_VERSION_MUST_BE_UNSIGNED_INTEGER"); }
    if !document.get("Player").is_some_and(Value::is_object) { issues.push("PLAYER_MUST_BE_OBJECT"); }
    if !document.get("World").is_some_and(Value::is_object) { issues.push("WORLD_MUST_BE_OBJECT"); }
    ReadOnlyAssessment {
        build_candidate: None,
        save_schema_version,
        compatibility_basis: "decoded_field_shape",
        root_shape_valid: issues.is_empty(),
        issues,
        strict_decoder_verified: false,
        external_build_verified: false,
        reference_closure_verified: false,
        writer_authorized: false,
        export_authorized: false,
    }
}

/// Backwards compatible metadata lookup; candidate Build is never a gate
/// for decoded structural inspection. Caller-supplied Build is unverified.
pub fn inspect_decoded(document: &Value, build: &DeclaredBuild<'_>) -> ReadOnlyAssessment {
    let mut assessment = inspect_structure(document);
    assessment.build_candidate = registry().ok().and_then(|registry| {
        registry.builds.into_iter().find(|candidate| {
            candidate.platform == build.platform
                && candidate.identity_kind == build.identity_kind
                && candidate.identity == build.identity
                && candidate.schema_version == build.schema_version
        }).map(|candidate| candidate.key)
    });
    assessment
}

#[cfg(test)]
mod tests {
    use super::*;

    fn switch626<'a>() -> DeclaredBuild<'a> {
        DeclaredBuild { platform:"switch", identity_kind:"switch_bid", identity:"9A239D3DB569756D", schema_version:626 }
    }

    #[test]
    fn registry_is_versioned_and_sources_are_candidates() {
        let reg = registry().unwrap();
        assert_eq!(reg.schema, "wand.db05.save-registry@1");
        assert_eq!(reg.builds.len(), 3);
        let fields = legacy_fields().unwrap();
        assert_eq!(fields.save_schema_version, 626);
        assert_eq!(fields.fields.len(), 66);
        assert!(fields.fields.iter().any(|f| f.path == "/Player/MaleAvatar/Eyeball/ColorIndex2"));
        assert!(fields.fields.iter().all(|field| !field.writable));
        assert_eq!(fields.fields.iter().filter(|f| f.id_reference.is_some()).count(), 17);
        assert_eq!(fields.fields.iter().filter(|f| f.id_reference.as_ref().is_some_and(|r| r.namespace == "item")).count(), 14);
        assert!(fields.fields.iter().filter_map(|f| f.id_reference.as_ref()).all(|r| r.join == "exact_numeric_only" && !r.current_catalog_coverage_verified));
        assert!(reg.builds.iter().all(|build| build.status == "legacy_contract_candidate"));
    }

    #[test]
    fn synthetic_json_is_read_only_and_fails_closed() {
        let doc = serde_json::json!({"GameInfo":{"Version":626,"Extra":1},"Player":{},"World":{},"Extra":true});
        let ok = inspect_decoded(&doc, &switch626());
        assert!(ok.root_shape_valid);
        assert!(!ok.writer_authorized && !ok.export_authorized && !ok.external_build_verified);
        let mut wrong = switch626();
        wrong.schema_version = 643;
        assert!(inspect_decoded(&doc, &wrong).root_shape_valid);
        assert!(inspect_decoded(&doc, &wrong).build_candidate.is_none());
        assert_eq!(inspect_structure(&doc).compatibility_basis, "decoded_field_shape");
        let version_changed = serde_json::json!({"GameInfo":{"Version":643},"Player":{},"World":{}});
        assert!(inspect_structure(&version_changed).root_shape_valid);
        assert_eq!(inspect_decoded(&version_changed, &switch626()).save_schema_version, Some(643));
        assert!(!inspect_decoded(&serde_json::json!({}), &switch626()).root_shape_valid);
    }
}
