//! DB-05 Rust-first, byte-preserving JSON quantity draft.
//! This is NOT a P1G Codec, SaveSession, authenticated Writer, or export path.
//! Only the original ASCII decimal Amount token is replaced. Everything else,
//! including unknown members, order, whitespace and number spellings, is borrowed.
//! Callers must retain their strict external P1G/JSON Codec and enforce all
//! game-specific constraints before any future export implementation.
use std::collections::HashSet;
use std::ops::Range;

const MAX_PROFILE_BYTES: usize = 128 * 1024 * 1024;
const MAX_DEPTH: usize = 256;
const MAX_OBJECT_KEYS: usize = 1_000_000;
const MAX_SAFE_JSON_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuantityTarget {
    Inventory { inventory_id: String, item_id: String },
    ChestSlot { container_id: String, slot_index: usize, item_id: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatchError {
    InvalidTarget,
    InvalidQuantity,
    InvalidDocument,
    TooDeep,
    DuplicateKey,
    MissingTarget,
    ItemMismatch,
    AmountMismatch,
    NonIntegerTarget,
    AmbiguousTarget,
}

impl PatchError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidTarget => "DB05_PATCH_INVALID_TARGET",
            Self::InvalidQuantity => "DB05_PATCH_INVALID_QUANTITY",
            Self::InvalidDocument => "DB05_PATCH_INVALID_DOCUMENT",
            Self::TooDeep => "DB05_PATCH_TOO_DEEP",
            Self::DuplicateKey => "DB05_PATCH_DUPLICATE_KEY",
            Self::MissingTarget => "DB05_PATCH_MISSING_TARGET",
            Self::ItemMismatch => "DB05_PATCH_ITEM_MISMATCH",
            Self::AmountMismatch => "DB05_PATCH_AMOUNT_MISMATCH",
            Self::NonIntegerTarget => "DB05_PATCH_NONINTEGER_TARGET",
            Self::AmbiguousTarget => "DB05_PATCH_AMBIGUOUS_TARGET",
        }
    }
}

/// Private draft only. Never send patched_json to telemetry or diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuantityDraft {
    pub patched_json: String,
    pub changed: bool,
    pub original_amount: u64,
    pub replacement_amount: u64,
    pub untouched_bytes_preserved: bool,
    pub writer_authorized: bool,
    pub export_authorized: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    Key(String),
    Index(usize),
}
fn k(value: &str) -> Segment { Segment::Key(value.to_owned()) }
fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 20
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.parse::<u64>().ok().is_some_and(|n| n > 0)
}
fn valid_quantity(value: u64) -> bool {
    value > 0 && value <= MAX_SAFE_JSON_INTEGER
}

struct JsonLocator<'a> {
    source: &'a str,
    bytes: &'a [u8],
    pos: usize,
    depth: usize,
    amount_path: Vec<Segment>,
    item_path: Option<Vec<Segment>>,
    amount: Option<(Range<usize>, u64)>,
    item: Option<u64>,
}

impl<'a> JsonLocator<'a> {
    fn new(source: &'a str, target: QuantityTarget) -> Result<Self, PatchError> {
        let (amount_path, item_path) = match target {
            QuantityTarget::Inventory { inventory_id, item_id } => {
                if !valid_id(&inventory_id) || !valid_id(&item_id) {
                    return Err(PatchError::InvalidTarget);
                }
                (vec![k("Player"), k("ListInventories"), k(&inventory_id),
                    k("Inventory"), k(&item_id), k("Amount")], None)
            }
            QuantityTarget::ChestSlot { container_id, slot_index, item_id } => {
                if !valid_id(&container_id) || item_id == 0 ||
                    item_id > MAX_SAFE_JSON_INTEGER || slot_index > 1_000_000 {
                    return Err(PatchError::InvalidTarget);
                }
                let mut prefix = vec![k("Player"), k("ContainerInventories"),
                    k(&container_id), k("Inventory"), Segment::Index(slot_index)];
                let mut item_path = prefix.clone();
                item_path.push(k("ItemID"));
                prefix.push(k("Amount"));
                (prefix, Some(item_path))
            }
        };
        Ok(Self { source, bytes: source.as_bytes(), pos: 0, depth: 0,
            amount_path, item_path, amount: None, item: None })
    }

