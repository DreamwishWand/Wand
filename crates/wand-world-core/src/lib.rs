//! Local-only original DB-04 ZIP reader. This is NOT a Save codec,
//! a native-source authenticity proof, or a World placement validator.
//! All byte processing, decompression and source SHA-256 checks are in Rust.
use flate2::read::{DeflateDecoder,ZlibDecoder};
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

/// Per-GridData, source-LOCAL full-rectangle floor-mask overlap map.
/// Nothing here is a game placement validator. Raw original mask values,
/// not GridObjects or runtime Save cells, are the only input.
fn source_floor_rectangle_origins(
    floor: &[u32], sx: u32, sy: u32, accepted: u32, bx: u32, by: u32
) -> Result<(Vec<u8>, u32), String> {
    let invalid = || "DB04_FLOOR_RECT_INVALID_SOURCE".to_owned();
    let width = sx as usize;
    let height = sy as usize;
    let footprint_width = bx as usize;
    let footprint_height = by as usize;
    let n = width.checked_mul(height).ok_or_else(invalid)?;
    if width == 0 || height == 0 || n > 250_000 ||
       floor.len() != n || footprint_width == 0 || footprint_height == 0 ||
       footprint_width > 512 || footprint_height > 512 {
        return Err(invalid());
    }
    let mut bits = vec![0u8; n];
    if footprint_width > width || footprint_height > height {
        return Ok((bits, 0));
    }
    let pitch = width + 1;
    let mut missing = vec![0u32; (height + 1) * pitch];
    for y in 0..height {
        let mut row_missing = 0u32;
        for x in 0..width {
            if floor[y * width + x] & accepted == 0 { row_missing += 1; }
            missing[(y + 1) * pitch + x + 1] =
                missing[y * pitch + x + 1] + row_missing;
        }
    }
    let mut count = 0u32;
    for y in 0..=height - footprint_height {
        let bottom = (y + footprint_height) * pitch;
        let top = y * pitch;
        for x in 0..=width - footprint_width {
            let right = x + footprint_width;
            let uncovered = missing[bottom + right] as i64
                - missing[top + right] as i64
                - missing[bottom + x] as i64
                + missing[top + x] as i64;
            if uncovered == 0 {
                bits[y * width + x] = 1;
                count += 1;
            }
        }
    }
    Ok((bits, count))
}

/// WASM-computed source-grid candidate origins for a hypothetical footprint
/// outer rectangle; zero source permission or Save-writing claims.
#[wasm_bindgen]
pub struct WasmSourceFloorRectangle {
    map: Vec<u8>,
    count: u32,
}

#[wasm_bindgen]
impl WasmSourceFloorRectangle {
    #[wasm_bindgen(constructor)]
    pub fn new(
        floor: &[u32], size_x: u32, size_y: u32,
        accepted_floor_mask: u32, rectangle_width: u32, rectangle_height: u32
    ) -> Result<WasmSourceFloorRectangle, JsValue> {
        let (map, count) = source_floor_rectangle_origins(
            floor, size_x, size_y, accepted_floor_mask,
            rectangle_width, rectangle_height
        ).map_err(|err| JsValue::from_str(&err))?;
        Ok(Self { map, count })
    }
    pub fn origin_bitmap(&self) -> Vec<u8> { self.map.clone() }
    pub fn origin_count(&self) -> u32 { self.count }
}


/** Source-local mapped GridArea geometry, not a runtime occupancy mask.
 * Unmapped cells impose no floor-mask condition, but the entire bounding
 * box remains inside the source grid. Raw mapped zero layers are retained.
 */
