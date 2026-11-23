//! Local-only original DB-04 ZIP reader. This is NOT a Save codec,
//! a native-source authenticity proof, or a World placement validator.
//! All byte processing, decompression and source SHA-256 checks are in Rust.
use flate2::read::DeflateDecoder;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Read;
use wasm_bindgen::prelude::*;

const MAX_ZIP: usize = 96 * 1024 * 1024;
const MAX_MEMBER: usize = 64 * 1024 * 1024;
const MAX_TOTAL: usize = 256 * 1024 * 1024;
const MAX_MEMBERS: usize = 80;
const MAX_MANIFEST: usize = 2 * 1024 * 1024;
const FAMILIES: [&str; 7] =
    ["objects", "scenes", "grids", "layouts", "worlds", "areas", "layoutObjects"];

#[derive(Clone)]
struct Member {
    data: usize,
    compressed: usize,
    uncompressed: usize,
    method: u16,
}

type DecodeResult<T> = Result<T, String>;
fn bad(message: &str) -> String { format!("DB04_LOCAL_WORLD_ZIP: {message}") }
fn u16_at(bytes: &[u8], start: usize) -> DecodeResult<u16> {
    let part = bytes.get(start..start.checked_add(2).ok_or_else(|| bad("invalid ZIP boundary"))?)
        .ok_or_else(|| bad("invalid ZIP boundary"))?;
    Ok(u16::from_le_bytes([part[0], part[1]]))
}
fn u32_at(bytes: &[u8], start: usize) -> DecodeResult<u32> {
    let part = bytes.get(start..start.checked_add(4).ok_or_else(|| bad("invalid ZIP boundary"))?)
        .ok_or_else(|| bad("invalid ZIP boundary"))?;
    Ok(u32::from_le_bytes([part[0], part[1], part[2], part[3]]))
}
fn range(bytes: &[u8], offset: usize, size: usize) -> DecodeResult<&[u8]> {
    bytes.get(offset..offset.checked_add(size).ok_or_else(|| bad("invalid ZIP boundary"))?)
        .ok_or_else(|| bad("invalid ZIP boundary"))
}
fn simple_json_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".json") else { return false; };
    let mut chars = stem.bytes();
    chars.next().is_some_and(|b| b.is_ascii_alphabetic())
        && chars.all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
