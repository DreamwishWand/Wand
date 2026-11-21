//! DB-05: immutable save-schema metadata used after an existing strict Codec.
//! No P1G decoder, no session admission, no Writer or re-serialization.
use serde::Deserialize;
use serde_json::Value;

pub const CONTRACT: &str = "wand.db05.save-readonly-inspection@1";
const REGISTRY: &str = include_str!("../../../data/ddv/save/registry.v1.json");

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

/// Shape inspection borrows a decoded Value. Passing this is not Codec proof.
/// The caller must separately retain the complete original bytes and verify
/// duplicate keys, full encoding, source build, and unknown reference closure.
pub fn inspect_decoded(document: &Value, build: &DeclaredBuild<'_>) -> ReadOnlyAssessment {
    let known = registry().ok().and_then(|registry| {
        registry.builds.into_iter().find(|candidate| {
            candidate.platform == build.platform
                && candidate.identity_kind == build.identity_kind
                && candidate.identity == build.identity
                && candidate.schema_version == build.schema_version
        })
    });
    let mut issues = Vec::new();
    if known.is_none() { issues.push("BUILD_OR_SCHEMA_NOT_REGISTERED"); }
    if !document.is_object() { issues.push("ROOT_MUST_BE_OBJECT"); }
    let info = document.get("GameInfo");
    if !info.is_some_and(Value::is_object) { issues.push("GAMEINFO_MUST_BE_OBJECT"); }
    let save_schema_version = info.and_then(|v| v.get("Version")).and_then(Value::as_u64);
    if save_schema_version.is_none() { issues.push("GAMEINFO_VERSION_MUST_BE_UNSIGNED_INTEGER"); }
    if known.is_some() && save_schema_version != Some(build.schema_version) { issues.push("SAVE_SCHEMA_MISMATCH"); }
    if !document.get("Player").is_some_and(Value::is_object) { issues.push("PLAYER_MUST_BE_OBJECT"); }
    if !document.get("World").is_some_and(Value::is_object) { issues.push("WORLD_MUST_BE_OBJECT"); }
    ReadOnlyAssessment {
        build_candidate: known.map(|candidate| candidate.key),
        save_schema_version,
        root_shape_valid: issues.is_empty(),
        issues,
        strict_decoder_verified: false,
        external_build_verified: false,
        reference_closure_verified: false,
        writer_authorized: false,
        export_authorized: false,
    }
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
        assert!(!inspect_decoded(&doc, &wrong).root_shape_valid);
        assert!(!inspect_decoded(&serde_json::json!({}), &switch626()).root_shape_valid);
    }
}