    fn space(&mut self) {
        while self.pos < self.bytes.len() && matches!(self.bytes[self.pos], b' '|b'\t'|b'\n'|b'\r') {
            self.pos += 1;
        }
    }
    fn expect(&mut self, want: u8) -> Result<(), PatchError> {
        self.space();
        if self.bytes.get(self.pos) != Some(&want) {
            return Err(PatchError::InvalidDocument);
        }
        self.pos += 1;
        Ok(())
    }
    fn string(&mut self) -> Result<String, PatchError> {
        if self.bytes.get(self.pos) != Some(&b'"') { return Err(PatchError::InvalidDocument); }
        let start = self.pos;
        self.pos += 1;
        while let Some(&b) = self.bytes.get(self.pos) {
            if b == b'"' {
                self.pos += 1;
                return serde_json::from_str(&self.source[start..self.pos])
                    .map_err(|_| PatchError::InvalidDocument);
            }
            if b < 0x20 { return Err(PatchError::InvalidDocument); }
            if b == b'\\' {
                self.pos += 1;
                let Some(&escaped) = self.bytes.get(self.pos) else {
                    return Err(PatchError::InvalidDocument);
                };
                if escaped == b'u' {
                    self.pos += 1;
                    for _ in 0..4 {
                        let Some(&digit) = self.bytes.get(self.pos) else {
                            return Err(PatchError::InvalidDocument);
                        };
                        if !digit.is_ascii_hexdigit() { return Err(PatchError::InvalidDocument); }
                        self.pos += 1;
                    }
                } else if matches!(escaped, b'"'|b'\\'|b'/'|b'b'|b'f'|b'n'|b'r'|b't') {
                    self.pos += 1;
                } else { return Err(PatchError::InvalidDocument); }
            } else { self.pos += 1; }
        }
        Err(PatchError::InvalidDocument)
    }
    fn number(&mut self) -> Result<(), PatchError> {
        if self.bytes.get(self.pos) == Some(&b'-') { self.pos += 1; }
        match self.bytes.get(self.pos).copied() {
            Some(b'0') => { self.pos += 1; },
            Some(b'1'..=b'9') => {
                while self.bytes.get(self.pos).is_some_and(u8::is_ascii_digit) {
                    self.pos += 1;
                }
            },
            _ => return Err(PatchError::InvalidDocument)
        }
        if self.bytes.get(self.pos) == Some(&b'.') {
            self.pos += 1;
            let before = self.pos;
            while self.bytes.get(self.pos).is_some_and(u8::is_ascii_digit) { self.pos += 1; }
            if self.pos == before { return Err(PatchError::InvalidDocument); }
        }
        if matches!(self.bytes.get(self.pos).copied(), Some(b'e'|b'E')) {
            self.pos += 1;
            if matches!(self.bytes.get(self.pos).copied(), Some(b'+'|b'-')) { self.pos += 1; }
            let before = self.pos;
            while self.bytes.get(self.pos).is_some_and(u8::is_ascii_digit) { self.pos += 1; }
            if self.pos == before { return Err(PatchError::InvalidDocument); }
        }
        Ok(())
    }
    fn literal(&mut self, literal: &[u8]) -> Result<(), PatchError> {
        if !self.bytes[self.pos..].starts_with(literal) {
            return Err(PatchError::InvalidDocument);
        }
        self.pos += literal.len();
        Ok(())
    }
    fn object(&mut self, path: &mut Vec<Segment>) -> Result<(), PatchError> {
        self.expect(b'{')?;
        self.space();
        if self.bytes.get(self.pos) == Some(&b'}') { self.pos += 1; return Ok(()); }
        let mut keys = HashSet::new();
        loop {
            self.space();
            let key = self.string()?;
            if !keys.insert(key.clone()) { return Err(PatchError::DuplicateKey); }
            if keys.len() > MAX_OBJECT_KEYS { return Err(PatchError::InvalidDocument); }
            self.expect(b':')?;
            path.push(Segment::Key(key));
            let outcome = self.value(path);
            path.pop();
            outcome?;
            self.space();
            match self.bytes.get(self.pos).copied() {
                Some(b',') => self.pos += 1,
                Some(b'}') => { self.pos += 1; break; },
                _ => return Err(PatchError::InvalidDocument)
            }
        }
        Ok(())
    }
    fn array(&mut self, path: &mut Vec<Segment>) -> Result<(), PatchError> {
        self.expect(b'[')?;
        self.space();
        if self.bytes.get(self.pos) == Some(&b']') { self.pos += 1; return Ok(()); }
        let mut index = 0usize;
        loop {
            path.push(Segment::Index(index));
            let outcome = self.value(path);
            path.pop();
            outcome?;
            index = index.checked_add(1).ok_or(PatchError::InvalidDocument)?;
            self.space();
            match self.bytes.get(self.pos).copied() {
                Some(b',') => self.pos += 1,
                Some(b']') => { self.pos += 1; break; },
                _ => return Err(PatchError::InvalidDocument)
            }
        }
        Ok(())
    }
    fn value(&mut self, path: &mut Vec<Segment>) -> Result<(), PatchError> {
        self.space();
        let start = self.pos;
        let Some(&first) = self.bytes.get(self.pos) else { return Err(PatchError::InvalidDocument); };
        match first {
            b'{' | b'[' => {
                self.depth += 1;
                if self.depth > MAX_DEPTH { return Err(PatchError::TooDeep); }
                let result = if first == b'{' { self.object(path) } else { self.array(path) };
                self.depth -= 1;
                result?;
            }
            b'"' => { self.string()?; },
            b't' => { self.literal(b"true")?; },
            b'f' => { self.literal(b"false")?; },
            b'n' => { self.literal(b"null")?; },
            b'-' | b'0'..=b'9' => { self.number()?; },
            _ => return Err(PatchError::InvalidDocument)
        }
        let is_amount = path.as_slice() == self.amount_path.as_slice();
        let is_item = self.item_path.as_ref().is_some_and(|p| p.as_slice() == path.as_slice());
        if is_amount || is_item {
            if !matches!(first, b'0'..=b'9') {
                return Err(PatchError::NonIntegerTarget);
            }
            let value = self.source[start..self.pos].parse::<u64>()
                .map_err(|_| PatchError::NonIntegerTarget)?;
            if value > MAX_SAFE_JSON_INTEGER { return Err(PatchError::NonIntegerTarget); }
            if is_amount {
                if self.amount.replace((start..self.pos, value)).is_some() {
                    return Err(PatchError::AmbiguousTarget);
                }
            } else if self.item.replace(value).is_some() {
                return Err(PatchError::AmbiguousTarget);
            }
        }
        Ok(())
    }
    fn walk_complete(&mut self) -> Result<(), PatchError> {
        self.space();
        if self.bytes.get(self.pos) != Some(&b'{') { return Err(PatchError::InvalidDocument); }
        self.value(&mut Vec::new())?;
        self.space();
        if self.pos != self.bytes.len() { return Err(PatchError::InvalidDocument); }
        Ok(())
    }
    fn locate(mut self) -> Result<(Range<usize>, u64, Option<u64>), PatchError> {
        self.walk_complete()?;
        let (range, original) = self.amount.ok_or(PatchError::MissingTarget)?;
        if self.item_path.is_some() && self.item.is_none() {
            return Err(PatchError::MissingTarget);
        }
        Ok((range, original, self.item))
    }
}