fn source_floor_shape_origins(
    floor: &[u32], sx: u32, sy: u32, accepted: u32,
    bx: u32, by: u32, shape: &[u8],
) -> Result<(Vec<u8>, u32), String> {
    let invalid = || "DB04_FLOOR_SHAPE_INVALID_SOURCE".to_owned();
    let (w,h,bw,bh) = (sx as usize,sy as usize,bx as usize,by as usize);
    let n = w.checked_mul(h).ok_or_else(invalid)?;
    let shape_n = bw.checked_mul(bh).ok_or_else(invalid)?;
    if w == 0 || h == 0 || n > 250_000 || floor.len() != n ||
        bw == 0 || bh == 0 || bw > 512 || bh > 512 ||
        shape.len() != shape_n || shape.iter().any(|&v|v>1) ||
        !shape.contains(&1) {
        return Err(invalid());
    }
    if shape.iter().all(|&v|v==1) {
        return source_floor_rectangle_origins(floor,sx,sy,accepted,bx,by);
    }
    let mut bits = vec![0u8;n];
    if bw>w || bh>h { return Ok((bits,0)); }
    // Merge vertically adjacent equal row spans into rectangles. This
    // reuses summed-area queries and avoids testing every shape cell
    // for every possible origin. Fully mapped areas use the fast path.
    let mut rectangles: Vec<(usize,usize,usize,usize)> = Vec::new();
    let mut active = std::collections::BTreeMap::new();
    for y in 0..bh {
        let mut next = std::collections::BTreeMap::new();
        let mut x = 0;
        while x<bw {
            if shape[y*bw+x]==0 { x+=1; continue; }
            let start=x;
            while x<bw && shape[y*bw+x]==1 { x+=1; }
            let key=(start,x);
            let index=if let Some(index)=active.remove(&key) {
                let index:usize=index;
                rectangles[index].3=y+1;
                index
            } else {
                rectangles.push((start,y,x,y+1));
                rectangles.len()-1
            };
            next.insert(key,index);
        }
        active=next;
    }
    let origins=(w-bw+1)*(h-bh+1);
    if origins.saturating_mul(rectangles.len())>64_000_000 {
        return Err("DB04_FLOOR_SHAPE_WORK_LIMIT".to_owned());
    }
    let pitch=w+1;
    let mut missing=vec![0u32;(h+1)*pitch];
    for y in 0..h {
        let mut row=0u32;
        for x in 0..w {
            if floor[y*w+x]&accepted==0 { row+=1; }
            missing[(y+1)*pitch+x+1]=missing[y*pitch+x+1]+row;
        }
    }
    let mut count=0u32;
    for y in 0..=h-bh {
        for x in 0..=w-bw {
            let good=rectangles.iter().all(|&(x0,y0,x1,y1)| {
                let a=(y+y0)*pitch;
                let b=(y+y1)*pitch;
                missing[b+x+x1] as i64-missing[a+x+x1] as i64
                    -missing[b+x+x0] as i64+missing[a+x+x0] as i64==0
            });
            if good { bits[y*w+x]=1; count+=1; }
        }
    }
    Ok((bits,count))
}

#[wasm_bindgen]
pub struct WasmSourceFloorShape { map: Vec<u8>, count:u32 }