fn valid_member_name(name: &str) -> bool {
    simple_json_name(name)
        || name.strip_prefix("diagnostics/").is_some_and(simple_json_name)
}
fn parse_members(bytes: &[u8]) -> DecodeResult<BTreeMap<String, Member>> {
    if bytes.len() < 22 || bytes.len() > MAX_ZIP {
        return Err(bad("invalid/oversized ZIP"));
    }
    let search_from = bytes.len().saturating_sub(22 + 65535);
    let mut eocd = None;
    for pos in (search_from..=bytes.len() - 22).rev() {
        if u32_at(bytes, pos)? == 0x06054b50
            && pos + 22 + u16_at(bytes, pos + 20)? as usize == bytes.len() {
            eocd = Some(pos);
            break;
        }
    }
    let eocd = eocd.ok_or_else(|| bad("missing ZIP central directory"))?;
    if u16_at(bytes, eocd + 4)? != 0 || u16_at(bytes, eocd + 6)? != 0
        || u16_at(bytes, eocd + 8)? != u16_at(bytes, eocd + 10)? {
        return Err(bad("multipart ZIP not supported"));
    }
    let count = u16_at(bytes, eocd + 10)? as usize;
    let central_size = u32_at(bytes, eocd + 12)? as usize;
    let central_offset = u32_at(bytes, eocd + 16)? as usize;
    if count == 0 || count > MAX_MEMBERS || central_size == u32::MAX as usize
        || central_offset == u32::MAX as usize
        || central_offset.checked_add(central_size) != Some(eocd) {
        return Err(bad("unsupported ZIP directory size"));
    }
    range(bytes, central_offset, central_size)?;
    let mut cursor = central_offset;
    let mut total = 0usize;
    let mut entries = BTreeMap::new();
    for _ in 0..count {
        if cursor.checked_add(46).is_none_or(|end| end > eocd)
            || u32_at(bytes, cursor)? != 0x02014b50 {
            return Err(bad("invalid ZIP central header"));
        }
        let flags = u16_at(bytes, cursor + 8)?;
        let method = u16_at(bytes, cursor + 10)?;
        let compressed = u32_at(bytes, cursor + 20)? as usize;
        let uncompressed = u32_at(bytes, cursor + 24)? as usize;
        let name_length = u16_at(bytes, cursor + 28)? as usize;
        let extra_length = u16_at(bytes, cursor + 30)? as usize;
        let comment_length = u16_at(bytes, cursor + 32)? as usize;
        let disk = u16_at(bytes, cursor + 34)?;
        let local = u32_at(bytes, cursor + 42)? as usize;
        let next = cursor.checked_add(46)
            .and_then(|n| n.checked_add(name_length))
            .and_then(|n| n.checked_add(extra_length))
            .and_then(|n| n.checked_add(comment_length))
            .ok_or_else(|| bad("malformed ZIP member header"))?;
        if next > eocd || name_length == 0 { return Err(bad("malformed ZIP member header")); }
        if flags & (0x0001 | 0x0020 | 0x0040) != 0 || disk != 0
            || !matches!(method, 0 | 8)
            || compressed == u32::MAX as usize || uncompressed == u32::MAX as usize
            || local == u32::MAX as usize || uncompressed > MAX_MEMBER
            || (method == 0 && compressed != uncompressed) {
            return Err(bad("unsupported or oversized ZIP member"));
        }
        let name_bytes = range(bytes, cursor + 46, name_length)?;
        let name = std::str::from_utf8(name_bytes)
            .map_err(|_| bad("unexpected ZIP entry path"))?;
        if !valid_member_name(name) { return Err(bad("unexpected ZIP entry path")); }
        if u32_at(bytes, local)? != 0x04034b50
            || u16_at(bytes, local + 8)? != method
            || u16_at(bytes, local + 6)? != flags {
            return Err(bad("ZIP local/central header disagreement"));
        }
        let local_name_length = u16_at(bytes, local + 26)? as usize;
        let local_extra_length = u16_at(bytes, local + 28)? as usize;
        if local_name_length != name_length
            || range(bytes, local + 30, name_length)? != name_bytes {
            return Err(bad("ZIP local member name mismatch"));
        }
        let data = local.checked_add(30)
            .and_then(|n| n.checked_add(local_name_length))
            .and_then(|n| n.checked_add(local_extra_length))
            .ok_or_else(|| bad("invalid ZIP boundary"))?;
        let end = data.checked_add(compressed).ok_or_else(|| bad("invalid ZIP boundary"))?;
        if end > central_offset || range(bytes, data, compressed).is_err() {
            return Err(bad("ZIP member overlaps central directory"));
        }
        total = total.checked_add(uncompressed).ok_or_else(|| bad("oversized ZIP expansion"))?;
        if total > MAX_TOTAL { return Err(bad("oversized ZIP expansion")); }
        if entries.insert(name.to_owned(), Member {
            data, compressed, uncompressed, method
        }).is_some() { return Err(bad("duplicate ZIP member")); }
        cursor = next;
    }
    if cursor != eocd { return Err(bad("invalid ZIP directory terminator")); }
    if !entries.contains_key("manifest.json") { return Err(bad("missing DB-04 manifest")); }
    Ok(entries)
}