/// Strict whole-document syntax/duplicate-key check for the *private* P1G
/// codec laboratory. Does not create a DOM or change/serialize JSON.
/// Schema, entitlement and Writer permission are separate checks.
pub fn validate_json_without_edit(source: &str) -> Result<(), PatchError> {
    if source.is_empty() || source.len() > MAX_PROFILE_BYTES {
        return Err(PatchError::InvalidDocument);
    }
    let mut parser = JsonLocator {
        source, bytes: source.as_bytes(), pos: 0, depth: 0,
        // Root must be an object, therefore this artificial root Index cannot
        // match any real path and never reads or changes a saved Amount.
        amount_path: vec![Segment::Index(usize::MAX)],
        item_path: None, amount: None, item: None,
    };
    parser.walk_complete()
}

/// Creates an in-memory draft only; never writes a file or P1G. Unknown fields
/// and all other original JSON bytes remain untouched, including noncanonical
/// whitespace and key escaping. This does NOT prove game acceptance.
pub fn preview_existing_quantity(
    source: &str,
    target: QuantityTarget,
    expected_amount: u64,
    replacement_amount: u64,
) -> Result<QuantityDraft, PatchError> {
    if source.is_empty() || source.len() > MAX_PROFILE_BYTES {
        return Err(PatchError::InvalidDocument);
    }
    if !valid_quantity(expected_amount) || !valid_quantity(replacement_amount) {
        return Err(PatchError::InvalidQuantity);
    }
    let item_id = match &target {
        QuantityTarget::ChestSlot { item_id, .. } => Some(*item_id),
        _ => None,
    };
    let (range, original, observed_item) = JsonLocator::new(source, target)?.locate()?;
    if observed_item != item_id { return Err(PatchError::ItemMismatch); }
    if original != expected_amount { return Err(PatchError::AmountMismatch); }
    let changed = original != replacement_amount;
    let patched_json = if changed {
        let replacement = replacement_amount.to_string();
        let mut out = String::with_capacity(source.len() + replacement.len());
        out.push_str(&source[..range.start]);
        out.push_str(&replacement);
        out.push_str(&source[range.end..]);
        out
    } else { source.to_owned() };
    Ok(QuantityDraft {
        patched_json, changed, original_amount: original, replacement_amount,
        untouched_bytes_preserved: true,
        writer_authorized: false, export_authorized: false,
    })
}