#[wasm_bindgen]
impl WasmSourceFloorShape {
    #[wasm_bindgen(constructor)]
    pub fn new(floor:&[u32],sx:u32,sy:u32,accepted:u32,
        bx:u32,by:u32,shape:&[u8]) -> Result<WasmSourceFloorShape,JsValue> {
        let (map,count)=source_floor_shape_origins(
            floor,sx,sy,accepted,bx,by,shape
        ).map_err(|err|JsValue::from_str(&err))?;
        Ok(Self {map,count})
    }
    pub fn origin_bitmap(&self)->Vec<u8> { self.map.clone() }
    pub fn origin_count(&self)->u32 { self.count }
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

/// Public source-derived Y-major palette projection. It is not a runtime
/// occupancy map or a universal furniture permission bitmap.
fn decode_terrain_projection(compressed:&[u8],palette:&[u32],counts:&[u32],
    sx:u32,sy:u32,sha:&str)->DecodeResult<Vec<u32>>{
    let cells=(sx as usize).checked_mul(sy as usize).ok_or_else(||bad("terrain dimensions"))?;
    if sx==0||sy==0||cells>250_000||palette.is_empty()||palette.len()>256||
        counts.len()!=palette.len()||palette.windows(2).any(|v|v[0]>=v[1])||
        counts.iter().map(|v|*v as u64).sum::<u64>()!=cells as u64||
        compressed.is_empty()||compressed.len()>1_000_000||sha.len()!=64{
        return Err(bad("invalid terrain projection"));
    }
    let mut indices=Vec::with_capacity(cells);
    ZlibDecoder::new(compressed).take(cells as u64+1).read_to_end(&mut indices)
        .map_err(|_|bad("terrain inflate failed"))?;
    if indices.len()!=cells||format!("{:x}",Sha256::digest(&indices))!=sha{
        return Err(bad("terrain digest or size mismatch"));
    }
    let mut observed=vec![0u32;palette.len()];
    let mut raster=Vec::with_capacity(cells);
    for i in indices{
        let index=i as usize;
        let value=*palette.get(index).ok_or_else(||bad("terrain palette index"))?;
        observed[index]+=1;raster.push(value);
    }
    if observed!=counts{return Err(bad("terrain histogram mismatch"));}
    Ok(raster)
}
#[wasm_bindgen]
pub fn decode_public_terrain(compressed:&[u8],palette:&[u32],counts:&[u32],
    sx:u32,sy:u32,sha:&str)->Result<Vec<u32>,JsValue>{
    decode_terrain_projection(compressed,palette,counts,sx,sy,sha)
        .map_err(|e|JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    #[test]
    fn public_terrain_rejects_invalid_digest_and_histogram(){
        use std::io::Write;
        let indices=[0u8,1,1,0,2,1];
        let mut encoder=flate2::write::ZlibEncoder::new(Vec::new(),flate2::Compression::best());
        encoder.write_all(&indices).unwrap();let bytes=encoder.finish().unwrap();
        let hash=format!("{:x}",Sha256::digest(indices));
        assert_eq!(decode_terrain_projection(&bytes,&[0,4,512],&[2,3,1],3,2,&hash).unwrap(),vec![0,4,4,0,512,4]);
        assert!(decode_terrain_projection(&bytes,&[0,4,512],&[3,2,1],3,2,&hash).is_err());
        assert!(decode_terrain_projection(&bytes,&[0,4,512],&[2,3,1],3,2,&"0".repeat(64)).is_err());
    }

    use super::*;

    #[test]
    fn original_floor_rectangle_holes_and_rotation_are_exact() {
        // Y-major 4x3 floor; a single incompatible hole at (2,1).
        let floor = [4,4,4,4, 4,4,0,4, 4,4,4,4];
        let (map,count)=source_floor_rectangle_origins(&floor,4,3,4,2,2).unwrap();
        assert_eq!(count,2);
        assert_eq!(map,[1,0,0,0, 1,0,0,0, 0,0,0,0]);
        let (_,count)=source_floor_rectangle_origins(&floor,4,3,4,2,1).unwrap();
        assert_eq!(count,7);
        let (_,count)=source_floor_rectangle_origins(&floor,4,3,4,1,2).unwrap();
        assert_eq!(count,6);
        let (map,count)=source_floor_rectangle_origins(&floor,4,3,4,5,2).unwrap();
        assert_eq!(count,0);
        assert_eq!(map.len(),12);
    }
    #[test]
    fn original_floor_rectangle_high_unsigned_bits_and_bad_inputs() {
        let (map,count)=source_floor_rectangle_origins(
            &[0x8000_0000,0xffff_ffff,0],3,1,0x8000_0000,1,1
        ).unwrap();
        assert_eq!(map,[1,1,0]);
        assert_eq!(count,2);
        assert!(source_floor_rectangle_origins(&[],2,2,4,1,1).is_err());
        assert!(source_floor_rectangle_origins(&[4],1,1,4,0,1).is_err());
        assert!(source_floor_rectangle_origins(&[4],1,1,4,1,513).is_err());
    }
    #[test]
    fn mapped_shape_ignores_only_unmapped_corners() {
        let floor=[0,4,4,4, 4,4,4,4, 4,4,4,4];
        let (map,count)=source_floor_shape_origins(&floor,4,3,4,2,2,&[0,1,1,1]).unwrap();
        assert_eq!(map,[1,1,1,0, 1,1,1,0, 0,0,0,0]);
        assert_eq!(count,6);
        let (map,count)=source_floor_shape_origins(&floor,4,3,4,2,2,&[1,1,1,0]).unwrap();
        assert_eq!(map,[0,1,1,0, 1,1,1,0, 0,0,0,0]);
        assert_eq!(count,5);
        assert_eq!(source_floor_shape_origins(&floor,4,3,4,2,2,&[1,1,1,1]).unwrap(),
            source_floor_rectangle_origins(&floor,4,3,4,2,2).unwrap());
        assert!(source_floor_shape_origins(&floor,4,3,4,2,2,&[0,0,0,0]).is_err());
        assert!(source_floor_shape_origins(&floor,4,3,4,2,2,&[1,1,1,2]).is_err());
        assert!(source_floor_shape_origins(&floor,4,3,4,2,2,&[1,1,1]).is_err());
    }
    #[test]
    fn mapped_shape_matches_naive_oracle_for_irregular_rows() {
        let floor:Vec<u32>=(0..42).map(|i|if i%7==2||i%5==0 {0}else{4}).collect();
        let shape=[0,1,0,1,1,1,1,0,1];
        let (actual,count)=source_floor_shape_origins(&floor,7,6,4,3,3,&shape).unwrap();
        let mut expected=vec![0u8;42];
        for y in 0..4 { for x in 0..5 {
            if (0..3).all(|dy|(0..3).all(|dx|
                shape[dy*3+dx]==0||floor[(y+dy)*7+x+dx]&4!=0)) {
                expected[y*7+x]=1;
            }
        }}
        assert_eq!(actual,expected);
        assert_eq!(count,expected.iter().map(|&v|v as u32).sum::<u32>());
    }
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