fn unpack(bytes: &[u8], member: &Member) -> DecodeResult<Vec<u8>> {
    let raw = range(bytes, member.data, member.compressed)?;
    if member.method == 0 {
        if raw.len() != member.uncompressed {
            return Err(bad("ZIP stored member size mismatch"));
        }
        return Ok(raw.to_vec());
    }
    let decoder = DeflateDecoder::new(raw);
    let mut bounded = decoder.take(member.uncompressed as u64 + 1);
    let mut result = Vec::with_capacity(member.uncompressed.min(1024 * 1024));
    bounded.read_to_end(&mut result).map_err(|_| bad("invalid ZIP deflate member"))?;
    if result.len() != member.uncompressed {
        return Err(bad("ZIP inflated member size mismatch"));
    }
    Ok(result)
}
fn decode_json(bytes: &[u8], file: &str) -> DecodeResult<Value> {
    serde_json::from_slice(bytes).map_err(|_| bad(&format!("invalid JSON in {file}")))
}
fn version_valid(v: &str) -> bool {
    let segments: Vec<&str> = v.split('.').collect();
    segments.len() == 3 && segments.iter().all(|part| {
        !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit())
    })
}

fn decode_zip(bytes: &[u8]) -> DecodeResult<String> {
    let entries = parse_members(bytes)?;
    let manifest_entry = entries.get("manifest.json").ok_or_else(|| bad("missing DB-04 manifest"))?;
    if manifest_entry.uncompressed > MAX_MANIFEST {
        return Err(bad("oversized DB-04 manifest"));
    }
    // Raw uncompressed bytes match reference_graph.py's source manifest hash.
    // This is snapshot consistency, NOT publisher or installation authenticity.
    let manifest_bytes = unpack(bytes, manifest_entry)?;
    let manifest_raw_sha256 = format!("{:x}", Sha256::digest(&manifest_bytes));
    let manifest = decode_json(&manifest_bytes, "manifest.json")?;
    let root = manifest.as_object().ok_or_else(|| bad("invalid DB-04 manifest"))?;
    if root.get("schema").and_then(Value::as_str) != Some("wand.db04.world@1")
        || root.get("status").and_then(Value::as_str) != Some("partial_game_native_evidence")
        || !root.get("gameVersion").and_then(Value::as_str).is_some_and(version_valid) {
        return Err(bad("invalid DB-04 manifest"));
    }
    let register = root.get("outputSha256").and_then(Value::as_object)
        .ok_or_else(|| bad("invalid DB-04 manifest"))?;
    if register.len() < FAMILIES.len() - 1 || register.len() > MAX_MEMBERS - 1 {
        return Err(bad("unregistered/missing/invalid manifest JSON member"));
    }
    for (name, digest) in register {
        let good_digest = digest.as_str().is_some_and(|v| v.len() == 64
            && v.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        if !simple_json_name(name) || name == "manifest.json"
            || !good_digest || !entries.contains_key(name) {
            return Err(bad("unregistered/missing/invalid manifest JSON member"));
        }
    }
    for name in entries.keys() {
        if name != "manifest.json" && !name.starts_with("diagnostics/")
            && !register.contains_key(name) {
            return Err(bad("unexpected unregistered JSON"));
        }
    }
    for family in FAMILIES {
        if family != "layoutObjects" && !register.contains_key(&format!("{family}.json")) {
            return Err(bad("missing required world entity family"));
        }
    }
    let mut output = Map::new();
    output.insert("manifest".into(), manifest.clone());
    output.insert("manifestFilesVerified".into(), Value::from(register.len()));
    output.insert("manifestRawSha256".into(), Value::from(manifest_raw_sha256));
    let family_names: BTreeMap<String, &str> = FAMILIES.iter()
        .map(|name| (format!("{name}.json"), *name)).collect();
    for (name, expected) in register {
        let member = entries.get(name).ok_or_else(|| bad("missing registered ZIP member"))?;
        let decoded = unpack(bytes, member)?;
        let observed = format!("{:x}", Sha256::digest(&decoded));
        if expected.as_str() != Some(observed.as_str()) {
            return Err(bad(&format!("manifest SHA-256 mismatch: {name}")));
        }
        if let Some(family) = family_names.get(name) {
            output.insert((*family).to_owned(), decode_json(&decoded, name)?);
        }
    }
    output.entry("layoutObjects".to_owned())
        .or_insert_with(|| Value::Array(vec![]));
    serde_json::to_string(&Value::Object(output))
        .map_err(|_| bad("World snapshot serialization failed"))
}

/// Incremental binary accumulation only; no unverified file members or
/// decoded contents cross into Svelte. The Worker receives source IDs/counts.
#[wasm_bindgen]
pub struct WasmWorldZipReader { bytes: Vec<u8> }

#[wasm_bindgen]
impl WasmWorldZipReader {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { Self { bytes: Vec::new() } }
    pub fn append_chunk(&mut self, chunk: &[u8]) -> Result<(), JsValue> {
        if chunk.is_empty() || self.bytes.len().checked_add(chunk.len()).is_none_or(|n| n > MAX_ZIP) {
            return Err(JsValue::from_str(&bad("invalid/oversized ZIP")));
        }
        self.bytes.extend_from_slice(chunk);
        Ok(())
    }
    pub fn finish_json(&mut self) -> Result<String, JsValue> {
        let bytes = std::mem::take(&mut self.bytes);
        decode_zip(&bytes).map_err(|e| JsValue::from_str(&e))
    }
    pub fn clear(&mut self) { self.bytes.clear(); }
}

impl Default for WasmWorldZipReader {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::DeflateEncoder, Compression};
    use std::io::Write;

    fn write16(to: &mut [u8], at: usize, n: u16) {
        to[at..at + 2].copy_from_slice(&n.to_le_bytes());
    }
    fn write32(to: &mut [u8], at: usize, n: u32) {
        to[at..at + 4].copy_from_slice(&n.to_le_bytes());
    }
    fn archive(deflate: bool, alter: Option<fn(&mut BTreeMap<String, Vec<u8>>,
        &mut Map<String, Value>)>) -> Vec<u8> {
        let mut files = BTreeMap::new();
        for name in FAMILIES {
            files.insert(format!("{name}.json"), b"[]".to_vec());
        }
        files.insert("report.json".into(), b"{\"status\":\"synthetic\"}".to_vec());
        let mut register = Map::new();
        for (name, bytes) in &files {
            register.insert(name.clone(), Value::String(format!("{:x}", Sha256::digest(bytes))));
        }
        if let Some(change) = alter { change(&mut files, &mut register); }
        let manifest = serde_json::json!({
            "schema":"wand.db04.world@1",
            "status":"partial_game_native_evidence",
            "platform":"Steam","gameVersion":"1.26.2",
            "sourceScopeVerified":false,
            "outputSha256":register
        });
        files.insert("manifest.json".into(), serde_json::to_vec(&manifest).unwrap());
        files.insert("diagnostics/verification.json".into(), b"{}".to_vec());
        let mut local: Vec<u8> = Vec::new();
        let mut central: Vec<u8> = Vec::new();
        for (name, data) in &files {
            let offset = local.len() as u32;
            let packed = if deflate {
                let mut out = DeflateEncoder::new(Vec::new(), Compression::default());
                out.write_all(data).unwrap();
                out.finish().unwrap()
            } else { data.clone() };
            let mut head = [0u8;30];
            write32(&mut head,0,0x04034b50);
            write16(&mut head,4,20);
            write16(&mut head,8,if deflate {8} else {0});
            write32(&mut head,18,packed.len() as u32);
            write32(&mut head,22,data.len() as u32);
            write16(&mut head,26,name.len() as u16);
            local.extend_from_slice(&head);
            local.extend_from_slice(name.as_bytes());
            local.extend_from_slice(&packed);
            let mut entry = [0u8;46];
            write32(&mut entry,0,0x02014b50);
            write16(&mut entry,4,20);
            write16(&mut entry,6,20);
            write16(&mut entry,10,if deflate {8} else {0});
            write32(&mut entry,20,packed.len() as u32);
            write32(&mut entry,24,data.len() as u32);
            write16(&mut entry,28,name.len() as u16);
            write32(&mut entry,42,offset);
            central.extend_from_slice(&entry);
            central.extend_from_slice(name.as_bytes());
        }
        let central_offset = local.len() as u32;
        let central_size = central.len() as u32;
        local.extend(central);
        let mut end = [0u8;22];
        write32(&mut end,0,0x06054b50);
        write16(&mut end,8,files.len() as u16);
        write16(&mut end,10,files.len() as u16);
        write32(&mut end,12,central_size);
        write32(&mut end,16,central_offset);
        local.extend_from_slice(&end);
        local
    }
    #[test]
    fn stored_and_raw_deflate_package_success() {
        for method in [false,true] {
            let text = decode_zip(&archive(method,None)).unwrap();
            let result: Value = serde_json::from_str(&text).unwrap();
            assert_eq!(result["manifest"]["gameVersion"],"1.26.2");
            assert_eq!(result["manifestFilesVerified"],8);
            // Stored/deflate ZIPs must expose the SAME manifest byte digest.
            let archive_bytes = archive(method,None);
            let entries = parse_members(&archive_bytes).unwrap();
            let original = unpack(&archive_bytes, entries.get("manifest.json").unwrap()).unwrap();
            assert_eq!(result["manifestRawSha256"],
                format!("{:x}",Sha256::digest(&original)));
            assert_eq!(result["objects"],serde_json::json!([]));
            assert_eq!(result["layoutObjects"],serde_json::json!([]));
        }
    }
    #[test]
    fn invalid_member_hash_fails_closed() {
        fn mutate(files:&mut BTreeMap<String,Vec<u8>>, _: &mut Map<String,Value>) {
            files.insert("grids.json".into(), b"[{\"sizeX\":999}]".to_vec());
        }
        assert!(decode_zip(&archive(true,Some(mutate))).unwrap_err()
            .contains("manifest SHA-256 mismatch: grids.json"));
    }
    #[test]
    fn missing_source_family_and_unregistered_entry_fail_closed() {
        fn missing(_: &mut BTreeMap<String,Vec<u8>>, hashes:&mut Map<String,Value>) {
            hashes.remove("objects.json");
        }
        assert!(decode_zip(&archive(false,Some(missing))).unwrap_err()
            .contains("unexpected unregistered JSON"));
        fn traversal(files:&mut BTreeMap<String,Vec<u8>>, _: &mut Map<String,Value>) {
            files.insert("../malicious.json".into(), b"{}".to_vec());
        }
        assert!(decode_zip(&archive(false,Some(traversal))).unwrap_err()
            .contains("unexpected ZIP entry path"));
    }
    #[test]
    fn corrupted_zip_and_unsupported_flags_fail_closed() {
        assert!(decode_zip(b"bad").unwrap_err().contains("invalid/oversized ZIP"));
        let mut source=archive(false,None);
        source[6] = 1; // local flags encrypted; central flags do not match
        assert!(decode_zip(&source).is_err());
        let mut source=archive(false,None);
        source.truncate(source.len()-1);
        assert!(decode_zip(&source).is_err());
        let mut source=archive(false,None);
        let eocd=source.len()-22;
        write16(&mut source,eocd+8,MAX_MEMBERS as u16+1);
        write16(&mut source,eocd+10,MAX_MEMBERS as u16+1);
        assert!(decode_zip(&source).unwrap_err().contains("unsupported ZIP directory size"));
    }
    #[test]
    fn manifest_source_version_is_read_only_and_requires_valid_format() {
        assert!(!version_valid("v1.26.2"));
        assert!(version_valid("1.26.2"));
        assert!(simple_json_name("layoutObjects.json"));
        assert!(!simple_json_name("hello/evil.json"));
        assert!(!valid_member_name("../escape.json"));
    }
}