#[cfg(feature = "wasm")]
mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen]
    pub fn preview_existing_inventory_amount(
        source: &str, inventory_id: &str, item_id: &str, expected: u32, amount: u32,
    ) -> Result<String, JsValue> {
        preview_existing_quantity(source, QuantityTarget::Inventory {
            inventory_id: inventory_id.to_owned(), item_id: item_id.to_owned(),
        }, expected as u64, amount as u64)
        .map(|draft| draft.patched_json)
        .map_err(|err| JsValue::from_str(err.code()))
    }
    #[wasm_bindgen]
    pub fn preview_existing_chest_amount(
        source: &str, container_id: &str, slot: u32, item_id: &str, expected: u32, amount: u32,
    ) -> Result<String, JsValue> {
        let item_id = item_id.parse::<u64>()
            .map_err(|_| JsValue::from_str(PatchError::InvalidTarget.code()))?;
        preview_existing_quantity(source, QuantityTarget::ChestSlot {
            container_id: container_id.to_owned(), slot_index: slot as usize, item_id,
        }, expected as u64, amount as u64)
        .map(|draft| draft.patched_json)
        .map_err(|err| JsValue::from_str(err.code()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn inventory() -> QuantityTarget {
        QuantityTarget::Inventory { inventory_id: "101".into(), item_id: "550".into() }
    }
    fn chest() -> QuantityTarget {
        QuantityTarget::ChestSlot { container_id:"202".into(), slot_index:1, item_id:440 }
    }

    #[test]
    fn validates_unedited_json_without_exposing_or_reconstructing_values() {
        let json = r#"{"GameInfo":{"Version":643},"Player":{"Unknown":{"\u0041":1}},"World":{}}"#;
        assert_eq!(validate_json_without_edit(json), Ok(()));
        assert_eq!(validate_json_without_edit(r#"{"A":1,"\u0041":2}"#),
            Err(PatchError::DuplicateKey));
        assert_eq!(validate_json_without_edit(r#"{"A":[1,2,]}"#),
            Err(PatchError::InvalidDocument));
    }

    #[test]
    fn inventory_rewrites_only_exact_token_with_unknown_data_preserved() {
        let raw = r#" { "GameInfo":{"Version":643}, "Player": {
          "ListInventories":{"101":{"ID":101,"Inventory":{"550":{"Amount":7,"Unknown": 1.00e+2}}}},
          "Notes":"\u3053\u3093\u306b\u3061\u306f","Amount":999
        }, "World":{} } "#;
        let edited = preview_existing_quantity(raw, inventory(), 7, 12).unwrap();
        assert!(edited.changed && edited.untouched_bytes_preserved);
        assert!(!edited.writer_authorized && !edited.export_authorized);
        assert_eq!(edited.patched_json, raw.replacen(r#""Amount":7"#, r#""Amount":12"#, 1));
        assert!(edited.patched_json.contains(r#""Unknown": 1.00e+2"#));
        assert!(edited.patched_json.contains(r#""Amount":999"#));
    }
    #[test]
    fn chest_checks_slot_index_and_item_identity_before_change() {
        let raw = r#"{"Player":{"ContainerInventories":{"202":{"Inventory":[
          {"ItemID":0,"Amount":0},{"ItemID":440,"Amount":2,"Unknown":{"x":"a"}}
        ]}}},"World":{},"GameInfo":{"Version":626}}"#;
        assert_eq!(preview_existing_quantity(raw, chest(), 2, 5).unwrap().patched_json,
            raw.replacen(r#""Amount":2"#, r#""Amount":5"#, 1));
        assert_eq!(preview_existing_quantity(raw,
            QuantityTarget::ChestSlot{container_id:"202".into(),slot_index:0,item_id:440},
            2, 5).unwrap_err(), PatchError::ItemMismatch);
        assert_eq!(preview_existing_quantity(raw, chest(), 3, 5).unwrap_err(),
            PatchError::AmountMismatch);
    }
    #[test]
    fn rejects_semantic_duplicate_keys_even_when_escaped_and_in_unknown_branches() {
        let raw = r#"{"Player":{"ListInventories":{"101":{"Inventory":{"550":{"Amount":7}}}}},
          "Unknown":{"A":1,"\u0041":2},"World":{}}"#;
        assert_eq!(preview_existing_quantity(raw, inventory(), 7, 8).unwrap_err(),
            PatchError::DuplicateKey);
    }
    #[test]
    fn rejects_missing_or_noninteger_amounts_and_malformed_syntax() {
        let missing = r#"{"Player":{"ListInventories":{}},"World":{}}"#;
        assert_eq!(preview_existing_quantity(missing, inventory(), 7, 8).unwrap_err(),
            PatchError::MissingTarget);
        let malformed = r#"{"Player":{"ListInventories":{"101":{"Inventory":{"550":{"Amount":7,}}}}}}"#;
        assert_eq!(preview_existing_quantity(malformed, inventory(), 7, 8).unwrap_err(),
            PatchError::InvalidDocument);
        let float = r#"{"Player":{"ListInventories":{"101":{"Inventory":{"550":{"Amount":7.0}}}}}}"#;
        assert_eq!(preview_existing_quantity(float, inventory(), 7, 8).unwrap_err(),
            PatchError::NonIntegerTarget);
    }
    #[test]
    fn no_version_gate_noop_and_conservative_bounds() {
        let raw = r#"{"Player":{"ListInventories":{"101":{"Inventory":{"550":{"Amount":7}}}}},"FutureUnknown":true}"#;
        let draft = preview_existing_quantity(raw, inventory(), 7, 7).unwrap();
        assert!(!draft.changed);
        assert_eq!(draft.patched_json, raw);
        assert_eq!(preview_existing_quantity(raw, inventory(), 7, 0).unwrap_err(),
            PatchError::InvalidQuantity);
        assert_eq!(preview_existing_quantity(raw, inventory(), 0, 8).unwrap_err(),
            PatchError::InvalidQuantity);
        assert_eq!(preview_existing_quantity(raw, QuantityTarget::Inventory{
            inventory_id:"../../".into(),item_id:"550".into()},7,8).unwrap_err(),
            PatchError::InvalidTarget);
    }
}
