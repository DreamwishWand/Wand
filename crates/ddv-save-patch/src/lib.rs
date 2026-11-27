//! DB-05 Rust-first, byte-preserving JSON quantity draft.
//! This is NOT a P1G Codec, SaveSession, authenticated Writer, or export path.
//! Only the original ASCII decimal Amount token is replaced. Everything else,
//! including unknown members, order, whitespace and number spellings, is borrowed.
//! Callers must retain their strict external P1G/JSON Codec and enforce all
//! game-specific constraints before any future export implementation.
use std::collections::{HashMap,HashSet};
use std::ops::Range;
pub mod fence_topology;
pub mod fence_erase;
pub mod support_clone;
pub mod bulk_furniture;

pub const MAX_GRID_MIXED_EDITS:usize=512;
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
    CoordinateMismatch,
    OrientationMismatch,
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
            Self::CoordinateMismatch => "DB05_PATCH_COORDINATE_MISMATCH",
            Self::OrientationMismatch => "DB05_PATCH_ORIENTATION_MISMATCH",
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    signed_path: Option<Vec<Segment>>,
    signed: Option<(Range<usize>, i32)>,
    string_path:Option<Vec<Segment>>,
    observed_string:Option<(Range<usize>,String)>,
    capture:HashMap<Vec<Segment>,Option<Range<usize>>>,
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
            amount_path, item_path, amount: None, item: None,
            signed_path:None,signed:None,
            string_path:None,observed_string:None,capture:HashMap::new() })
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
            b'"' => {
                let value=self.string()?;
                if self.string_path.as_ref()
                    .is_some_and(|p|p.as_slice()==path.as_slice())&&
                    self.observed_string.replace((start..self.pos,value)).is_some(){
                    return Err(PatchError::AmbiguousTarget);
                }
            },
            b't' => { self.literal(b"true")?; },
            b'f' => { self.literal(b"false")?; },
            b'n' => { self.literal(b"null")?; },
            b'-' | b'0'..=b'9' => { self.number()?; },
            _ => return Err(PatchError::InvalidDocument)
        }
        if !self.capture.is_empty(){
            if let Some(span)=self.capture.get_mut(path.as_slice()){
                if span.replace(start..self.pos).is_some(){return Err(PatchError::AmbiguousTarget);}
            }
        }
        let is_signed=self.signed_path.as_ref()
            .is_some_and(|p|p.as_slice()==path.as_slice());
        if is_signed{
            if !matches!(first,b'-'|b'0'..=b'9'){
                return Err(PatchError::NonIntegerTarget);
            }
            let signed=self.source[start..self.pos].parse::<i32>()
                .map_err(|_|PatchError::NonIntegerTarget)?;
            if self.signed.replace((start..self.pos,signed)).is_some(){
                return Err(PatchError::AmbiguousTarget);
            }
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
    fn locate_signed(mut self)->Result<(Range<usize>,i32,Option<u64>),PatchError>{
        self.walk_complete()?;
        let (range,original)=self.signed.ok_or(PatchError::MissingTarget)?;
        if self.item_path.is_some()&&self.item.is_none(){
            return Err(PatchError::MissingTarget);
        }
        Ok((range,original,self.item))
    }
    fn locate_string(mut self)->Result<(Range<usize>,String,Option<u64>),PatchError>{
        self.walk_complete()?;
        let (range,original)=self.observed_string.ok_or(PatchError::MissingTarget)?;
        if self.item_path.is_some()&&self.item.is_none(){
            return Err(PatchError::MissingTarget);
        }
        Ok((range,original,self.item))
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
        signed_path:None,signed:None,
        string_path:None,observed_string:None,capture:HashMap::new(),
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

/// A native Save GridObject reference *resolved internally* from an ephemeral
/// per-open-file ordinal. Never supply numeric Save Grid/Object IDs from the UI.
#[derive(Debug,Clone,Copy,PartialEq,Eq,Hash)]
pub enum GridObjectKind { Full, DiffModified }

#[derive(Debug,Clone,PartialEq,Eq)]
pub struct GridCoordinateTarget{
    pub kind:GridObjectKind,
    pub grid_id:String,
    pub object_id:String,
    pub item_id:u64,
}
pub struct GridCoordinateDraft{
    pub patched_json:String,
    pub changed:bool,
    pub untouched_bytes_preserved:bool,
    pub writer_authorized:bool,
    pub export_authorized:bool,
}
impl<'a> JsonLocator<'a>{
    fn grid_axis(source:&'a str,target:&GridCoordinateTarget,axis:&str)
        ->Result<Self,PatchError>{
        if !matches!(axis,"X"|"Y")||
           !valid_id(&target.grid_id)||!valid_id(&target.object_id)||
           target.grid_id.starts_with('0')||target.object_id.starts_with('0')||
           target.item_id==0||target.item_id>MAX_SAFE_JSON_INTEGER{
            return Err(PatchError::InvalidTarget);
        }
        let (grids,objects)=match target.kind{
            GridObjectKind::Full=>("Grids","Objects"),
            GridObjectKind::DiffModified=>("DiffGrids","ModifiedObjects")
        };
        let mut prefix=vec![
            k("World"),k("GridCollection"),k(grids),k(&target.grid_id),
            k(objects),k(&target.object_id)
        ];
        let mut item_path=prefix.clone();item_path.push(k("ItemID"));
        prefix.push(k(axis));
        Ok(Self{
            source,bytes:source.as_bytes(),pos:0,depth:0,
            amount_path:vec![Segment::Index(usize::MAX)],
            item_path:Some(item_path),amount:None,item:None,
            signed_path:Some(prefix),signed:None,
            string_path:None,observed_string:None,capture:HashMap::new()
        })
    }
    fn grid_orientation(source:&'a str,target:&GridCoordinateTarget)
        ->Result<Self,PatchError>{
        // Reuse precisely the same strict private Grid/Object ItemID path.
        let mut locator=Self::grid_axis(source,target,"X")?;
        let mut path=locator.signed_path.take().ok_or(PatchError::InvalidTarget)?;
        *path.last_mut().ok_or(PatchError::InvalidTarget)?=k("Orientation");
        locator.string_path=Some(path);
        Ok(locator)
    }
}

/// Lexically replace X/Y integer tokens of one *existing* native GridObject.
/// Never change IDs, orientation, private state, map keys or unrelated values.
/// The caller must first resolve the ephemeral ordinal internally and verify
/// all original object IDs, ItemID and coordinate values without trusting the UI.
pub fn preview_existing_grid_coordinates(
    source:&str,target:GridCoordinateTarget,
    expected:(i32,i32),replacement:(i32,i32)
)->Result<GridCoordinateDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES{
        return Err(PatchError::InvalidDocument);
    }
    let (x_range,x,item_x)=JsonLocator::grid_axis(source,&target,"X")?
        .locate_signed()?;
    let (y_range,y,item_y)=JsonLocator::grid_axis(source,&target,"Y")?
        .locate_signed()?;
    if item_x!=Some(target.item_id)||item_y!=Some(target.item_id){
        return Err(PatchError::ItemMismatch);
    }
    if (x,y)!=expected{
        return Err(PatchError::CoordinateMismatch);
    }
    let changed=expected!=replacement;
    let patched_json=if changed{
        let mut edits=vec![
            (x_range,replacement.0.to_string()),
            (y_range,replacement.1.to_string()),
        ];
        edits.sort_by_key(|(range,_)|range.start);
        if edits[0].0.end>edits[1].0.start{
            return Err(PatchError::AmbiguousTarget);
        }
        let mut out=String::with_capacity(source.len()+32);
        let mut last=0;
        for (range,value) in edits{
            out.push_str(&source[last..range.start]);
            out.push_str(&value);last=range.end;
        }
        out.push_str(&source[last..]);out
    }else{
        source.to_owned()
    };
    Ok(GridCoordinateDraft{
        patched_json,changed,untouched_bytes_preserved:true,
        writer_authorized:false,export_authorized:false
    })
}

/// Native GridOrientation is 16-way. Only the four names confirmed from
/// original Save transaction evidence are enabled in this *experimental* path.
/// This is not a collision/footprint validator and does not imply that all
/// Save versions or non-cardinal orientations can be rewritten safely.
pub const OBSERVED_CARDINAL_ORIENTATIONS:[&str;4]=[
    "GridOrientation_Up","GridOrientation_Right",
    "GridOrientation_Down","GridOrientation_Left"
];
pub fn preview_existing_grid_orientation(
    source:&str,target:GridCoordinateTarget,
    expected:&str,replacement:&str
)->Result<GridCoordinateDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES{
        return Err(PatchError::InvalidDocument);
    }
    if !OBSERVED_CARDINAL_ORIENTATIONS.contains(&expected)||
       !OBSERVED_CARDINAL_ORIENTATIONS.contains(&replacement){
        return Err(PatchError::InvalidTarget);
    }
    let (range,original,observed_item)=JsonLocator::grid_orientation(source,&target)?
        .locate_string()?;
    if observed_item!=Some(target.item_id){return Err(PatchError::ItemMismatch);}
    if original!=expected{return Err(PatchError::OrientationMismatch);}
    let changed=expected!=replacement;
    let patched_json=if changed{
        let mut out=String::with_capacity(source.len()+32);
        out.push_str(&source[..range.start]);
        out.push('"');out.push_str(replacement);out.push('"');
        out.push_str(&source[range.end..]);
        out
    }else{source.to_owned()};
    Ok(GridCoordinateDraft{
        patched_json,changed,untouched_bytes_preserved:true,
        writer_authorized:false,export_authorized:false
    })
}

/// Atomically move AND rotate one *existing* saved GridObject.
///
/// Both independent optimistic checks run against the exact ORIGINAL
/// profile before producing any candidate. Only X, Y, and Orientation
/// scalar tokens are modified; all other bytes, including unknown fields,
/// lexical JSON formatting, IDs and unrelated objects, are preserved.
/// This deliberately permits only already-evidenced four cardinal enum
/// spellings and never treats a matching source path as placement legality.
pub fn preview_existing_grid_transform(
    source:&str,target:GridCoordinateTarget,
    expected:(i32,i32),replacement:(i32,i32),
    expected_orientation:&str,replacement_orientation:&str
)->Result<GridCoordinateDraft,PatchError>{
    if expected==replacement||expected_orientation==replacement_orientation{
        return Err(PatchError::InvalidTarget);
    }
    let coordinate_draft=preview_existing_grid_coordinates(
        source,target.clone(),expected,replacement
    )?;
    let orientation_check=preview_existing_grid_orientation(
        source,target.clone(),expected_orientation,replacement_orientation
    )?;
    if !coordinate_draft.changed||!orientation_check.changed||
       !coordinate_draft.untouched_bytes_preserved||
       !orientation_check.untouched_bytes_preserved||
       coordinate_draft.writer_authorized||coordinate_draft.export_authorized||
       orientation_check.writer_authorized||orientation_check.export_authorized{
        return Err(PatchError::InvalidTarget);
    }
    let rotation_draft=preview_existing_grid_orientation(
        &coordinate_draft.patched_json,target,
        expected_orientation,replacement_orientation
    )?;
    if !rotation_draft.changed||!rotation_draft.untouched_bytes_preserved||
       rotation_draft.writer_authorized||rotation_draft.export_authorized{
        return Err(PatchError::InvalidTarget);
    }
    Ok(rotation_draft)
}

/// One experimental mutation of an *existing* saved native GridObject.
/// `position` and `orientation` are independently optional, but at
/// least one must change. Every expected field is checked against the
/// immutable source, prior to any generated candidate.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct GridMixedEdit {
    pub target:GridCoordinateTarget,
    pub expected:(i32,i32),
    pub position:Option<(i32,i32)>,
    pub orientation:Option<(String,String)>,
}

/// Apply up to MAX_GRID_MIXED_EDITS distinct existing-object mutations.
/// Capture exact scalar token spans in ONE strict original-document walk.
/// Validate every original field and assemble one output only after all
/// edits pass. No intermediate full-document clones or repeated scans.
pub fn preview_existing_grid_mixed_batch(
    source:&str,edits:&[GridMixedEdit]
)->Result<GridCoordinateDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||
       edits.is_empty()||edits.len()>MAX_GRID_MIXED_EDITS{
        return Err(PatchError::InvalidTarget);
    }
    let mut seen=HashSet::new();
    let mut parser=JsonLocator::grid_axis(source,&edits[0].target,"X")?;
    parser.signed_path=None;parser.item_path=None;
    let mut fields=Vec::with_capacity(edits.len());
    for edit in edits{
        if !seen.insert((edit.target.kind,edit.target.grid_id.as_str(),
            edit.target.object_id.as_str()))||
           (edit.position.is_none()&&edit.orientation.is_none()){
            return Err(PatchError::AmbiguousTarget);
        }
        if edit.position==Some(edit.expected){return Err(PatchError::InvalidTarget);}
        if let Some((before,after))=&edit.orientation{
            if before==after||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&before.as_str())||
                !OBSERVED_CARDINAL_ORIENTATIONS.contains(&after.as_str()){
                return Err(PatchError::InvalidTarget);
            }
        }
        let locator=JsonLocator::grid_axis(source,&edit.target,"X")?;
        let x=locator.signed_path.ok_or(PatchError::InvalidTarget)?;
        let item=locator.item_path.ok_or(PatchError::InvalidTarget)?;
        let mut y=x.clone();*y.last_mut().ok_or(PatchError::InvalidTarget)?=k("Y");
        let mut orientation=x.clone();*orientation.last_mut().ok_or(PatchError::InvalidTarget)?=k("Orientation");
        for p in [&x,&y,&item]{parser.capture.insert(p.clone(),None);}
        if edit.orientation.is_some(){parser.capture.insert(orientation.clone(),None);}
        fields.push((x,y,item,orientation));
    }
    parser.walk_complete()?;
    let span=|path:&Vec<Segment>|->Result<Range<usize>,PatchError>{
        parser.capture.get(path).and_then(|r|r.clone()).ok_or(PatchError::MissingTarget)
    };
    let mut replacements:Vec<(Range<usize>,String)>=Vec::with_capacity(edits.len()*3);
    for (edit,(xp,yp,ip,op)) in edits.iter().zip(&fields){
        let xr=span(xp)?;let yr=span(yp)?;let ir=span(ip)?;
        let item=source[ir].parse::<u64>().map_err(|_|PatchError::NonIntegerTarget)?;
        if item>MAX_SAFE_JSON_INTEGER{return Err(PatchError::NonIntegerTarget);}
        if item!=edit.target.item_id{return Err(PatchError::ItemMismatch);}
        let x=source[xr.clone()].parse::<i32>().map_err(|_|PatchError::NonIntegerTarget)?;
        let y=source[yr.clone()].parse::<i32>().map_err(|_|PatchError::NonIntegerTarget)?;
        if (x,y)!=edit.expected{return Err(PatchError::CoordinateMismatch);}
        if let Some((nx,ny))=edit.position{
            // Preserve an unchanged axis token verbatim, even when moving
            // along the other axis (e.g. lexical "-0").
            if nx!=x{replacements.push((xr,nx.to_string()));}
            if ny!=y{replacements.push((yr,ny.to_string()));}
        }
        if let Some((before,after))=&edit.orientation{
            let range=span(op)?;
            let actual:String=serde_json::from_str(&source[range.clone()])
                .map_err(|_|PatchError::MissingTarget)?;
            if &actual!=before{return Err(PatchError::OrientationMismatch);}
            replacements.push((range,format!("\"{}\"",after)));
        }
    }
    replacements.sort_unstable_by_key(|(r,_)|r.start);
    let mut last=0usize;
    let mut final_len=source.len();
    for (r,value) in &replacements{
        if r.start<last{return Err(PatchError::AmbiguousTarget);}
        final_len=final_len.checked_sub(r.len()).and_then(|n|n.checked_add(value.len()))
            .ok_or(PatchError::InvalidDocument)?;
        last=r.end;
    }
    if final_len>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
    let mut candidate=String::with_capacity(final_len);
    last=0;
    for (r,value) in replacements{
        candidate.push_str(&source[last..r.start]);candidate.push_str(&value);last=r.end;
    }
    candidate.push_str(&source[last..]);
    Ok(GridCoordinateDraft{patched_json:candidate,changed:true,
        untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}


/// Structural edit preview, limited to one plain furniture record in an
/// explicit full Grid. This is deliberately NOT a save export authority:
/// runtime allocator and incoming reference closure still need verification.
#[derive(Debug,Clone,PartialEq,Eq)]
pub enum PlainGridStructureAction {
    Duplicate { x:i32,y:i32 },
    Add { item_id:u64,x:i32,y:i32,orientation:String },
    Remove,
}
fn plain_furniture_id(id:u64)->bool {
    // Ordinary furniture family only; no roads, fences, buildings, or
    // subtype assumptions for items with saved state.
    id/10_000_000==4 && !matches!((id%10_000_000)/100_000,1|7)
}
pub fn preview_plain_grid_structure(
    source:&str,target:&GridCoordinateTarget,expected:(i32,i32),
    action:PlainGridStructureAction
)->Result<GridCoordinateDraft,PatchError>{
    preview_grid_structure(source,target,expected,action,false)
}
fn preview_grid_structure(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),action:PlainGridStructureAction,support_parent:bool)->Result<GridCoordinateDraft,PatchError>{
    if support_parent&&!matches!(&action,PlainGridStructureAction::Remove){return Err(PatchError::InvalidTarget);}
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||
       target.kind!=GridObjectKind::Full||!plain_furniture_id(target.item_id){
        return Err(PatchError::InvalidTarget);
    }
    let mut parser=JsonLocator::grid_axis(source,target,"X")?;
    parser.signed_path=None;parser.item_path=None;
    let mut parent=vec![k("World"),k("GridCollection"),k("Grids"),k(&target.grid_id),k("Objects")];
    let mut selected=parent.clone();selected.push(k(&target.object_id));
    let mut counter=parent.clone();counter.pop();counter.push(k("NextGridObjectID"));
    let mut diff=vec![k("World"),k("GridCollection"),k("DiffGrids"),k(&target.grid_id)];
    parser.capture.insert(parent.clone(),None);
    parser.capture.insert(selected.clone(),None);
    parser.capture.insert(counter.clone(),None);
    parser.capture.insert(std::mem::take(&mut diff),None);
    parser.walk_complete()?;
    if parser.capture.get(&vec![k("World"),k("GridCollection"),k("DiffGrids"),k(&target.grid_id)]).is_some_and(|v|v.is_some()){
        return Err(PatchError::AmbiguousTarget);
    }
    let span=|p:&Vec<Segment>|parser.capture.get(p).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget);
    let object_range=span(&selected)?;
    let old:serde_json::Value=serde_json::from_str(&source[object_range.clone()]).map_err(|_|PatchError::InvalidDocument)?;
    let obj=old.as_object().ok_or(PatchError::InvalidTarget)?;
    let id=target.object_id.parse::<u32>().map_err(|_|PatchError::InvalidTarget)?;
    let state_ok=if support_parent{obj.len()==6&&old.get("State").and_then(|v|v.as_object()).is_some_and(|s|s.len()==1&&s.get("SubGrid").and_then(|v|v.get("GridID")).and_then(|v|v.as_u64()).is_some_and(|n|n>0))}else{obj.len()==5||obj.len()==6&&old.get("State").is_some_and(|v|v.is_null())};
    if id==0||!state_ok||obj.keys().any(|key|!matches!(key.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
       old.get("ID").and_then(|v|v.as_u64())!=Some(id as u64)||
       old.get("ItemID").and_then(|v|v.as_u64())!=Some(target.item_id){
        return Err(PatchError::InvalidTarget);
    }
    if old.get("X").and_then(|v|v.as_i64())!=Some(expected.0 as i64)||
       old.get("Y").and_then(|v|v.as_i64())!=Some(expected.1 as i64){
        return Err(PatchError::CoordinateMismatch);
    }
    let original_orientation=old.get("Orientation").and_then(|v|v.as_str()).ok_or(PatchError::OrientationMismatch)?;
    if !OBSERVED_CARDINAL_ORIENTATIONS.contains(&original_orientation){return Err(PatchError::OrientationMismatch);}
    let map_range=span(&parent)?;
    let objects:serde_json::Map<String,serde_json::Value>=serde_json::from_str(&source[map_range.clone()]).map_err(|_|PatchError::InvalidDocument)?;
    if objects.len()>100_000{return Err(PatchError::InvalidTarget);}
    let mut replacements=Vec::<(Range<usize>,String)>::new();
    match action{
        PlainGridStructureAction::Remove=>{
            // Remove only this member and one adjacent comma. Preserve every
            // other member byte exactly, even unknown fields and whitespace.
            let mut locator=JsonLocator::grid_axis(source,target,"X")?;
            locator.pos=map_range.start;locator.expect(b'{')?;
            let mut previous_comma=None;
            loop{
                locator.space();let start=locator.pos;
                let key=locator.string()?;locator.expect(b':')?;
                let mut path=parent.clone();path.push(k(&key));
                locator.value(&mut path)?;
                let end=locator.pos;locator.space();
                if key==target.object_id{
                    let range=if locator.bytes.get(locator.pos)==Some(&b','){start..locator.pos+1}
                        else if let Some(comma)=previous_comma{comma..end}else{start..end};
                    replacements.push((range,String::new()));break;
                }
                if locator.bytes.get(locator.pos)!=Some(&b','){return Err(PatchError::MissingTarget);}
                previous_comma=Some(locator.pos);locator.pos+=1;
            }
        },
        action=>{
            let (item_id,x,y,orientation)=match action{
                PlainGridStructureAction::Duplicate{x,y}=>(target.item_id,x,y,original_orientation.to_owned()),
                PlainGridStructureAction::Add{item_id,x,y,orientation}=>(item_id,x,y,orientation),
                PlainGridStructureAction::Remove=>unreachable!()
            };
            if !plain_furniture_id(item_id)||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation.as_str()){
                return Err(PatchError::InvalidTarget);
            }
            let cr=span(&counter)?;
            let next=source[cr.clone()].parse::<u32>().map_err(|_|PatchError::NonIntegerTarget)?;
            // Do not repair a stale counter or guess whether old IDs can be
            // reused. Require an explicit value above every observed ID.
            if next==0||objects.keys().any(|key|key.parse::<u32>().ok().is_none_or(|n|n.to_string()!=key.as_str()||n>=next)){
                return Err(PatchError::AmbiguousTarget);
            }
            let following=next.checked_add(1).ok_or(PatchError::InvalidTarget)?;
            let member=format!(",\"{}\":{{\"ID\":{},\"ItemID\":{},\"X\":{},\"Y\":{},\"Orientation\":\"{}\"}}",
                next,next,item_id,x,y,orientation);
            replacements.push((map_range.end-1..map_range.end-1,member));
            replacements.push((cr,following.to_string()));
        }
    }
    replacements.sort_unstable_by_key(|(r,_)|r.start);
    let mut candidate=String::new();let mut last=0;
    for (r,v) in replacements{if r.start<last{return Err(PatchError::AmbiguousTarget);}candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}
    candidate.push_str(&source[last..]);
    validate_json_without_edit(&candidate)?;
    Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

/// Destination witness for a private transfer rehearsal. Native IDs stay
/// inside Rust; callers must resolve these from the current Save and exact
/// original world source, never infer them from an area label.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct PlainGridDestination {
    pub grid_id:String,
    pub layout_path:String,
    pub data_path:String,
    pub tessellation:u32,
    pub size:(u32,u32),
}
pub fn native_village_grid_scope(root:&serde_json::Value,grid_id:&str,data:&str)->Option<&'static str>{
 let id=grid_id.parse::<u64>().ok()?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return None;}
 let mut owner=None;
 for village in root["World"]["Villages"].as_array()?{
  for area in village["Areas"].as_object()?.values(){
   let count=area["GridIDs"].as_array()?.iter().filter(|n|n.as_u64()==Some(id)).count();
   if count==0{continue;} if count!=1||owner.is_some(){return None;}
   owner=Some(match village["SceneItemId"].as_u64()?{1540000000=>"Village04",1540000101=>"VillageExpansion01",1540000119=>"VillageExpansion02",1540000162=>"VillageExpansion03",1540000209=>"VillageExpansion04",1540000210=>"VillageWinnieDLC",_=>return None});
  }
 }
 owner.filter(|scope|outdoor_world_path(scope,data))
}
pub fn full_grid_source_matches(root:&serde_json::Value,id:&str,g:&serde_json::Value,layout:&str,data:&str)->bool{
 if g["GridDataPath"].as_str()!=Some(data){return false;}
 match g["GridDefaultLayoutPath"].as_str(){Some("")=>native_village_grid_scope(root,id,data).is_some_and(|scope|full_grid_scope(layout)==Some(scope)),Some(actual)=>actual==layout,None=>false}
}
fn saved_full_grid_scope<'a>(root:&serde_json::Value,id:&str,g:&'a serde_json::Value)->Option<&'a str>{let layout=g["GridDefaultLayoutPath"].as_str()?;if layout.is_empty(){native_village_grid_scope(root,id,g["GridDataPath"].as_str()?)}else{full_grid_scope(layout)}}
fn full_grid_scope(layout:&str)->Option<&str>{
    let (scope,leaf)=layout.strip_prefix("SceneLayouts/")?.split_once('/')?;
    (!scope.is_empty()&&!leaf.is_empty()&&leaf.ends_with(".json")&&!layout.contains("..")&&!layout.contains('\\')).then_some(scope)
}
/// Build one private remove+insert candidate, allocating only from the
/// destination's explicit monotonically increasing counter. This is NOT
/// runtime reference closure, item eligibility, or Save export authority.
/// Source records with any state/unknown fields are rejected, not truncated.
pub fn preview_plain_grid_transfer(
    source:&str,target:&GridCoordinateTarget,expected:(i32,i32),
    destination:&PlainGridDestination,replacement:(i32,i32),
    orientation:&str,
)->Result<GridCoordinateDraft,PatchError>{
    preview_grid_transfer(source,target,expected,destination,replacement,orientation,false,false)
}
/// Only for an exact owned support hierarchy resolved by the codec.
pub fn preview_support_parent_grid_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),destination:&PlainGridDestination,replacement:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
    preview_grid_transfer(source,target,expected,destination,replacement,orientation,true,false)
}
/// Only for ordinary, state-free furniture in a source-backed outdoor world.
/// The codec must prove the exact old/new identities and reject references.
/// The older same-scope and support-parent APIs remain unchanged.
pub fn preview_plain_world_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),destination:&PlainGridDestination,replacement:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
    preview_grid_transfer(source,target,expected,destination,replacement,orientation,false,true)
}
fn outdoor_world_path(scope:&str,path:&str)->bool{
    if path.contains("..")||path.contains('\\')||!path.ends_with(".json"){return false;}
    match scope{
        "Village04"=>path.starts_with("GridData/Villages/Village04-"),
        "VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC"=>{
            path.strip_prefix("GridData/Villages/").and_then(|s|s.strip_prefix(scope)).and_then(|s|s.strip_prefix('/')).is_some_and(|s|s.starts_with(scope)&&s.as_bytes().get(scope.len())==Some(&b'-')&&!s.contains('/'))
        },
        _=>false
    }
}
fn preview_grid_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),destination:&PlainGridDestination,replacement:(i32,i32),orientation:&str,support_parent:bool,allow_world_change:bool)->Result<GridCoordinateDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||target.kind!=GridObjectKind::Full||
       target.grid_id==destination.grid_id||!valid_id(&destination.grid_id)||
       destination.grid_id.starts_with('0')||
       !matches!(destination.tessellation,1|2)||
       destination.size.0==0||destination.size.1==0||
       destination.size.0>65536||destination.size.1>65536||
       !OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||
       replacement.0<0||replacement.1<0||
       replacement.0 as u32>=destination.size.0*destination.tessellation||
       replacement.1 as u32>=destination.size.1*destination.tessellation{
        return Err(PatchError::InvalidTarget);
    }
    let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
    let grids=collection.get("Grids").and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
    let from=grids.get(&target.grid_id).and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
    let to=grids.get(&destination.grid_id).and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
    let from_layout=from.get("GridDefaultLayoutPath").and_then(|v|v.as_str()).ok_or(PatchError::MissingTarget)?;
    let to_scope=full_grid_scope(&destination.layout_path).ok_or(PatchError::InvalidTarget)?;
    let from_scope=full_grid_scope(from_layout).ok_or(PatchError::InvalidTarget)?;
    let same_world=from_scope==to_scope;
    // Landscape is an identity-preserving logical move, not an inventory
    // pickup or grant. Limit it to verified outdoor source path families
    // within one world, with unchanged orientation and native resolution.
    if target.item_id/100_000==402&&(!same_world||support_parent||
       from.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(destination.tessellation))||
       !from.get("GridDataPath").and_then(|v|v.as_str()).is_some_and(|path|outdoor_world_path(from_scope,path))||
       !outdoor_world_path(to_scope,&destination.data_path)||
       from.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(|v|v.get("Orientation")).and_then(|v|v.as_str())!=Some(orientation)){
        return Err(PatchError::InvalidTarget);
    }
    if !same_world&&(!allow_world_change||support_parent||target.item_id/100_000!=400||
       !from.get("GridDataPath").and_then(|v|v.as_str()).is_some_and(|path|outdoor_world_path(from_scope,path))||
       !outdoor_world_path(to_scope,&destination.data_path)){return Err(PatchError::InvalidTarget);}
    if from.get("ID").and_then(|v|v.as_u64())!=target.grid_id.parse::<u64>().ok()||
       !destination.data_path.starts_with("GridData/")||
       !destination.data_path.ends_with(".json")||destination.data_path.contains("..")||destination.data_path.contains('\\')||
       (from_layout==destination.layout_path&&from.get("GridDataPath").and_then(|v|v.as_str())==Some(destination.data_path.as_str()))||
       !full_grid_source_matches(&root,&destination.grid_id,to,&destination.layout_path,&destination.data_path)||
       to.get("GridDataPath").and_then(|v|v.as_str())!=Some(destination.data_path.as_str())||
       to.get("ID").and_then(|v|v.as_u64())!=destination.grid_id.parse::<u64>().ok()||
       to.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(destination.tessellation as u64)||
       grids.values().filter(|g|g.get("GridDefaultLayoutPath").and_then(|v|v.as_str())==Some(destination.layout_path.as_str())&&
          g.get("GridDataPath").and_then(|v|v.as_str())==Some(destination.data_path.as_str())).count()!=1||
       collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|g|g.contains_key(&target.grid_id)||g.contains_key(&destination.grid_id))){
        return Err(PatchError::AmbiguousTarget);
    }
    // The existing removal contract proves the source is a plain, exact
    // five-field record, and the byte locator rejects duplicate JSON keys.
    // Preserve the exact lexical State of the parent, not a reserialized or synthesized child reference.
    let state=if support_parent{
        if target.item_id/100_000!=400||from.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(destination.tessellation)){return Err(PatchError::InvalidTarget);}
        let mut locator=JsonLocator::grid_axis(source,target,"X")?;
        locator.signed_path=None;locator.item_path=None;
        let path=vec![k("World"),k("GridCollection"),k("Grids"),k(&target.grid_id),k("Objects"),k(&target.object_id),k("State")];
        locator.capture.insert(path.clone(),None);locator.walk_complete()?;
        let range=locator.capture.get(&path).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
        Some(&source[range])
    }else{None};
    if support_parent&&to.get("Objects").and_then(|v|v.as_object()).is_none_or(|m|m.values().any(|v|v.get("X").and_then(|v|v.as_i64())==Some(i64::from(replacement.0))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(replacement.1)))){return Err(PatchError::AmbiguousTarget);}
    let removed=preview_grid_structure(source,target,expected,PlainGridStructureAction::Remove,support_parent)?;
    insert_grid_record(&removed.patched_json,destination,target.item_id,replacement,orientation,state)
}

/// Private common allocator, including an empty Objects map.
/// It is called only after the destination witness has been validated.
fn insert_plain_grid_record(intermediate:&str,destination:&PlainGridDestination,item_id:u64,replacement:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
    insert_grid_record(intermediate,destination,item_id,replacement,orientation,None)
}
fn insert_grid_record(intermediate:&str,destination:&PlainGridDestination,item_id:u64,replacement:(i32,i32),orientation:&str,state:Option<&str>)->Result<GridCoordinateDraft,PatchError>{
    let selector=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:destination.grid_id.clone(),object_id:"1".into(),item_id};
    let mut locator=JsonLocator::grid_axis(intermediate,&selector,"X")?;
    locator.signed_path=None;locator.item_path=None;
    let prefix=vec![k("World"),k("GridCollection"),k("Grids"),k(&destination.grid_id)];
    let mut objects=prefix.clone();objects.push(k("Objects"));
    let mut counter=prefix;counter.push(k("NextGridObjectID"));
    locator.capture.insert(objects.clone(),None);locator.capture.insert(counter.clone(),None);locator.walk_complete()?;
    let span=|p:&Vec<Segment>|locator.capture.get(p).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget);
    let mr=span(&objects)?;let cr=span(&counter)?;
    let map:serde_json::Map<String,serde_json::Value>=serde_json::from_str(&intermediate[mr.clone()]).map_err(|_|PatchError::InvalidDocument)?;
    let next=intermediate[cr.clone()].parse::<u32>().map_err(|_|PatchError::NonIntegerTarget)?;
    if map.len()>=100_000||next==0||map.iter().any(|(key,obj)|key.parse::<u32>().ok().is_none_or(|n|n==0||n.to_string()!=*key||n>=next||obj.get("ID").and_then(|v|v.as_u64())!=Some(n as u64))){
        return Err(PatchError::AmbiguousTarget);
    }
    let following=next.checked_add(1).ok_or(PatchError::InvalidTarget)?;
    let suffix=state.map(|s|format!(",\"State\":{}",s)).unwrap_or_default();
    let member=format!("{}\"{}\":{{\"ID\":{},\"ItemID\":{},\"X\":{},\"Y\":{},\"Orientation\":\"{}\"{}}}",
        if map.is_empty(){""}else{","},next,next,item_id,replacement.0,replacement.1,orientation,suffix);
    let mut replacements=[(mr.end-1..mr.end-1,member),(cr,following.to_string())];
    replacements.sort_unstable_by_key(|(r,_)|r.start);
    let mut candidate=String::new();let mut last=0;
    for (r,v) in replacements{if r.start<last{return Err(PatchError::AmbiguousTarget);}candidate.push_str(&intermediate[last..r.start]);candidate.push_str(&v);last=r.end;}
    candidate.push_str(&intermediate[last..]);
    if candidate.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
    validate_json_without_edit(&candidate)?;
    Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

/// Exact observed player-house exterior schema. The interior is referenced,
/// not cloned; unknown state and non-player buildings are not eligible.
pub fn player_house_state<'a>(root:&serde_json::Value,obj:&'a serde_json::Value,item:u64)->Option<&'a serde_json::Value>{
 let o=obj.as_object()?;
 if item/100_000!=205||o.len()!=6||o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||obj["ItemID"].as_u64()!=Some(item){return None;}
 let state=obj.get("State")?;if state.as_object()?.len()!=1{return None;}
 let h=state["HouseData"].as_object()?;
 if h.len()!=3||h.get("Built")?.as_bool()!=Some(true){return None;}
 let upgrade=h.get("UpgradeState")?;
 if !upgrade.is_null()&&!upgrade.as_object().is_some_and(|v|v.len()==1&&v.get("Level").and_then(|n|n.as_u64()).is_some_and(|n|n<=u32::MAX as u64)){return None;}
 let index=usize::try_from(h.get("PlayerHouseIndex")?.as_u64()?).ok()?;
 let house=root["World"]["PlayerHouses"].as_array()?.get(index)?;
 if house["HouseItemID"].as_u64()!=Some(item)||!house["Floors"].as_array().is_some_and(|a|!a.is_empty()){return None;}
 Some(state)
}
pub fn preview_player_house_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32))->Result<GridCoordinateDraft,PatchError>{
 let bad=PatchError::InvalidTarget;
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||target.kind!=GridObjectKind::Full||!matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||xy.0<0||xy.1<0||xy.0 as u32>=d.size.0*d.tessellation||xy.1 as u32>=d.size.1*d.tessellation{return Err(bad);}
 let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let c=&root["World"]["GridCollection"];let grids=c["Grids"].as_object().ok_or(bad)?;
 let from=grids.get(&target.grid_id).ok_or(bad)?;let to=grids.get(&d.grid_id).ok_or(bad)?;
 let scope=saved_full_grid_scope(&root,&target.grid_id,from).ok_or(bad)?;
 if full_grid_scope(&d.layout_path)!=Some(scope)||!from["GridDataPath"].as_str().is_some_and(|p|outdoor_world_path(scope,p))||!outdoor_world_path(scope,&d.data_path)||
 !full_grid_source_matches(&root,&d.grid_id,to,&d.layout_path,&d.data_path)||
 from["ID"].as_u64()!=target.grid_id.parse::<u64>().ok()||to["ID"].as_u64()!=d.grid_id.parse::<u64>().ok()||
 from["TessellationFactor"].as_u64()!=Some(u64::from(d.tessellation))||to["TessellationFactor"].as_u64()!=Some(u64::from(d.tessellation))||
 c.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&target.grid_id)||m.contains_key(&d.grid_id))){return Err(bad);}
 let obj=from["Objects"].get(&target.object_id).ok_or(bad)?;
 if obj["ID"].as_u64()!=target.object_id.parse::<u64>().ok()||obj["X"].as_i64()!=Some(i64::from(expected.0))||obj["Y"].as_i64()!=Some(i64::from(expected.1)){return Err(bad);}
 let state=player_house_state(&root,obj,target.item_id).ok_or(bad)?;
 let orientation=obj["Orientation"].as_str().filter(|v|OBSERVED_CARDINAL_ORIENTATIONS.contains(v)).ok_or(bad)?;
 let raw=serde_json::to_string(state).map_err(|_|bad)?;
 insert_grid_record(source,d,target.item_id,xy,orientation,Some(&raw))
}

/// State-free landscape only, using an observed source record and a resolved outdoor
/// destination. No inventory, ownership or collection mutation.
pub fn preview_landscape_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),destination:&PlainGridDestination,replacement:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
    if target.item_id/100_000!=402||!matches!(destination.tessellation,1|2)||destination.size.0==0||destination.size.1==0||
       destination.size.0>65536||destination.size.1>65536||replacement.0<0||replacement.1<0||
       replacement.0 as u32>=destination.size.0*destination.tessellation||replacement.1 as u32>=destination.size.1*destination.tessellation||
       !OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(PatchError::InvalidTarget);}
    // Exercise the same exact plain-record guard without retaining the removal.
    let _=preview_plain_grid_structure(source,target,expected,PlainGridStructureAction::Remove)?;
    let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
    let grids=collection.get("Grids").and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
    let from=grids.get(&target.grid_id).ok_or(PatchError::MissingTarget)?;
    let to=grids.get(&destination.grid_id).ok_or(PatchError::MissingTarget)?;
    let scope=saved_full_grid_scope(&root,&target.grid_id,from).ok_or(PatchError::InvalidTarget)?;
    if full_grid_scope(&destination.layout_path)!=Some(scope)||
       !from.get("GridDataPath").and_then(|v|v.as_str()).is_some_and(|p|outdoor_world_path(scope,p))||
       !outdoor_world_path(scope,&destination.data_path)||
       from.get("TessellationFactor").map_or(Some(1),serde_json::Value::as_u64)!=Some(u64::from(destination.tessellation))||
       to.get("TessellationFactor").map_or(Some(1),serde_json::Value::as_u64)!=Some(u64::from(destination.tessellation))||
       to.get("ID").and_then(|v|v.as_u64())!=destination.grid_id.parse::<u64>().ok()||
       !full_grid_source_matches(&root,&destination.grid_id,to,&destination.layout_path,&destination.data_path)||
       to.get("GridDataPath").and_then(|v|v.as_str())!=Some(destination.data_path.as_str())||
       from.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(|v|v.get("Orientation")).and_then(|v|v.as_str())!=Some(orientation)||
       collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&target.grid_id)||m.contains_key(&destination.grid_id)))||
       to.get("Objects").and_then(|v|v.as_object()).is_none_or(|m|m.values().any(|v|v.get("X").and_then(|v|v.as_i64())==Some(i64::from(replacement.0))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(replacement.1)))){return Err(PatchError::InvalidTarget);}
    insert_plain_grid_record(source,destination,target.item_id,replacement,orientation)
}

fn landscape_grid_path(layout:&str,data:&str)->bool{
 let Some(scope)=full_grid_scope(layout)else{return false;};
 if scope!="FloatingIslands"{return outdoor_world_path(scope,data);}
 let Some(family)=layout.strip_prefix("SceneLayouts/FloatingIslands/").and_then(|s|s.split('/').next())else{return false;};
 let Some(name)=family.strip_prefix("FloatingIsland_")else{return false;};
 if !["Atlantean","Beach","Dark","Desert","FairyTales","Forest","Jungle","Library","Meadow","Mythology","Savannah","Snow","Urban","Wetlands"].contains(&name)||
    layout!=format!("SceneLayouts/FloatingIslands/{family}/{family}Layout.json"){return false;}
 let folder=if name=="Desert"{"FloatingIlsnad_Desert"}else{family};
 data.strip_prefix(&format!("GridData/FloatingIslands/{folder}/{family}")).is_some_and(|s|s.ends_with("-GridData.json")&&!s.contains('/')&&!s.contains('\\')&&!s.contains(".."))
}

/// Restore a source-validated landscape pose without touching inventory.
pub fn preview_landscape_place(source:&str,d:&PlainGridDestination,item:u64,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if item/100_000!=402||!matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||
    xy.0<0||xy.1<0||xy.0 as u32>=d.size.0*d.tessellation||xy.1 as u32>=d.size.1*d.tessellation||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(PatchError::InvalidTarget);}
 if !landscape_grid_path(&d.layout_path,&d.data_path){return Err(PatchError::InvalidTarget);}
 let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grid=collection.get("Grids").and_then(|v|v.get(&d.grid_id)).ok_or(PatchError::MissingTarget)?;
 if grid.get("ID").and_then(|v|v.as_u64())!=d.grid_id.parse::<u64>().ok()||
    !full_grid_source_matches(&root,&d.grid_id,grid,&d.layout_path,&d.data_path)||
    grid.get("GridDataPath").and_then(|v|v.as_str())!=Some(d.data_path.as_str())||
    grid.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(d.tessellation))||
    collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&d.grid_id)))||
    grid.get("Objects").and_then(|v|v.as_object()).is_none_or(|m|m.values().any(|v|v.get("ItemID").and_then(|v|v.as_u64()).is_some_and(|id|id/100_000!=401)&&v.get("X").and_then(|v|v.as_i64())==Some(i64::from(xy.0))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(xy.1)))){return Err(PatchError::InvalidTarget);}
 insert_plain_grid_record(source,d,item,xy,orientation)
}

/// Experimental cardinal Main Street road cells. Inherited v1.25 direct
/// writer semantics: ownership and Collection remain unchanged. This is
/// deliberately not the ordinary furniture stock transaction.
pub const MAX_CARDINAL_ROAD_CELLS:usize=256;
pub const MAIN_STREET_ROAD:u64=40100068;
pub fn preview_cardinal_road_cells(source:&str,d:&PlainGridDestination,cells:&[(i32,i32)],erase:bool)->Result<GridCoordinateDraft,PatchError>{
 preview_cardinal_road_style(source,d,MAIN_STREET_ROAD,cells,erase)
}
/// The caller has established current original Road/Path identity, exact
/// square shape, and an observed cardinal seed in the source Grid.
pub fn preview_cardinal_road_style(source:&str,d:&PlainGridDestination,item_id:u64,cells:&[(i32,i32)],erase:bool)->Result<GridCoordinateDraft,PatchError>{
 preview_road_mutation(source,d,item_id,cells,erase,false,None)
}
/// Known native road state, exact and without additional unrecognized fields.
pub fn road_mode(v:&serde_json::Value)->Option<bool>{
 match v.get("State"){None|Some(serde_json::Value::Null)=>Some(false),Some(s) if s==&serde_json::json!({"FenceMode":{"Diagonal":true}})=>Some(true),_=>None}
}
/// Test copy only. Replacement allocates new identities and preserves each
/// selected cell's exact known mode. Unselected records are never normalized.
pub fn preview_road_mutation(source:&str,d:&PlainGridDestination,item_id:u64,cells:&[(i32,i32)],erase:bool,diagonal:bool,replacement:Option<u64>)->Result<GridCoordinateDraft,PatchError>{
 use serde_json::Value;
 if replacement.is_some_and(|id|id==item_id||id/100_000!=401)||erase&&replacement.is_some(){return Err(PatchError::InvalidTarget);}
 if item_id/100_000!=401||source.is_empty()||source.len()>MAX_PROFILE_BYTES||cells.is_empty()||cells.len()>MAX_CARDINAL_ROAD_CELLS||
    !matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||
    !valid_id(&d.grid_id)||d.grid_id.starts_with('0')||full_grid_scope(&d.layout_path).is_none(){return Err(PatchError::InvalidTarget);}
 let pitch=2*d.tessellation as i32;
 let requested:HashSet<_>=cells.iter().copied().collect();
 if requested.len()!=cells.len()||cells.iter().any(|&(x,y)|x<0||y<0||x%pitch!=0||y%pitch!=0||x+pitch>(d.size.0*d.tessellation) as i32||y+pitch>(d.size.1*d.tessellation) as i32){return Err(PatchError::InvalidTarget);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let grid=grids.get(&d.grid_id).ok_or(PatchError::MissingTarget)?;
 let matches=|g:&Value|g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(d.layout_path.as_str())&&g.get("GridDataPath").and_then(Value::as_str)==Some(d.data_path.as_str());
 if !matches(grid)||grids.values().filter(|g|matches(g)).count()!=1||
    grid.get("ID").and_then(Value::as_u64)!=d.grid_id.parse::<u64>().ok()||
    grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation))||
    collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|o|o.contains_key(&d.grid_id))){return Err(PatchError::AmbiguousTarget);}
 let map=grid.get("Objects").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let next=grid.get("NextGridObjectID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(PatchError::InvalidTarget)?;
 if map.len()>100_000||map.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|n|n==0||n>=next||n.to_string()!=*k||v.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(PatchError::AmbiguousTarget);}
 let mut removals=HashSet::<String>::new();let mut occupied=HashSet::new();let mut modes=HashMap::new();
 for (key,v) in map{
  let item=v.get("ItemID").and_then(Value::as_u64).ok_or(PatchError::InvalidTarget)?;
  if item/100_000!=401{continue;}
  let x=v.get("X").and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget)?;
  let y=v.get("Y").and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget)?;
  if !cells.iter().any(|&(a,b)|i64::from(x).abs_diff(i64::from(a))<=pitch as u64&&i64::from(y).abs_diff(i64::from(b))<=pitch as u64){continue;}
  // No diagonal/mixed or foreign road mode is silently normalized.
  if (item!=item_id&&replacement!=Some(item))||x%pitch!=0||y%pitch!=0||v.get("Orientation").and_then(Value::as_str)!=Some("GridOrientation_Down")||
     road_mode(v).is_none()||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
     !occupied.insert((x,y)){return Err(PatchError::InvalidTarget);}
  if requested.contains(&(x,y)){if item!=item_id||!erase&&replacement.is_none(){return Err(PatchError::AmbiguousTarget);}let mode=road_mode(v).ok_or(PatchError::InvalidTarget)?;if replacement.is_none()&&mode!=diagonal{return Err(PatchError::InvalidTarget);}modes.insert((x,y),mode);removals.insert(key.clone());}
  else if !diagonal&&replacement.is_none()&&road_mode(v)==Some(true){return Err(PatchError::InvalidTarget);}
 }
 if (erase||replacement.is_some())&&removals.len()!=cells.len(){return Err(PatchError::MissingTarget);}
 let count=if erase{0}else{cells.len() as u32};
 let following=next.checked_add(count).ok_or(PatchError::InvalidTarget)?;
 if map.len()+count as usize>100_000{return Err(PatchError::InvalidTarget);}
 // Locate exact raw member spans, preserve their order and contents.
 let selector=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id};
 let mut locator=JsonLocator::grid_axis(source,&selector,"X")?;locator.signed_path=None;locator.item_path=None;
 let prefix=vec![k("World"),k("GridCollection"),k("Grids"),k(&d.grid_id)];
 let mut parent=prefix.clone();parent.push(k("Objects"));let mut counter=prefix;counter.push(k("NextGridObjectID"));
 locator.capture.insert(parent.clone(),None);locator.capture.insert(counter.clone(),None);locator.walk_complete()?;
 let mr=locator.capture.get(&parent).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let cr=locator.capture.get(&counter).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(PatchError::InvalidTarget);}
 locator.capture.clear();locator.pos=mr.start;locator.expect(b'{')?;
 let mut members=Vec::<String>::new();let mut visited=0usize;
 loop{
  locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
  let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=parent.clone();p.push(k(&key));locator.value(&mut p)?;
  if !removals.contains(&key){members.push(source[start..locator.pos].to_owned());}
  visited+=1;locator.space();
  if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(PatchError::InvalidDocument);}
 }
 if visited!=map.len(){return Err(PatchError::InvalidDocument);}
 let mut additions=Vec::new();
 if !erase{let mut sorted=cells.to_vec();sorted.sort_unstable_by_key(|&(x,y)|(y,x));for (i,(x,y)) in sorted.into_iter().enumerate(){let id=next+i as u32;let mode=modes.get(&(x,y)).copied().unwrap_or(diagonal);let state=if mode{serde_json::json!({"FenceMode":{"Diagonal":true}})}else{Value::Null};let v=serde_json::json!({"ID":id,"ItemID":replacement.unwrap_or(item_id),"X":x,"Y":y,"Orientation":"GridOrientation_Down","State":state});members.push(format!("\"{}\":{}",id,v));additions.push((id.to_string(),v));}}
 let mut edits=vec![(mr,format!("{{{}}}",members.join(",")))];if !erase{edits.push((cr,following.to_string()));}edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::new();let mut last=0;for (r,v) in edits{candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&source[last..]);
 if candidate.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
 let target=root.get_mut("World").and_then(|v|v.get_mut("GridCollection")).and_then(|v|v.get_mut("Grids")).and_then(|v|v.get_mut(&d.grid_id)).ok_or(PatchError::MissingTarget)?;
 let objects=target.get_mut("Objects").and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?;
 for key in removals{objects.remove(&key);}for (key,value) in additions{objects.insert(key,value);}
 if !erase{target.as_object_mut().ok_or(PatchError::MissingTarget)?.insert("NextGridObjectID".into(),Value::from(following));}
 if serde_json::from_str::<Value>(&candidate).map_err(|_|PatchError::InvalidDocument)?!=root{return Err(PatchError::InvalidDocument);}
 validate_json_without_edit(&candidate)?;
 Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

#[cfg(test)]
mod cardinal_road_tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"Inventory":{"40100068":{"Amount":17,"Marker":"Favorite"}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40100068,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40000001,"X":8,"Y":4,"Orientation":"GridOrientation_Down","Unknown":1e2}}}}}}}"#;
 fn destination()->PlainGridDestination{PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Test.json".into(),tessellation:2,size:(20,20)}}
 #[test]fn road_add_erase_preserve_ownership_and_unknown_bytes(){
  let add=preview_cardinal_road_cells(SOURCE,&destination(),&[(8,4),(12,4)],false).unwrap();
  let old:serde_json::Value=serde_json::from_str(SOURCE).unwrap();let changed:serde_json::Value=serde_json::from_str(&add.patched_json).unwrap();
  assert_eq!(old["Player"],changed["Player"]);assert_eq!(old["GameInfo"],changed["GameInfo"]);assert!(add.patched_json.contains("\"Unknown\":1e2"));assert!(!add.export_authorized);
  let g=&changed["World"]["GridCollection"]["Grids"]["7"];assert_eq!(g["NextGridObjectID"],5);assert_eq!(g["Objects"]["3"]["State"],serde_json::Value::Null);
  let erased=preview_cardinal_road_cells(&add.patched_json,&destination(),&[(8,4),(12,4)],true).unwrap();let after:serde_json::Value=serde_json::from_str(&erased.patched_json).unwrap();
  assert_eq!(after["Player"],old["Player"]);assert_eq!(after["World"]["GridCollection"]["Grids"]["7"]["Objects"],old["World"]["GridCollection"]["Grids"]["7"]["Objects"]);assert_eq!(after["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],5);
 }
 #[test]fn diagonal_cells_and_replacement_preserve_mode_and_ownership(){
  let d=destination();
  let diagonal=preview_road_mutation(SOURCE,&d,MAIN_STREET_ROAD,&[(8,4),(12,4),(8,8),(12,8)],false,true,None).unwrap();
  let old:serde_json::Value=serde_json::from_str(SOURCE).unwrap();let first:serde_json::Value=serde_json::from_str(&diagonal.patched_json).unwrap();
  assert_eq!(old["Player"],first["Player"]);let g=&first["World"]["GridCollection"]["Grids"]["7"];
  assert_eq!(g["Objects"]["3"]["State"]["FenceMode"]["Diagonal"],true);assert!(g["Objects"]["1"]["State"].is_null());
  let changed=preview_road_mutation(&diagonal.patched_json,&d,MAIN_STREET_ROAD,&[(4,4),(8,4)],false,false,Some(40100038)).unwrap();
  let actual:serde_json::Value=serde_json::from_str(&changed.patched_json).unwrap();
  assert_eq!(actual["Player"],old["Player"]);let g=&actual["World"]["GridCollection"]["Grids"]["7"];
  assert!(g["Objects"]["7"]["State"].is_null());assert_eq!(g["Objects"]["8"]["State"]["FenceMode"]["Diagonal"],true);
  assert_eq!(g["Objects"]["7"]["ItemID"],40100038);assert_eq!(g["Objects"]["8"]["ItemID"],40100038);
  assert_eq!(g["Objects"]["2"],old["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]);
  assert!(changed.patched_json.contains("\"Unknown\":1e2"));
  assert!(preview_road_mutation(&diagonal.patched_json,&d,MAIN_STREET_ROAD,&[(4,4)],true,true,None).is_err());
  let removed=preview_road_mutation(&diagonal.patched_json,&d,MAIN_STREET_ROAD,&[(8,4),(12,4)],true,true,None).unwrap();
  let actual:serde_json::Value=serde_json::from_str(&removed.patched_json).unwrap();
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],7);
  assert_eq!(actual["Player"],old["Player"]);
 }
 #[test]fn other_cardinal_style_and_large_stroke_preserve_player(){
  let source=SOURCE.replace("40100068","40100038");
  let cells:Vec<_>=(0..8).flat_map(|y|(0..8).map(move |x|(12+x*4,12+y*4))).collect();
  let mut d=destination();d.size=(40,40);
  let changed=preview_cardinal_road_style(&source,&d,40100038,&cells,false).unwrap();
  let old:serde_json::Value=serde_json::from_str(&source).unwrap();let actual:serde_json::Value=serde_json::from_str(&changed.patched_json).unwrap();
  assert_eq!(old["Player"],actual["Player"]);let grid=&actual["World"]["GridCollection"]["Grids"]["7"];
  assert_eq!(grid["NextGridObjectID"],67);assert_eq!(grid["Objects"]["3"]["ItemID"],40100038);
  assert!(preview_cardinal_road_style(&source,&d,40000001,&cells,false).is_err());
 }
 #[test]fn rejects_duplicate_off_lattice_and_unknown_neighbor(){
  for cells in [vec![(8,4),(8,4)],vec![(5,4)],vec![(4,4)],vec![(80,4)]]{assert!(preview_cardinal_road_cells(SOURCE,&destination(),&cells,false).is_err());}
  let unknown=SOURCE.replace("\"State\":null","\"State\":{\"FenceMode\":{\"Diagonal\":true}}");
  assert!(preview_cardinal_road_cells(&unknown,&destination(),&[(8,4)],false).is_err());
  assert!(preview_cardinal_road_cells(&unknown,&destination(),&[(4,4)],true).is_err());
  assert!(preview_cardinal_road_cells(SOURCE,&destination(),&[(12,4)],true).is_err());
 }
}
/// Insert an isolated new homogeneous fence component, never normalize
/// an existing native network. Current-source geometry must be validated by
/// the caller, separately from this native structure and identity gate.
pub fn preview_isolated_fence(source:&str,d:&PlainGridDestination,base:u32,diagonal:bool,nodes:&[fence_topology::Point],edges:&[(fence_topology::Point,fence_topology::Point)])->Result<GridCoordinateDraft,PatchError>{
 preview_isolated_fence_with_posts(source,d,base,diagonal,nodes,edges,&std::collections::BTreeSet::new())
}
/// Keep explicit representation posts when a portable scene is transformed.
/// The same native compiler and isolation checks remain authoritative.
pub fn preview_isolated_fence_with_posts(source:&str,d:&PlainGridDestination,base:u32,diagonal:bool,nodes:&[fence_topology::Point],edges:&[(fence_topology::Point,fence_topology::Point)],posts:&std::collections::BTreeSet<fence_topology::Point>)->Result<GridCoordinateDraft,PatchError>{
 use serde_json::Value;
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||!matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||!valid_id(&d.grid_id)||d.grid_id.starts_with('0')||full_grid_scope(&d.layout_path).is_none()||!d.data_path.starts_with("GridData/")||!d.data_path.ends_with(".json")||d.data_path.contains(".."){return Err(PatchError::InvalidTarget);}
 let parts=fence_topology::compile_fence_with_posts(base,d.tessellation,diagonal,nodes,edges,posts)?;
 // Ensure the supplied explicit graph equals the saved native topology.
 // In particular an accidental adjacent pair of endpoint posts must not
 // silently create an edge the user did not request.
 let (_,decoded)=fence_topology::decompile_fence(base,d.tessellation,diagonal,&parts)?;
 let canon=|a,b|if a<b{(a,b)}else{(b,a)};
 if decoded.into_iter().map(|(a,b)|canon(a,b)).collect::<HashSet<_>>()!=edges.iter().map(|&(a,b)|canon(a,b)).collect(){return Err(PatchError::InvalidTarget);}
 let q=d.tessellation as i32;let w=(d.size.0*d.tessellation) as i32;let h=(d.size.1*d.tessellation) as i32;
 if nodes.iter().any(|&(x,y)|x+q>w||y+q>h)||parts.iter().any(|p|{
   let Some(key)=fence_topology::part_key(base,diagonal,p.item) else{return true;};let k=key.max(1) as i32;
   let (dx,dy)=if diagonal{(k*q,k*q)}else if p.left{(q,k*q)}else{(k*q,q)};
   p.x+dx>w||p.y+dy>h
 }){return Err(PatchError::InvalidTarget);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let grid=grids.get(&d.grid_id).ok_or(PatchError::MissingTarget)?;
 let matches=|g:&Value|g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(d.layout_path.as_str())&&g.get("GridDataPath").and_then(Value::as_str)==Some(d.data_path.as_str());
 if !matches(grid)||grids.values().filter(|g|matches(g)).count()!=1||grid.get("ID").and_then(Value::as_u64)!=d.grid_id.parse::<u64>().ok()||
    grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation))||
    collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|o|o.contains_key(&d.grid_id))){return Err(PatchError::AmbiguousTarget);}
 let map=grid.get("Objects").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let next=grid.get("NextGridObjectID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(PatchError::InvalidTarget)?;
 let following=next.checked_add(parts.len() as u32).ok_or(PatchError::InvalidTarget)?;
 if map.len()+parts.len()>100_000||map.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|n|n==0||n>=next||n.to_string()!=*k||v.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(PatchError::AmbiguousTarget);}
 // Conservative isolation for the experimental first writer. Existing
 // components and their native representation posts remain untouched.
 for v in map.values(){
  let item=v.get("ItemID").and_then(Value::as_u64).ok_or(PatchError::InvalidTarget)?;
  if item/100_000!=407{continue;}
  let x=v.get("X").and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget)?;
  let y=v.get("Y").and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget)?;
  if nodes.iter().any(|&(a,b)|i64::from(x).abs_diff(i64::from(a))<=u64::from(d.tessellation)*8&&i64::from(y).abs_diff(i64::from(b))<=u64::from(d.tessellation)*8){return Err(PatchError::AmbiguousTarget);}
 }
 let selector=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id:u64::from(base)};
 let mut locator=JsonLocator::grid_axis(source,&selector,"X")?;locator.signed_path=None;locator.item_path=None;
 let prefix=vec![k("World"),k("GridCollection"),k("Grids"),k(&d.grid_id)];
 let mut parent=prefix.clone();parent.push(k("Objects"));let mut counter=prefix;counter.push(k("NextGridObjectID"));
 locator.capture.insert(parent.clone(),None);locator.capture.insert(counter.clone(),None);locator.walk_complete()?;
 let mr=locator.capture.get(&parent).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let cr=locator.capture.get(&counter).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(PatchError::InvalidTarget);}
 let mut records=Vec::new();let mut additions=Vec::new();
 for (i,p) in parts.iter().enumerate(){
  let id=next+i as u32;let state=if p.diagonal{serde_json::json!({"FenceMode":{"Diagonal":true}})}else{Value::Null};
  let v=serde_json::json!({"ID":id,"ItemID":p.item,"X":p.x,"Y":p.y,"Orientation":if p.left{"GridOrientation_Left"}else{"GridOrientation_Down"},"State":state});
  records.push(format!("\"{}\":{}",id,v));additions.push((id.to_string(),v));
 }
 let append=format!("{}{}",if map.is_empty(){""}else{","},records.join(","));
 let mut edits=vec![(mr.end-1..mr.end-1,append),(cr,following.to_string())];edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::new();let mut last=0;for (r,v) in edits{candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&source[last..]);
 if candidate.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
 let target=root.get_mut("World").and_then(|v|v.get_mut("GridCollection")).and_then(|v|v.get_mut("Grids")).and_then(|v|v.get_mut(&d.grid_id)).ok_or(PatchError::MissingTarget)?;
 let objects=target.get_mut("Objects").and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?;
 for (id,v) in additions{objects.insert(id,v);}
 target.as_object_mut().ok_or(PatchError::MissingTarget)?.insert("NextGridObjectID".into(),Value::from(following));
 if serde_json::from_str::<Value>(&candidate).map_err(|_|PatchError::InvalidDocument)?!=root{return Err(PatchError::InvalidDocument);}
 validate_json_without_edit(&candidate)?;
 Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

#[cfg(test)]
mod isolated_fence_tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"Inventory":{"40700246":{"Amount":17,"Marker":"Favorite"}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":8,"Y":4,"Orientation":"GridOrientation_Down","Unknown":1e2}}}}}}}"#;
 fn destination()->PlainGridDestination{PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Test.json".into(),tessellation:2,size:(40,40)}}
 #[test]fn diagonal_fence_uses_exact_noncontiguous_catalog_ids_and_mode(){
  for (nodes,orientation) in [(vec![(20,20),(22,22),(24,24)],"GridOrientation_Down"),(vec![(20,24),(22,22),(24,20)],"GridOrientation_Left")]{
   let edges=nodes.windows(2).map(|p|(p[0],p[1])).collect::<Vec<_>>();
   let draft=preview_isolated_fence(SOURCE,&destination(),40700000,true,&nodes,&edges).unwrap();
   let actual:serde_json::Value=serde_json::from_str(&draft.patched_json).unwrap();
   let old:serde_json::Value=serde_json::from_str(SOURCE).unwrap();
   assert_eq!(actual["Player"],old["Player"]);assert!(draft.patched_json.contains("\"Unknown\":1e2"));
   let grid=&actual["World"]["GridCollection"]["Grids"]["7"];assert_eq!(grid["NextGridObjectID"],5);
   let ext=grid["Objects"].as_object().unwrap().values().find(|v|v["ItemID"]==40700171).unwrap();
   assert_eq!(ext["Orientation"],orientation);assert_eq!(ext["State"]["FenceMode"]["Diagonal"],true);
  }
 }
 #[test]fn fence_writer_compiles_exact_parts_and_preserves_original_state(){
  let nodes=vec![(20,20),(20,22),(20,24)];let edges=fence_topology::cardinal_fence_graph(&nodes,2).unwrap();
  let draft=preview_isolated_fence(SOURCE,&destination(),40700246,false,&nodes,&edges).unwrap();
  let old:serde_json::Value=serde_json::from_str(SOURCE).unwrap();let actual:serde_json::Value=serde_json::from_str(&draft.patched_json).unwrap();
  assert_eq!(old["Player"],actual["Player"]);assert!(draft.patched_json.contains("\"Unknown\":1e2"));assert!(!draft.export_authorized);
  let grid=&actual["World"]["GridCollection"]["Grids"]["7"];assert_eq!(grid["NextGridObjectID"],5);let p=&grid["Objects"]["3"];assert_eq!(p["ItemID"],40700247);assert_eq!(p["Orientation"],"GridOrientation_Left");assert_eq!(p["Y"],22);
  assert!(preview_isolated_fence(&draft.patched_json,&destination(),40700246,false,&nodes,&edges).is_err());
  let far=vec![(60,60),(62,60)];let far_edges=fence_topology::cardinal_fence_graph(&far,2).unwrap();
  assert!(preview_isolated_fence(&draft.patched_json,&destination(),40700246,false,&far,&far_edges).is_ok());
  assert!(preview_isolated_fence(SOURCE,&destination(),40700246,false,&far,&[]).is_err());
 }
}
/// Ordinary, non-variation furniture stock adjustment. The caller must
/// separately establish canonical item identity and default/no-state placement
/// semantics from the game catalog; this intentionally remains a rehearsal.
/// Zero entries are retained, including Marker and any unknown fields.
pub fn preview_default_furniture_stock(
    source:&str,item_id:u64,expected:u32,delta:i8
)->Result<QuantityDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||
       item_id/100_000!=400||!matches!(delta,-1|1)||expected>i32::MAX as u32{
        return Err(PatchError::InvalidTarget);
    }
    let replacement=if delta<0{expected.checked_sub(1)}else{expected.checked_add(1)}
        .filter(|n|*n<=i32::MAX as u32).ok_or(PatchError::InvalidQuantity)?;
    let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:item_id.to_string()})?;
    locator.amount_path=vec![Segment::Index(usize::MAX)];
    let route=vec![k("Player"),k("ListInventories"),k("0")];
    let mut amount=route.clone();amount.extend([k("Inventory"),k(&item_id.to_string()),k("Amount")]);
    locator.capture.insert(route.clone(),None);locator.capture.insert(amount.clone(),None);locator.walk_complete()?;
    let span=|p:&Vec<Segment>|locator.capture.get(p).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget);
    let row:serde_json::Value=serde_json::from_str(&source[span(&route)?]).map_err(|_|PatchError::InvalidDocument)?;
    let obj=row.as_object().ok_or(PatchError::InvalidTarget)?;
    if row.get("ID").and_then(|v|v.as_u64())!=Some(0)||
       row.get("CompatibleItemType").and_then(|v|v.as_str())!=Some("ItemType_Furniture")||
       obj.keys().any(|k|k.starts_with("Compatible")&&!matches!(k.as_str(),"CompatibleItemType"|"CompatibleFurnitureTypes")){
        return Err(PatchError::InvalidTarget);
    }
    let restriction=row.get("CompatibleFurnitureTypes").and_then(|v|v.as_object()).ok_or(PatchError::InvalidTarget)?;
    if restriction.len()!=1{return Err(PatchError::InvalidTarget);}
    let list=restriction.get("List").and_then(|v|v.as_array()).ok_or(PatchError::InvalidTarget)?;
    let mut unique=HashSet::new();
    for token in list{
        let token=token.as_str().ok_or(PatchError::InvalidTarget)?;
        if !matches!(token,"FurnitureItemType_Default"|"FurnitureItemType_GroundAlteration"|"FurnitureItemType_Door"|"FurnitureItemType_Request"|"FurnitureItemType_Blocker"|"FurnitureItemType_Fence"|"FurnitureItemType_AncientMachine"|"FurnitureItemType_SnippetTrap")||!unique.insert(token){return Err(PatchError::InvalidTarget);}
    }
    if !unique.contains("FurnitureItemType_Default"){return Err(PatchError::InvalidTarget);}
    let range=span(&amount)?;
    let original=source[range.clone()].parse::<u32>().map_err(|_|PatchError::NonIntegerTarget)?;
    if original!=expected{return Err(PatchError::AmountMismatch);}
    let mut candidate=String::with_capacity(source.len()+10);
    candidate.push_str(&source[..range.start]);candidate.push_str(&replacement.to_string());candidate.push_str(&source[range.end..]);
    validate_json_without_edit(&candidate)?;
    Ok(QuantityDraft{patched_json:candidate,changed:true,original_amount:u64::from(expected),replacement_amount:u64::from(replacement),untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

/// Check exact full Grid identity before inserting a new object. Unlike the
/// historical selected-object rehearsal, no pre-existing furniture is needed.
pub fn preview_plain_grid_place(
    source:&str,destination:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str,
)->Result<GridCoordinateDraft,PatchError>{
    validate_plain_grid_destination(source,destination,item_id,xy,orientation)?;
    insert_plain_grid_record(source,destination,item_id,xy,orientation)
}
fn validate_plain_grid_destination(source:&str,destination:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str)->Result<(),PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||item_id/100_000!=400||
       !valid_id(&destination.grid_id)||destination.grid_id.starts_with('0')||
       full_grid_scope(&destination.layout_path).is_none()||
       !destination.data_path.starts_with("GridData/")||!destination.data_path.ends_with(".json")||
       destination.data_path.contains("..")||destination.data_path.contains('\\')||
       !matches!(destination.tessellation,1|2)||destination.size.0==0||destination.size.1==0||
       destination.size.0>65536||destination.size.1>65536||
       xy.0<0||xy.1<0||xy.0 as u32>=destination.size.0*destination.tessellation||
       xy.1 as u32>=destination.size.1*destination.tessellation||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){
        return Err(PatchError::InvalidTarget);
    }
    let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
    let grids=collection.get("Grids").and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
    let grid=grids.get(&destination.grid_id).ok_or(PatchError::MissingTarget)?;
    let matches_path=|id:&str,v:&serde_json::Value|full_grid_source_matches(&root,id,v,&destination.layout_path,&destination.data_path);
    if !matches_path(&destination.grid_id,grid)||grids.iter().filter(|(id,v)|matches_path(id,v)).count()!=1||
       grid.get("ID").and_then(|v|v.as_u64())!=destination.grid_id.parse::<u64>().ok()||
       grid.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(destination.tessellation))||
       collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|g|g.contains_key(&destination.grid_id))){
        return Err(PatchError::AmbiguousTarget);
    }
    Ok(())
}

/// Insert an ordinary leaf into an existing owned support Grid. The caller
/// has resolved its exact parent chain and verified the original support
/// footprint. Unlike terrain grids, multiple supports may share a data path.
fn validate_support_grid_destination(source:&str,d:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str)->Result<(),PatchError>{
 validate_local_grid_destination(source,d,item_id,xy,orientation,"GridData/Furniture/")
}
fn validate_local_grid_destination(source:&str,d:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str,prefix:&str)->Result<(),PatchError>{
 if item_id/100_000!=400||!valid_id(&d.grid_id)||d.grid_id.starts_with('0')||
    !d.data_path.starts_with(prefix)||!d.data_path.ends_with(".json")||d.data_path.contains("..")||d.data_path.contains('\\')||
    !matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>256||d.size.1>256||
    xy.0<0||xy.1<0||xy.0 as u32>=d.size.0*d.tessellation||xy.1 as u32>=d.size.1*d.tessellation||
    !OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(PatchError::InvalidTarget);}
 let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let g=c.get("Grids").and_then(|v|v.get(&d.grid_id)).ok_or(PatchError::MissingTarget)?;
 if g.get("ID").and_then(|v|v.as_u64())!=d.grid_id.parse::<u64>().ok()||
    g.get("GridDataPath").and_then(|v|v.as_str())!=Some(d.data_path.as_str())||
    g.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(d.tessellation))||
    c.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|v|v.contains_key(&d.grid_id))){return Err(PatchError::AmbiguousTarget);}
 let objects=g.get("Objects").and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
 if objects.values().any(|v|v.get("X").and_then(|v|v.as_i64())==Some(i64::from(xy.0))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(xy.1))){return Err(PatchError::AmbiguousTarget);}
 Ok(())
}
pub fn preview_support_grid_stock_place(source:&str,d:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str,expected_stock:u32)->Result<GridCoordinateDraft,PatchError>{
 validate_support_grid_destination(source,d,item_id,xy,orientation)?;
 let amount=preview_default_furniture_stock(source,item_id,expected_stock,-1)?;
 insert_plain_grid_record(&amount.patched_json,d,item_id,xy,orientation)
}
/// Exact room ownership and source raster are resolved by the codec first.
pub fn preview_indoor_grid_stock_place(source:&str,d:&PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&str,expected_stock:u32)->Result<GridCoordinateDraft,PatchError>{
 validate_local_grid_destination(source,d,item_id,xy,orientation,"GridData/Rooms/")?;
 let amount=preview_default_furniture_stock(source,item_id,expected_stock,-1)?;
 insert_plain_grid_record(&amount.patched_json,d,item_id,xy,orientation)
}
/// Move one ordinary outdoor furniture record to a codec-resolved owned room floor.
pub fn preview_outdoor_to_indoor_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id==d.grid_id||!d.data_path.starts_with("GridData/Rooms/Room"){return Err(PatchError::InvalidTarget);}
 validate_local_grid_destination(source,d,target.item_id,xy,orientation,"GridData/Rooms/")?;
 let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grids=c.get("Grids").and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
 let g=grids.get(&target.grid_id).ok_or(PatchError::MissingTarget)?;
 let layout=g.get("GridDefaultLayoutPath").and_then(|v|v.as_str()).ok_or(PatchError::InvalidTarget)?;
 let data=g.get("GridDataPath").and_then(|v|v.as_str()).ok_or(PatchError::InvalidTarget)?;
 if !full_grid_scope(layout).is_some_and(|scope|outdoor_world_path(scope,data))||
    g.get("ID").and_then(|v|v.as_u64())!=target.grid_id.parse::<u64>().ok()||
    grids.values().filter(|v|v.get("GridDefaultLayoutPath").and_then(|v|v.as_str())==Some(layout)&&v.get("GridDataPath").and_then(|v|v.as_str())==Some(data)).count()!=1{
     return Err(PatchError::InvalidTarget);
 }
 let removed=preview_plain_grid_structure(source,target,expected,PlainGridStructureAction::Remove)?;
 insert_plain_grid_record(&removed.patched_json,d,target.item_id,xy,orientation)
}
/// The codec resolves exact room ownership and source pose before either transfer.
pub fn preview_indoor_to_outdoor_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id==d.grid_id||!full_grid_scope(&d.layout_path).is_some_and(|scope|outdoor_world_path(scope,&d.data_path)){return Err(PatchError::InvalidTarget);}
 let removed=preview_plain_grid_structure(source,target,expected,PlainGridStructureAction::Remove)?;
 preview_plain_grid_place(&removed.patched_json,d,target.item_id,xy,orientation)
}
pub fn preview_indoor_to_indoor_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id==d.grid_id||!d.data_path.starts_with("GridData/Rooms/Room"){return Err(PatchError::InvalidTarget);}
 validate_local_grid_destination(source,d,target.item_id,xy,orientation,"GridData/Rooms/")?;
 let removed=preview_plain_grid_structure(source,target,expected,PlainGridStructureAction::Remove)?;
 insert_plain_grid_record(&removed.patched_json,d,target.item_id,xy,orientation)
}
/// Relocate an existing support parent between two exact owned room floors.
/// The codec checks exclusive subtree ownership and external references.
/// Keep the original lexical State and all descendants; no stock change.
pub fn preview_indoor_support_parent_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 support_room_transfer(source,target,expected,d,xy,orientation,true,true)
}
pub fn preview_outdoor_to_indoor_support_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 support_room_transfer(source,target,expected,d,xy,orientation,false,true)
}
pub fn preview_indoor_to_outdoor_support_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 support_room_transfer(source,target,expected,d,xy,orientation,true,false)
}
fn support_room_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,from_room:bool,to_room:bool)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id==d.grid_id||target.kind!=GridObjectKind::Full||target.item_id/100_000!=400{return Err(PatchError::InvalidTarget);}
 if to_room{
  if !d.data_path.starts_with("GridData/Rooms/Room"){return Err(PatchError::InvalidTarget);}
  validate_local_grid_destination(source,d,target.item_id,xy,orientation,"GridData/Rooms/")?;
 }else{
  if !full_grid_scope(&d.layout_path).is_some_and(|scope|outdoor_world_path(scope,&d.data_path)){return Err(PatchError::InvalidTarget);}
  validate_plain_grid_destination(source,d,target.item_id,xy,orientation)?;
 }
 let root:serde_json::Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let grids=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.as_object()).ok_or(PatchError::MissingTarget)?;
 let from=grids.get(&target.grid_id).ok_or(PatchError::MissingTarget)?;
 let data=from.get("GridDataPath").and_then(|v|v.as_str()).ok_or(PatchError::InvalidTarget)?;
 if from.get("ID").and_then(|v|v.as_u64())!=target.grid_id.parse::<u64>().ok()||from.get("TessellationFactor").map_or(Some(1),|v|v.as_u64())!=Some(u64::from(d.tessellation)){return Err(PatchError::InvalidTarget);}
 if from_room{
  if !data.starts_with("GridData/Rooms/Room")||!data.ends_with(".json")||data.contains(".."){return Err(PatchError::InvalidTarget);}
 }else{
  let layout=from.get("GridDefaultLayoutPath").and_then(|v|v.as_str()).ok_or(PatchError::InvalidTarget)?;
  if !full_grid_scope(layout).is_some_and(|scope|outdoor_world_path(scope,data))||grids.values().filter(|g|g.get("GridDefaultLayoutPath").and_then(|v|v.as_str())==Some(layout)&&g.get("GridDataPath").and_then(|v|v.as_str())==Some(data)).count()!=1{return Err(PatchError::InvalidTarget);}
 }
 if !to_room&&grids.get(&d.grid_id).and_then(|g|g.get("Objects")).and_then(|v|v.as_object()).is_none_or(|m|m.values().any(|v|v.get("ItemID").and_then(|v|v.as_u64()).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(|v|v.as_i64())==Some(i64::from(xy.0))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(xy.1)))){return Err(PatchError::AmbiguousTarget);}
 let mut locator=JsonLocator::grid_axis(source,target,"X")?;locator.signed_path=None;locator.item_path=None;
 let path=vec![k("World"),k("GridCollection"),k("Grids"),k(&target.grid_id),k("Objects"),k(&target.object_id),k("State")];
 locator.capture.insert(path.clone(),None);locator.walk_complete()?;
 let range=locator.capture.get(&path).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let removed=preview_grid_structure(source,target,expected,PlainGridStructureAction::Remove,true)?;
 insert_grid_record(&removed.patched_json,d,target.item_id,xy,orientation,Some(&source[range]))
}
/// Atomic relocation of a plain leaf between two separately resolved owned support grids.
/// Grid-local identities are allocated from the destination counter; stock is untouched.
pub fn preview_support_grid_transfer(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id==d.grid_id{return Err(PatchError::InvalidTarget);}
 validate_support_grid_destination(source,d,target.item_id,xy,orientation)?;
 let removed=preview_plain_grid_structure(source,target,expected,PlainGridStructureAction::Remove)?;
 insert_plain_grid_record(&removed.patched_json,d,target.item_id,xy,orientation)
}

/// One atomic stock+placement candidate. Never create an absent stock entry:
/// its native UseIsNewMarker policy and canonical variation must be proven
/// first. An existing zero entry can receive picked-up furniture safely at
/// the lexical level. All unrelated bytes are preserved.
pub enum FurnitureStockAction<'a>{
    Place{destination:&'a PlainGridDestination,item_id:u64,xy:(i32,i32),orientation:&'a str},
    Pickup{target:&'a GridCoordinateTarget,expected:(i32,i32)},
    Duplicate{target:&'a GridCoordinateTarget,expected:(i32,i32),xy:(i32,i32)},
}
pub fn preview_furniture_stock_transaction(source:&str,expected_stock:u32,action:FurnitureStockAction<'_>)->Result<GridCoordinateDraft,PatchError>{
    let (item,delta)=match &action{
        FurnitureStockAction::Place{item_id,..}=>(*item_id,-1),
        FurnitureStockAction::Pickup{target,..}=>(target.item_id,1),
        FurnitureStockAction::Duplicate{target,..}=>(target.item_id,-1),
    };
    // Check the stock against the original before staging either change.
    let amount=preview_default_furniture_stock(source,item,expected_stock,delta)?;
    let draft=match action{
        FurnitureStockAction::Place{destination,item_id,xy,orientation}=>preview_plain_grid_place(&amount.patched_json,destination,item_id,xy,orientation)?,
        FurnitureStockAction::Pickup{target,expected}=>preview_plain_grid_structure(&amount.patched_json,target,expected,PlainGridStructureAction::Remove)?,
        FurnitureStockAction::Duplicate{target,expected,xy}=>preview_plain_grid_structure(&amount.patched_json,target,expected,PlainGridStructureAction::Duplicate{x:xy.0,y:xy.1})?,
    };
    Ok(draft)
}

/// Bounded native room finish contract inherited from Switch 1.25 runtime
/// acceptance (Flooring and All Walls). Current-build acceptance and the
/// item definition witness are caller responsibilities, not implied here.
#[derive(Clone,Copy)]
pub struct RoomFinishTarget{pub house_index:usize,pub house_item_id:u32,pub floor_index:usize,pub room_slot:u8}
#[derive(Clone,Copy)]
pub enum RoomFinishAction{Flooring{expected:u32},Wallpaper{wall:Option<u8>,expected:[Option<u32>;4]}}
fn room_value<'a>(root:&'a serde_json::Value,target:RoomFinishTarget)->Option<&'a serde_json::Value>{
 let h=root.get("World")?.get("PlayerHouses")?.get(target.house_index)?;
 if h.get("HouseItemID")?.as_u64()!=Some(u64::from(target.house_item_id)){return None;}
 h.get("Floors")?.get(target.floor_index)?.get("Rooms")?.get(target.room_slot.to_string().as_str())
}
fn room_path(t:RoomFinishTarget)->Vec<Segment>{
 vec![k("World"),k("PlayerHouses"),Segment::Index(t.house_index),k("Floors"),Segment::Index(t.floor_index),k("Rooms"),k(&t.room_slot.to_string())]
}
fn room_lexical_map_edit(source:&str,parent:Vec<Segment>,key:&str,replacement:Option<u32>)->Result<String,PatchError>{
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 let mut member=parent.clone();member.push(k(key));locator.capture.insert(parent.clone(),None);locator.capture.insert(member.clone(),None);locator.walk_complete()?;
 let map_range=locator.capture.get(&parent).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let old:serde_json::Map<String,serde_json::Value>=serde_json::from_str(&source[map_range.clone()]).map_err(|_|PatchError::InvalidDocument)?;
 let found=locator.capture.get(&member).and_then(|v|v.clone());
 let (range,value)=if let Some(n)=replacement{
  if let Some(r)=found{(r,n.to_string())}
  else{if old.contains_key(key){return Err(PatchError::AmbiguousTarget);}
   let member=format!("{}\"{}\":{}",if old.is_empty(){""}else{","},key,n);
   (map_range.end-1..map_range.end-1,member)}
 }else{
  if found.is_none(){return Err(PatchError::MissingTarget);}
  locator.capture.clear();locator.pos=map_range.start;locator.expect(b'{')?;let mut comma=None;
  let removed=loop{
   locator.space();let start=locator.pos;let current=locator.string()?;locator.expect(b':')?;
   let mut p=parent.clone();p.push(k(&current));locator.value(&mut p)?;let end=locator.pos;locator.space();
   if current==key{break if locator.bytes.get(locator.pos)==Some(&b','){start..locator.pos+1}else if let Some(c)=comma{c..end}else{start..end};}
   if locator.bytes.get(locator.pos)!=Some(&b','){return Err(PatchError::MissingTarget);}
   comma=Some(locator.pos);locator.pos+=1;
  };
  (removed,String::new())
 };
 let mut result=String::with_capacity(source.len()+value.len());result.push_str(&source[..range.start]);result.push_str(&value);result.push_str(&source[range.end..]);
 if result.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
 validate_json_without_edit(&result)?;Ok(result)
}
/// Applies only the exact existing room scalar or wallpaper entries and
/// obsolete offsets. Owned trimming items are never consumed. All unknown
/// state remains byte-exact; independent semantic verification is included.
pub fn preview_room_finish(source:&str,target:RoomFinishTarget,item:u32,action:RoomFinishAction)->Result<GridCoordinateDraft,PatchError>{
 use serde_json::Value;
 if target.house_index>=128||target.floor_index>=128||target.room_slot>3||target.house_item_id==0||source.is_empty()||source.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidTarget);}
 let subtype=if matches!(action,RoomFinishAction::Flooring{..}){1601}else{1600};
 if item/100000!=subtype{return Err(PatchError::InvalidTarget);}
 validate_json_without_edit(source)?;
 let mut expected_root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 // Resolve the unique compatible ownership route, not merely inventory 4.
 let inventory=expected_root.get("Player").and_then(|p|p.get("ListInventories")).and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let mut routes=inventory.iter().filter(|(_,v)|v.get("CompatibleItemType").and_then(Value::as_str)==Some("ItemType_Trimming"));
 let (route_key,route)=routes.next().ok_or(PatchError::MissingTarget)?;
 if routes.next().is_some()||route.get("ID").and_then(Value::as_u64).is_none_or(|id|id.to_string()!=*route_key)||
    route.as_object().is_none_or(|o|o.keys().any(|k|k.starts_with("Compatible")&&k!="CompatibleItemType"))||
    route.get("Inventory").and_then(|v|v.get(item.to_string().as_str())).and_then(|v|v.get("Amount")).and_then(Value::as_u64).is_none_or(|a|a==0||a>i32::MAX as u64){
  return Err(PatchError::InvalidTarget);
 }
 let room=room_value(&expected_root,target).ok_or(PatchError::MissingTarget)?;
 let walls=room.get("WallGridIDs").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let floor=room.get("FloorGridID").and_then(Value::as_u64).filter(|n|*n<=u32::MAX as u64).ok_or(PatchError::InvalidTarget)?;
 let mut ids=HashSet::from([floor]);if walls.len()!=4{return Err(PatchError::InvalidTarget);}
 for pos in 0..4{
  let n=walls.get(&pos.to_string()).and_then(Value::as_u64).filter(|n|*n<=u32::MAX as u64).ok_or(PatchError::InvalidTarget)?;
  if !ids.insert(n){return Err(PatchError::AmbiguousTarget);}
 }
 let base=room_path(target);let mut candidate=source.to_owned();
 let pointer=format!("/World/PlayerHouses/{}/Floors/{}/Rooms/{}",target.house_index,target.floor_index,target.room_slot);
 match action{
  RoomFinishAction::Flooring{expected}=>{
   if room.get("Flooring").and_then(Value::as_u64)!=Some(u64::from(expected))||expected==item{return Err(PatchError::ItemMismatch);}
   candidate=room_lexical_map_edit(&candidate,base,"Flooring",Some(item))?;
   *expected_root.pointer_mut(&(pointer+"/Flooring")).ok_or(PatchError::MissingTarget)?=Value::from(item);
  }
  RoomFinishAction::Wallpaper{wall,expected}=>{
   if wall.is_some_and(|w|w>3){return Err(PatchError::InvalidTarget);}
   let papers=room.get("Wallpapers").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
   let offsets=room.get("WallpaperOffsetById").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
   if papers.keys().any(|k|!matches!(k.as_str(),"0"|"1"|"2"|"3"))||offsets.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|id|id.to_string()!=*k)||v.as_f64().is_none_or(|n|!n.is_finite())){return Err(PatchError::InvalidTarget);}
   let mut next=expected;let mut displaced=HashSet::new();let mut changes=Vec::new();
   for pos in 0..4{
    let key=pos.to_string();let actual=match papers.get(&key){Some(v)=>Some(v.as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n<=i32::MAX as u32).ok_or(PatchError::InvalidTarget)?),None=>None};
    if actual!=expected[pos]{return Err(PatchError::ItemMismatch);}
    if wall.is_none_or(|w|usize::from(w)==pos)&&actual!=Some(item){next[pos]=Some(item);displaced.insert(actual.unwrap_or(0));changes.push(pos);}
   }
   if changes.is_empty(){return Err(PatchError::InvalidTarget);}
   let mut stale:Vec<u32>=displaced.into_iter().filter(|id|!next.contains(&Some(*id))&&offsets.contains_key(&id.to_string())).collect();stale.sort_unstable();
   let mut p=base.clone();p.push(k("Wallpapers"));let mut o=base;o.push(k("WallpaperOffsetById"));
   for pos in changes{
    let key=pos.to_string();candidate=room_lexical_map_edit(&candidate,p.clone(),&key,Some(item))?;
    expected_root.pointer_mut(&(pointer.clone()+"/Wallpapers")).and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?.insert(key,Value::from(item));
   }
   for old in stale{
    let key=old.to_string();candidate=room_lexical_map_edit(&candidate,o.clone(),&key,None)?;
    expected_root.pointer_mut(&(pointer.clone()+"/WallpaperOffsetById")).and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?.remove(&key);
   }
  }
 }
 let actual:Value=serde_json::from_str(&candidate).map_err(|_|PatchError::InvalidDocument)?;
 if actual!=expected_root||room_value(&actual,target).is_none(){return Err(PatchError::InvalidDocument);}
 Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}
#[cfg(test)]
mod room_finish_tests{
 use super::*;
 const SOURCE:&str=r#"{"Player":{"ListInventories":{"4":{"ID":4,"CompatibleItemType":"ItemType_Trimming","Inventory":{"160000003":{"Amount":1},"160100005":{"Amount":1}}}}},"World":{"PlayerHouses":[{"HouseItemID":120000001,"Floors":[{"Rooms":{"0":{"FloorGridID":10,"WallGridIDs":{"0":11,"1":12,"2":13,"3":14},"Flooring":160100004,"Wallpapers":{"0":160000001,"1":160000001,"2":160000002,"3":160000003},"WallpaperOffsetById":{"160000001":1e-1,"160000002":0.5,"160000003":0.25,"160000009":1e2},"Ceiling":160200001,"Unknown":1e2}}}]}]}}"#;
 const TARGET:RoomFinishTarget=RoomFinishTarget{house_index:0,house_item_id:120000001,floor_index:0,room_slot:0};
 const EXPECTED:[Option<u32>;4]=[Some(160000001),Some(160000001),Some(160000002),Some(160000003)];
 #[test]fn floor_exact_and_ownership_unchanged(){
  let d=preview_room_finish(SOURCE,TARGET,160100005,RoomFinishAction::Flooring{expected:160100004}).unwrap();
  assert_eq!(d.patched_json,SOURCE.replace("\"Flooring\":160100004","\"Flooring\":160100005"));assert!(!d.export_authorized);
  assert!(preview_room_finish(SOURCE,TARGET,160100005,RoomFinishAction::Flooring{expected:0}).is_err());
 }
 #[test]fn wallpaper_offsets_only_removed_after_last_wall(){
  let d=preview_room_finish(SOURCE,TARGET,160000003,RoomFinishAction::Wallpaper{wall:Some(0),expected:EXPECTED}).unwrap();
  assert!(d.patched_json.contains("\"160000001\":1e-1"));
  let d=preview_room_finish(SOURCE,TARGET,160000003,RoomFinishAction::Wallpaper{wall:None,expected:EXPECTED}).unwrap();
  let j:serde_json::Value=serde_json::from_str(&d.patched_json).unwrap();let room=room_value(&j,TARGET).unwrap();
  assert_eq!(room["Wallpapers"],serde_json::json!({"0":160000003,"1":160000003,"2":160000003,"3":160000003}));
  assert_eq!(room["WallpaperOffsetById"],serde_json::json!({"160000003":0.25,"160000009":100.0}));
  assert!(d.patched_json.contains("\"160000009\":1e2"));assert!(d.patched_json.contains("\"Unknown\":1e2"));
  assert!(preview_room_finish(SOURCE,TARGET,160000004,RoomFinishAction::Wallpaper{wall:None,expected:EXPECTED}).is_err());
 }
}

/// One optimistic-concurrency checked change to an existing GridObject.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct GridCoordinateEdit {
    pub target:GridCoordinateTarget,
    pub expected:(i32,i32),
    pub replacement:(i32,i32),
}

/// All-or-nothing edit of 1..=16 *different* saved GridObjects.
/// Every object's ItemID and original X/Y must still match. The edit is
/// applied only to existing numeric coordinate tokens, preserving every
/// unknown field, other object and original JSON lexical byte. This makes
/// no game placement/collision or full World identity claim.
pub fn preview_existing_grid_coordinate_batch(
    source:&str,edits:&[GridCoordinateEdit]
)->Result<GridCoordinateDraft,PatchError>{
    if edits.is_empty()||edits.len()>16||
       source.is_empty()||source.len()>MAX_PROFILE_BYTES{
        return Err(PatchError::InvalidTarget);
    }
    let mut seen=HashSet::new();
    for edit in edits {
        if edit.expected==edit.replacement||
           !seen.insert((edit.target.kind,
             edit.target.grid_id.as_str(),edit.target.object_id.as_str())){
            return Err(PatchError::AmbiguousTarget);
        }
    }
    // Complete the optimistic checks against the *immutable original*
    // before constructing a candidate. Any one failed edit denies all.
    for edit in edits {
        let check=preview_existing_grid_coordinates(
            source,edit.target.clone(),edit.expected,edit.replacement
        )?;
        if !check.changed||!check.untouched_bytes_preserved{
            return Err(PatchError::AmbiguousTarget);
        }
    }
    let mut candidate=source.to_owned();
    for edit in edits {
        let step=preview_existing_grid_coordinates(
            &candidate,edit.target.clone(),edit.expected,edit.replacement
        )?;
        candidate=step.patched_json;
    }
    Ok(GridCoordinateDraft{
        patched_json:candidate,changed:true,
        untouched_bytes_preserved:true,
        writer_authorized:false,export_authorized:false
    })
}

/// One ordered, optimistic-concurrency checked edit to an existing slot.
/// This intentionally does NOT impose normal gameplay inventory quantity caps.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuantityEdit {
    pub target: QuantityTarget,
    pub expected: u64,
    pub replacement: u64,
}

/// Experimental in-memory multi-edit draft, never production Writer authority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuantityBatchDraft {
    pub patched_json: String,
    pub changed_count: usize,
    pub untouched_bytes_preserved: bool,
    pub writer_authorized: bool,
    pub export_authorized: bool,
}

/// Atomically apply 1..=16 *distinct* existing Inventory/Chest Amount edits.
///
/// Every proposed edit must match the original Amount and item identity.
/// On any invalid/stale/missing/duplicate entry this function returns Err
/// and NEVER exposes a partially patched candidate. Unrelated lexical JSON,
/// unknown fields and original ordering are preserved byte-for-byte.
pub fn preview_existing_quantity_batch(
    source: &str,
    edits: &[QuantityEdit],
) -> Result<QuantityBatchDraft, PatchError> {
    if edits.is_empty() || edits.len() > 16 {
        return Err(PatchError::InvalidTarget);
    }
    if source.is_empty() || source.len() > MAX_PROFILE_BYTES {
        return Err(PatchError::InvalidDocument);
    }
    let mut targets: Vec<&QuantityTarget> = Vec::with_capacity(edits.len());
    for edit in edits {
        if targets.contains(&&edit.target) {
            return Err(PatchError::AmbiguousTarget);
        }
        targets.push(&edit.target);
    }
    let mut current = source.to_owned();
    let mut changed_count = 0;
    for edit in edits {
        let step = preview_existing_quantity(
            &current, edit.target.clone(), edit.expected, edit.replacement
        )?;
        if step.changed { changed_count += 1; }
        current = step.patched_json;
    }
    Ok(QuantityBatchDraft {
        patched_json: current, changed_count,
        untouched_bytes_preserved: true, writer_authorized: false,
        export_authorized: false,
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
    fn single_owned_decoration_can_be_raised_above_game_quantity_limits() {
        // Synthetic representation of an already-owned unique decoration.
        // Game's normal one-only ownership rule must NOT cap save-editor Amount.
        let raw = r#"{"GameInfo":{"Version":643},"Player":{
          "ListInventories":{"101":{"Inventory":{"550":{
            "Amount":1,"CollectionOnly":true,"Source":"exclusive-decor","CustomFlag":false
          }}}},"ContainerInventories":{"202":{"Inventory":[
            {"ItemID":0,"Amount":0},{"ItemID":440,"Amount":1,"Exclusive":true}
          ]}}
        },"World":{},"FutureUnknown":{"Meta":2.50}}"#;
        for amount in [2, 99, 250, 1000, 31968, u32::MAX as u64] {
            let inventory = preview_existing_quantity(raw, inventory(), 1, amount).unwrap();
            assert!(inventory.changed && inventory.untouched_bytes_preserved);
            assert_eq!(inventory.patched_json, raw.replacen(
                r#""Amount":1"#, &format!(r#""Amount":{}"#, amount), 1));
            assert!(inventory.patched_json.contains(r#""CollectionOnly":true"#));
            assert!(inventory.patched_json.contains(r#""Meta":2.50"#));
            let chest_edit = preview_existing_quantity(raw, chest(), 1, amount).unwrap();
            assert!(chest_edit.changed);
            assert_eq!(chest_edit.patched_json, raw.replacen(
                r#""ItemID":440,"Amount":1"#,
                &format!(r#""ItemID":440,"Amount":{}"#, amount), 1));
            assert!(chest_edit.patched_json.contains(r#""Exclusive":true"#));
        }
        // This draft edits existing rows; it does not invent missing entries
        // for one-of-a-kind items represented only in ownership/quest flags.
        assert_eq!(preview_existing_quantity(raw, QuantityTarget::Inventory{
            inventory_id:"101".into(),item_id:"9999".into()
        },1,250).unwrap_err(),PatchError::MissingTarget);
    }

    #[test]
    fn atomic_multi_edit_inventory_and_chest_preserves_unknown_bytes() {
        let original = r#"{"GameInfo":{"Version":643},"Player":{
          "ListInventories":{"101":{"Inventory":{
            "550":{"Amount":1,"Unknown":1.00e+2},
            "777":{"Amount":7,"Cosmetic":"\u3053\u3093\u306b\u3061\u306f"}
          }}},
          "ContainerInventories":{"202":{"Inventory":[
            {"ItemID":0,"Amount":0},{"ItemID":440,"Amount":2,"Exclusive":true}
          ]}}
        },"World":{},"Unrelated":{"Value":2.50}}"#;
        let edits=vec![
            QuantityEdit {target:inventory(),expected:1,replacement:250},
            QuantityEdit {target:QuantityTarget::Inventory{
                inventory_id:"101".into(),item_id:"777".into()
            },expected:7,replacement:32_000},
            QuantityEdit {target:chest(),expected:2,replacement:999},
        ];
        let preview=preview_existing_quantity_batch(original,&edits).unwrap();
        assert_eq!(preview.changed_count,3);
        assert!(!preview.writer_authorized && !preview.export_authorized);
        assert!(preview.untouched_bytes_preserved);
        assert_eq!(preview.patched_json,original
            .replacen(r#""550":{"Amount":1"#,r#""550":{"Amount":250"#,1)
            .replacen(r#""777":{"Amount":7"#,r#""777":{"Amount":32000"#,1)
            .replacen(r#""ItemID":440,"Amount":2"#,
                r#""ItemID":440,"Amount":999"#,1));
        assert!(preview.patched_json.contains(r#""Value":2.50"#));
        assert!(preview.patched_json.contains(r#""Unknown":1.00e+2"#));
        // Stale second edit must reject the entire batch (no partial output).
        let mut stale=edits.clone();
        stale[1].expected=42;
        assert_eq!(preview_existing_quantity_batch(original,&stale).unwrap_err(),
            PatchError::AmountMismatch);
        let mut duplicated=edits.clone();
        duplicated.push(edits[0].clone());
        assert_eq!(preview_existing_quantity_batch(original,&duplicated).unwrap_err(),
            PatchError::AmbiguousTarget);
        let mut wrong_chest=edits.clone();
        wrong_chest[2].target=QuantityTarget::ChestSlot{
            container_id:"202".into(),slot_index:1,item_id:441
        };
        assert_eq!(preview_existing_quantity_batch(original,&wrong_chest).unwrap_err(),
            PatchError::ItemMismatch);
        assert_eq!(preview_existing_quantity_batch(original,&[]).unwrap_err(),
            PatchError::InvalidTarget);
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
    #[test]
    fn grid_coordinate_patch_changes_exact_two_tokens_only(){
        let original=r#" {"GameInfo":{"Version":643},"Player":{},"World":{
          "GridCollection":{"Grids":{"101":{"ID":101,"Objects":{
            "5":{"ID":5,"ItemID":40000001,"X":-12,"Y":45,
              "Orientation":"West","PrivateUnknown":1.00e+2},
            "6":{"ID":6,"ItemID":40000001,"X":-12,"Y":45}
          }}}}},"Other":{"X":7,"Y":9,"Extra":"\u3053"}} "#;
        let target=GridCoordinateTarget{
            kind:GridObjectKind::Full,grid_id:"101".into(),
            object_id:"5".into(),item_id:40000001
        };
        let patched=preview_existing_grid_coordinates(
            original,target.clone(),(-12,45),(99,-23)
        ).unwrap();
        let expected=original.replacen(r#""X":-12,"Y":45"#,
            r#""X":99,"Y":-23"#,1);
        assert_eq!(patched.patched_json,expected);
        assert!(patched.changed&&patched.untouched_bytes_preserved);
        assert!(!patched.writer_authorized&&!patched.export_authorized);
        assert!(patched.patched_json.contains(r#""PrivateUnknown":1.00e+2"#));
        assert!(patched.patched_json.contains(r#""Extra":"\u3053""#));
        assert!(patched.patched_json.contains(r#""6":{"ID":6,"ItemID":40000001,"X":-12"#));
        assert_eq!(preview_existing_grid_coordinates(original,target.clone(),
            (0,45),(99,-23)).err(),Some(PatchError::CoordinateMismatch));
        let wrong=GridCoordinateTarget{item_id:40000002,..target.clone()};
        assert_eq!(preview_existing_grid_coordinates(original,wrong,
            (-12,45),(99,-23)).err(),Some(PatchError::ItemMismatch));
        let no_op=preview_existing_grid_coordinates(
            original,target,(-12,45),(-12,45)).unwrap();
        assert!(!no_op.changed);
        assert_eq!(no_op.patched_json,original);
    }
    #[test]
    fn mixed_grid_batch_supports_coordinate_rotation_and_combined_actions(){
        let original=r#"{"World":{"GridCollection":{
          "Grids":{"101":{"Objects":{
            "1":{"ItemID":77,"X":-5,"Y":6,"Orientation":"GridOrientation_Up",
              "Private":{"X":5,"Y":6},"Opaque":2.00e+1},
            "2":{"ItemID":77,"X":11,"Y":12,"Orientation":"GridOrientation_Right"}
          }}},
          "DiffGrids":{"102":{"ModifiedObjects":{
            "6":{"ItemID":88,"X":0,"Y":-9,"Orientation":"GridOrientation_Left",
                 "State":{"Rotation":"original"}}
          },"RemovedObjects":[5]}}
        }},"Future":"\u3053"}"#;
        let full=|id:&str|GridCoordinateTarget{kind:GridObjectKind::Full,
            grid_id:"101".into(),object_id:id.into(),item_id:77};
        let diff=GridCoordinateTarget{kind:GridObjectKind::DiffModified,
            grid_id:"102".into(),object_id:"6".into(),item_id:88};
        let edits=vec![
            GridMixedEdit{target:full("1"),expected:(-5,6),
                position:Some((20,-30)),orientation:None},
            GridMixedEdit{target:full("2"),expected:(11,12),
                position:None,
                orientation:Some(("GridOrientation_Right".into(),
                    "GridOrientation_Down".into()))},
            GridMixedEdit{target:diff,expected:(0,-9),
                position:Some((-80,3)),
                orientation:Some(("GridOrientation_Left".into(),
                    "GridOrientation_Up".into()))}
        ];
        let result=preview_existing_grid_mixed_batch(original,&edits).unwrap();
        let expected=original
            .replacen(r#""X":-5,"Y":6"#,r#""X":20,"Y":-30"#,1)
            .replacen(r#""Orientation":"GridOrientation_Right""#,
                     r#""Orientation":"GridOrientation_Down""#,1)
            .replacen(r#""X":0,"Y":-9"#,r#""X":-80,"Y":3"#,1)
            .replacen(r#""Orientation":"GridOrientation_Left""#,
                     r#""Orientation":"GridOrientation_Up""#,1);
        assert_eq!(result.patched_json,expected);
        assert!(!result.writer_authorized&&!result.export_authorized);
        assert!(result.untouched_bytes_preserved);
        assert!(result.patched_json.contains(r#""Opaque":2.00e+1"#));
        assert!(result.patched_json.contains(r#""Future":"\u3053""#));
        let mut stale=edits.clone();
        stale[2].orientation=Some((
            "GridOrientation_Down".into(),"GridOrientation_Up".into()));
        assert_eq!(preview_existing_grid_mixed_batch(original,&stale).err(),
            Some(PatchError::OrientationMismatch));
        let mut stale_coord=edits.clone();stale_coord[1].expected.1=99;
        assert_eq!(preview_existing_grid_mixed_batch(original,&stale_coord).err(),
            Some(PatchError::CoordinateMismatch));
        let mut stale_item=edits.clone();stale_item[0].target.item_id=123;
        assert_eq!(preview_existing_grid_mixed_batch(original,&stale_item).err(),
            Some(PatchError::ItemMismatch));
        let mut repeated=edits.clone();repeated.push(edits[0].clone());
        assert_eq!(preview_existing_grid_mixed_batch(original,&repeated).err(),
            Some(PatchError::AmbiguousTarget));
        let mut no_change=edits.clone();no_change[1].orientation=None;
        assert_eq!(preview_existing_grid_mixed_batch(original,&no_change).err(),
            Some(PatchError::AmbiguousTarget));
        let mut no_movement=edits.clone();no_movement[0].position=Some((-5,6));
        assert_eq!(preview_existing_grid_mixed_batch(original,&no_movement).err(),
            Some(PatchError::InvalidTarget));
        let mut bad_orientation=edits.clone();
        bad_orientation[2].orientation=Some((
            "GridOrientation_Left".into(),"GridOrientation_Unknown".into()));
        assert_eq!(preview_existing_grid_mixed_batch(original,&bad_orientation).err(),
            Some(PatchError::InvalidTarget));
        let duplicate=original.replacen(r#""X":-5"#,r#""X":-5,"\u0058":-5"#,1);
        assert_eq!(preview_existing_grid_mixed_batch(&duplicate,&edits).err(),
            Some(PatchError::DuplicateKey));
        assert_eq!(preview_existing_grid_mixed_batch(original,&[]).err(),
            Some(PatchError::InvalidTarget));
    }

    #[test]
    fn mixed_batch_scales_to_512_preserving_unselected_and_unchanged_tokens(){
        let mut source=String::from(r#"{"World":{"GridCollection":{"Grids":{"101":{"Objects":{"#);
        let mut edits=Vec::new();
        for i in 1..=512{
            if i>1{source.push(',');}
            source.push_str(&format!(r#""{i}":{{"ItemID":77,"X":-0,"Y":{i},"Orientation":"GridOrientation_Up","Opaque":2.00e+1}}"#));
            edits.push(GridMixedEdit{target:GridCoordinateTarget{kind:GridObjectKind::Full,
                grid_id:"101".into(),object_id:i.to_string(),item_id:77},
                expected:(0,i),position:Some((0,i+1000)),
                orientation:Some(("GridOrientation_Up".into(),"GridOrientation_Left".into()))});
        }
        source.push_str(r#","999":{"ItemID":77,"X":0,"Y":1,"Future":"\u3053"}}}}}}}"#);
        let result=preview_existing_grid_mixed_batch(&source,&edits).unwrap();
        let json:serde_json::Value=serde_json::from_str(&result.patched_json).unwrap();
        let rows=&json["World"]["GridCollection"]["Grids"]["101"]["Objects"];
        assert_eq!(rows["512"]["Y"],1512);
        assert_eq!(rows["1"]["Orientation"],"GridOrientation_Left");
        assert_eq!(result.patched_json.matches(r#""X":-0"#).count(),512);
        assert_eq!(result.patched_json.matches(r#""Opaque":2.00e+1"#).count(),512);
        assert!(result.patched_json.contains(r#""999":{"ItemID":77,"X":0,"Y":1,"Future":"\u3053"}"#));
        let mut stale=edits.clone();stale[511].expected.1=0;
        assert_eq!(preview_existing_grid_mixed_batch(&source,&stale).err(),Some(PatchError::CoordinateMismatch));
        let mut too_many=edits.clone();too_many.push(edits[0].clone());
        assert_eq!(preview_existing_grid_mixed_batch(&source,&too_many).err(),Some(PatchError::InvalidTarget));
    }

    #[test]
    fn existing_grid_transform_atomically_changes_exactly_three_tokens(){
        let source=r#" {"World":{"GridCollection":{"Grids":{"101":{
          "Objects":{"7":{"ItemID":40000001,"X":-12,"Y":45,
            "Orientation":"GridOrientation_Up",
            "Future":{"nested":{"X":999,"Y":5,"Orientation":"as-is"}},
            "OpaqueNumber":1.00e+2},
            "8":{"ItemID":40000001,"X":-12,"Y":45,
              "Orientation":"GridOrientation_Left"}}
          }}}},"Profile":{"unknown":"\u3053"}} "#;
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,
            grid_id:"101".into(),object_id:"7".into(),item_id:40000001};
        let draft=preview_existing_grid_transform(
            source,target.clone(),(-12,45),(9,-8),
            "GridOrientation_Up","GridOrientation_Down"
        ).unwrap();
        let expected=source
            .replacen(r#""X":-12,"Y":45"#,r#""X":9,"Y":-8"#,1)
            .replacen(r#""Orientation":"GridOrientation_Up""#,
                r#""Orientation":"GridOrientation_Down""#,1);
        assert_eq!(draft.patched_json,expected);
        assert!(draft.changed&&draft.untouched_bytes_preserved);
        assert!(!draft.writer_authorized&&!draft.export_authorized);
        assert!(draft.patched_json.contains(r#""OpaqueNumber":1.00e+2"#));
        assert!(draft.patched_json.contains(r#""unknown":"\u3053""#));
        assert!(draft.patched_json.contains(r#""Orientation":"GridOrientation_Left""#));
        assert_eq!(
            preview_existing_grid_transform(source,target.clone(),
                (0,45),(9,-8),"GridOrientation_Up","GridOrientation_Down").err(),
            Some(PatchError::CoordinateMismatch));
        assert_eq!(
            preview_existing_grid_transform(source,target.clone(),
                (-12,45),(9,-8),"GridOrientation_Right","GridOrientation_Down").err(),
            Some(PatchError::OrientationMismatch));
        assert_eq!(
            preview_existing_grid_transform(source,target.clone(),
                (-12,45),(9,-8),"GridOrientation_Up","invented").err(),
            Some(PatchError::InvalidTarget));
        assert_eq!(
            preview_existing_grid_transform(source,target.clone(),
                (-12,45),(-12,45),"GridOrientation_Up","GridOrientation_Down").err(),
            Some(PatchError::InvalidTarget));
        assert_eq!(
            preview_existing_grid_transform(source,target.clone(),
                (-12,45),(9,-8),"GridOrientation_Up","GridOrientation_Up").err(),
            Some(PatchError::InvalidTarget));
        let wrong=GridCoordinateTarget{item_id:40000002,..target.clone()};
        assert_eq!(
            preview_existing_grid_transform(source,wrong,
                (-12,45),(9,-8),"GridOrientation_Up","GridOrientation_Down").err(),
            Some(PatchError::ItemMismatch));
        let duplicate=source.replacen(r#""X":-12"#,r#""X":-12,"\u0058":-12"#,1);
        assert_eq!(
            preview_existing_grid_transform(&duplicate,target,
                (-12,45),(9,-8),"GridOrientation_Up","GridOrientation_Down").err(),
            Some(PatchError::DuplicateKey));
    }

    #[test]
    fn existing_grid_transform_supports_modified_diff_object(){
        let source=r#"{"World":{"GridCollection":{"DiffGrids":{"33":{
          "ModifiedObjects":{"7":{
            "ItemID":77,"X":12,"Y":2,
            "Orientation":"GridOrientation_Right","Extra":{"new":true}
          }},"RemovedObjects":[5]
        }}}}}"#;
        let target=GridCoordinateTarget{kind:GridObjectKind::DiffModified,
            grid_id:"33".into(),object_id:"7".into(),item_id:77};
        let result=preview_existing_grid_transform(source,target,(12,2),(0,-3),
            "GridOrientation_Right","GridOrientation_Left").unwrap();
        assert!(result.patched_json.contains(r#""X":0,"Y":-3"#));
        assert!(result.patched_json.contains(r#""Orientation":"GridOrientation_Left""#));
        assert!(result.patched_json.contains(r#""RemovedObjects":[5]"#));
        assert!(result.patched_json.contains(r#""Extra":{"new":true}"#));
    }

    #[test]
    fn grid_coordinate_batch_edits_two_grids_atomically_and_preserves_unknowns(){
        let source=r#"{"GameInfo":{"Version":643},"Player":{"Unknown":"\u3053"},
          "World":{"GridCollection":{
            "Grids":{"101":{"Objects":{"1":{
              "ItemID":40000001,"X":1,"Y":-4,
              "State":{"X":900,"Y":800},"Future":"\u0012"}}}},
            "DiffGrids":{"102":{"ModifiedObjects":{"2":{
              "ItemID":40000002,"X":11,"Y":2,
              "Orientation":"South","Custom":1.00e+2}}}}
          }},"Other":{"X":45}}"#;
        let edits=vec![
            GridCoordinateEdit{
                target:GridCoordinateTarget{kind:GridObjectKind::Full,
                    grid_id:"101".into(),object_id:"1".into(),item_id:40000001},
                expected:(1,-4),replacement:(-50,99)
            },
            GridCoordinateEdit{
                target:GridCoordinateTarget{kind:GridObjectKind::DiffModified,
                    grid_id:"102".into(),object_id:"2".into(),item_id:40000002},
                expected:(11,2),replacement:(12,-13)
            }
        ];
        let result=preview_existing_grid_coordinate_batch(source,&edits).unwrap();
        let expected=source.replacen(r#""X":1,"Y":-4"#,
            r#""X":-50,"Y":99"#,1).replacen(r#""X":11,"Y":2"#,
            r#""X":12,"Y":-13"#,1);
        assert_eq!(result.patched_json,expected);
        assert!(result.changed&&result.untouched_bytes_preserved);
        assert!(!result.writer_authorized&&!result.export_authorized);
        assert!(result.patched_json.contains(r#""Custom":1.00e+2"#));
        assert!(result.patched_json.contains(r#""Future":"\u0012""#));
        let mut bad=edits.clone();
        bad[1].expected.1=999;
        assert_eq!(preview_existing_grid_coordinate_batch(source,&bad).err(),
            Some(PatchError::CoordinateMismatch));
        let mut bad_item=edits.clone();
        bad_item[0].target.item_id=40000003;
        assert_eq!(preview_existing_grid_coordinate_batch(source,&bad_item).err(),
            Some(PatchError::ItemMismatch));
        let mut repeated=edits.clone();repeated.push(edits[0].clone());
        assert_eq!(preview_existing_grid_coordinate_batch(source,&repeated).err(),
            Some(PatchError::AmbiguousTarget));
        assert_eq!(preview_existing_grid_coordinate_batch(source,&[]).err(),
            Some(PatchError::InvalidTarget));
    }

    #[test]
    fn native_cardinal_orientation_edits_one_string_token_preserving_unknowns(){
        let source=r#"{"World":{"GridCollection":{"Grids":{"101":{
          "Objects":{"5":{"ItemID":40000001,"X":31,"Y":40,
            "Orientation":"GridOrientation_Up","State":{"Unknown":1.00e+2}},
            "6":{"ItemID":40000002,"Orientation":"GridOrientation_Up"}}}},
          "DiffGrids":{"102":{"ModifiedObjects":{"7":{
            "ItemID":40000003,"X":8,"Y":9,
            "Orientation":"GridOrientation_Left",
            "Private":"\u3053"}}}}}},"Player":{"Future":7}}"#;
        let full=GridCoordinateTarget{kind:GridObjectKind::Full,
            grid_id:"101".into(),object_id:"5".into(),item_id:40000001};
        let diff=GridCoordinateTarget{kind:GridObjectKind::DiffModified,
            grid_id:"102".into(),object_id:"7".into(),item_id:40000003};
        let edited=preview_existing_grid_orientation(source,full.clone(),
            "GridOrientation_Up","GridOrientation_Down").unwrap();
        let exact=source.replacen(r#""Orientation":"GridOrientation_Up""#,
            r#""Orientation":"GridOrientation_Down""#,1);
        assert_eq!(edited.patched_json,exact);
        assert!(edited.changed&&edited.untouched_bytes_preserved);
        assert!(!edited.writer_authorized&&!edited.export_authorized);
        assert!(edited.patched_json.contains(r#""State":{"Unknown":1.00e+2}"#));
        assert!(edited.patched_json.contains(r#""Private":"\u3053""#));
        let dif=preview_existing_grid_orientation(source,diff.clone(),
            "GridOrientation_Left","GridOrientation_Right").unwrap();
        assert_eq!(dif.patched_json,source.replacen(
            r#""Orientation":"GridOrientation_Left""#,
            r#""Orientation":"GridOrientation_Right""#,1));
        assert_eq!(preview_existing_grid_orientation(source,full.clone(),
            "GridOrientation_Left","GridOrientation_Right").err(),
            Some(PatchError::OrientationMismatch));
        assert_eq!(preview_existing_grid_orientation(source,
            GridCoordinateTarget{item_id:2,..full.clone()},
            "GridOrientation_Up","GridOrientation_Right").err(),
            Some(PatchError::ItemMismatch));
        for invalid in ["West","GridOrientation_UpUpLeft","GridOrientation_Hacked"]{
            assert_eq!(preview_existing_grid_orientation(source,full.clone(),
                "GridOrientation_Up",invalid).err(),Some(PatchError::InvalidTarget));
        }
        let dup=source.replace(r#""Orientation":"GridOrientation_Up""#,
            r#""Orientation":"GridOrientation_Up","\u004frientation":1"#);
        // The parser rejects malformed/wrong or duplicated JSON source,
        // rather than serializing a partially patched object.
        assert!(preview_existing_grid_orientation(&dup,full.clone(),
            "GridOrientation_Up","GridOrientation_Right").is_err());
        let noop=preview_existing_grid_orientation(source,full,
            "GridOrientation_Up","GridOrientation_Up").unwrap();
        assert!(!noop.changed);
        assert_eq!(noop.patched_json,source);
    }

    #[test]
    fn grid_coordinate_patch_handles_modified_grid_and_rejects_invalid_values(){
        let original=r#"{"World":{"GridCollection":{"DiffGrids":{"404":{
          "ModifiedObjects":{"2":{"ItemID":77,"X":0,"Y":-2147483648,
            "State":{"X":12,"Y":13},"Custom":"do-not-touch"}}}
        }}}}"#;
        let target=GridCoordinateTarget{
            kind:GridObjectKind::DiffModified,grid_id:"404".into(),
            object_id:"2".into(),item_id:77
        };
        let patched=preview_existing_grid_coordinates(
            original,target.clone(),(0,i32::MIN),(i32::MAX,42)
        ).unwrap();
        assert!(patched.patched_json.contains(r#""X":2147483647,"Y":42"#));
        assert!(patched.patched_json.contains(r#""State":{"X":12,"Y":13}"#));
        assert!(patched.patched_json.contains("do-not-touch"));
        let malformed=original.replace(r#""X":0"#,r#""X":0.0"#);
        assert_eq!(preview_existing_grid_coordinates(&malformed,target.clone(),
            (0,i32::MIN),(100,9)).err(),Some(PatchError::NonIntegerTarget));
        let missing=original.replace(r#""Y":-2147483648"#,r#""SomeNewField":3"#);
        assert_eq!(preview_existing_grid_coordinates(&missing,target.clone(),
            (0,i32::MIN),(100,9)).err(),Some(PatchError::MissingTarget));
        let dup=original.replace(r#""X":0"#,r#""X":0,"\u0058":0"#);
        assert_eq!(preview_existing_grid_coordinates(&dup,target.clone(),
            (0,i32::MIN),(100,9)).err(),Some(PatchError::DuplicateKey));
        let illegal=GridCoordinateTarget{grid_id:"../secret".into(),..target};
        assert_eq!(preview_existing_grid_coordinates(original,illegal,
            (0,i32::MIN),(100,9)).err(),Some(PatchError::InvalidTarget));
    }

}

#[cfg(test)]
mod structural_tests{
 use super::*;
 fn target()->GridCoordinateTarget{GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"10".into(),object_id:"2".into(),item_id:40000001}}
 const SOURCE:&str=r#"{"Player":{"unknown":1e2},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"NextGridObjectID":8,"Objects":{"2":{"ID":2,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}, "7": { "ID":7,"ItemID":40000002,"State":{"Storage":{}}}}}}}}}"#;
 #[test]
 fn structural_duplicate_and_add_preserve_other_bytes(){
  let d=preview_plain_grid_structure(SOURCE,&target(),(1,2),PlainGridStructureAction::Duplicate{x:5,y:6}).unwrap();
  assert_eq!(d.patched_json,SOURCE.replace("\"NextGridObjectID\":8","\"NextGridObjectID\":9").replace("\"Storage\":{}}}","\"Storage\":{}}},\"8\":{\"ID\":8,\"ItemID\":40000001,\"X\":5,\"Y\":6,\"Orientation\":\"GridOrientation_Down\"}"));
  assert!(!d.export_authorized&&!d.writer_authorized);
  let d=preview_plain_grid_structure(SOURCE,&target(),(1,2),PlainGridStructureAction::Add{item_id:40000005,x:3,y:4,orientation:"GridOrientation_Up".into()}).unwrap();
  let root:serde_json::Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(root["World"]["GridCollection"]["Grids"]["10"]["Objects"]["8"]["ItemID"],40000005);
 }
 #[test]
 fn structural_remove_preserves_stateful_neighbor_and_counter(){
  let d=preview_plain_grid_structure(SOURCE,&target(),(1,2),PlainGridStructureAction::Remove).unwrap();
  assert_eq!(d.patched_json,SOURCE.replace("\"2\":{\"ID\":2,\"ItemID\":40000001,\"X\":1,\"Y\":2,\"Orientation\":\"GridOrientation_Down\"},",""));
  let single=SOURCE.replace(", \"7\": { \"ID\":7,\"ItemID\":40000002,\"State\":{\"Storage\":{}}}","");
  let d=preview_plain_grid_structure(&single,&target(),(1,2),PlainGridStructureAction::Remove).unwrap();
  assert!(d.patched_json.contains("\"Objects\":{}"));
 }
 #[test]
 fn structural_transfer_allocates_destination_id_and_keeps_other_bytes(){
  let source=r#"{"Player":{"unknown":1e2},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","NextGridObjectID":8,"Objects":{"2":{"ID":2,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}}},"20":{"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","NextGridObjectID":3,"Objects":{}}},"DiffGrids":{}}}}"#;
  let dest=PlainGridDestination{grid_id:"20".into(),layout_path:"SceneLayouts/Village04/B.json".into(),data_path:"GridData/B.json".into(),tessellation:1,size:(20,20)};
  let draft=preview_plain_grid_transfer(source,&target(),(1,2),&dest,(5,6),"GridOrientation_Right").unwrap();
  let v:serde_json::Value=serde_json::from_str(&draft.patched_json).unwrap();
  let grids=&v["World"]["GridCollection"]["Grids"];
  assert_eq!(grids["10"]["Objects"],serde_json::json!({}));
  assert_eq!(grids["10"]["NextGridObjectID"],8);
  assert_eq!(grids["20"]["NextGridObjectID"],4);
  assert_eq!(grids["20"]["Objects"]["3"],serde_json::json!({"ID":3,"ItemID":40000001,"X":5,"Y":6,"Orientation":"GridOrientation_Right"}));
  assert!(draft.patched_json.contains(r#""unknown":1e2"#));
  assert!(!draft.writer_authorized&&!draft.export_authorized);
  assert!(preview_plain_grid_transfer(source,&target(),(1,2),&dest,(20,6),"GridOrientation_Right").is_err());
  let stale=source.replace(r#""NextGridObjectID":3"#,r#""NextGridObjectID":0"#);
  assert!(preview_plain_grid_transfer(&stale,&target(),(1,2),&dest,(5,6),"GridOrientation_Right").is_err());
  let state=source.replace(r#""Y":2"#,r#""Y":2,"State":{}"#);
  assert!(preview_plain_grid_transfer(&state,&target(),(1,2),&dest,(5,6),"GridOrientation_Right").is_err());
  let wrong=PlainGridDestination{layout_path:"SceneLayouts/VillageExpansion01/B.json".into(),..dest.clone()};
  assert!(preview_plain_grid_transfer(source,&target(),(1,2),&wrong,(5,6),"GridOrientation_Right").is_err());
 }
 #[test]
 fn landscape_transfer_keeps_inventory_and_rejects_cross_world_or_rotation(){
  let source=r#"{"Player":{"ListInventories":{"0":{"Inventory":{"40200001":{"Amount":5}}}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-A.json","NextGridObjectID":8,"Objects":{"2":{"ID":2,"ItemID":40200001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}}},"20":{"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/Villages/Village04-B.json","NextGridObjectID":3,"Objects":{}}},"DiffGrids":{}}}}"#;
  let target=GridCoordinateTarget{item_id:40200001,..target()};
  let dest=PlainGridDestination{grid_id:"20".into(),layout_path:"SceneLayouts/Village04/B.json".into(),data_path:"GridData/Villages/Village04-B.json".into(),tessellation:1,size:(20,20)};
  let d=preview_plain_grid_transfer(source,&target,(1,2),&dest,(5,6),"GridOrientation_Down").unwrap();
  let a:serde_json::Value=serde_json::from_str(source).unwrap();
  let b:serde_json::Value=serde_json::from_str(&d.patched_json).unwrap();
  assert_eq!(a["Player"],b["Player"]);
  assert_eq!(b["World"]["GridCollection"]["Grids"]["10"]["Objects"],serde_json::json!({}));
  assert_eq!(b["World"]["GridCollection"]["Grids"]["20"]["Objects"]["3"]["ItemID"],40200001);
  assert!(preview_plain_grid_transfer(source,&target,(1,2),&dest,(5,6),"GridOrientation_Right").is_err());
  let other=source.replace("SceneLayouts/Village04/B.json","SceneLayouts/VillageExpansion01/B.json").replace("GridData/Villages/Village04-B.json","GridData/Villages/VillageExpansion01/VillageExpansion01-B.json");
  let other_dest=PlainGridDestination{layout_path:"SceneLayouts/VillageExpansion01/B.json".into(),data_path:"GridData/Villages/VillageExpansion01/VillageExpansion01-B.json".into(),..dest.clone()};
  assert!(preview_plain_grid_transfer(&other,&target,(1,2),&other_dest,(5,6),"GridOrientation_Down").is_err());
 }
 #[test]
 fn stock_transaction_roundtrip_retains_zero_marker_unknown_bytes_and_allocator(){
  let original=r#"{"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default","FurnitureItemType_Fence"]},"Inventory":{"40000001":{"Amount":1,"Marker":"ItemMarker_Favorite","Extra":1e2}}}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":8,"Objects":{}}}}}}"#;
  let dest=PlainGridDestination{grid_id:"10".into(),layout_path:"SceneLayouts/Village04/A.json".into(),data_path:"GridData/A.json".into(),tessellation:1,size:(20,20)};
  let place=||FurnitureStockAction::Place{destination:&dest,item_id:40000001,xy:(1,2),orientation:"GridOrientation_Down"};
  let d=preview_furniture_stock_transaction(original,1,place()).unwrap();
  assert!(d.patched_json.contains(r#""Amount":0,"Marker":"ItemMarker_Favorite","Extra":1e2"#));
  assert!(d.patched_json.contains(r#""NextGridObjectID":9"#));
  assert!(!d.export_authorized&&!d.writer_authorized);
  assert!(preview_furniture_stock_transaction(&d.patched_json,0,place()).is_err());
  assert!(preview_furniture_stock_transaction(original,2,place()).is_err());
  let placed=GridCoordinateTarget{object_id:"8".into(),..target()};
  let picked=preview_furniture_stock_transaction(&d.patched_json,0,FurnitureStockAction::Pickup{target:&placed,expected:(1,2)}).unwrap();
  assert_eq!(picked.patched_json,original.replace(r#""NextGridObjectID":8"#,r#""NextGridObjectID":9"#));
  let duplicate=preview_furniture_stock_transaction(&d.patched_json.replace(r#""Amount":0"#,r#""Amount":2"#),2,FurnitureStockAction::Duplicate{target:&placed,expected:(1,2),xy:(3,4)}).unwrap();
  assert!(duplicate.patched_json.contains(r#""Amount":1"#));
  assert!(duplicate.patched_json.contains(r#""NextGridObjectID":10"#));
  assert!(preview_furniture_stock_transaction(&original.replace("FurnitureItemType_Default","FurnitureItemType_Door"),1,place()).is_err());
  assert!(preview_furniture_stock_transaction(&original.replace(r#""Amount":1"#,r#""Amount":2147483648"#),1,place()).is_err());
  assert!(preview_furniture_stock_transaction(&original.replace(r#""40000001""#,r#""40000002""#),1,place()).is_err());
 }

 #[test]
 fn independent_destination_stock_placement_preserves_source_object_and_counter(){
  let raw=r#"{"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2,"Marker":"ItemMarker_Favorite"}}}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":8,"Objects":{"7":{"ID":7,"ItemID":40000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}}},"20":{"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{}}}}}}"#;
  let dest=PlainGridDestination{grid_id:"20".into(),layout_path:"SceneLayouts/Village04/B.json".into(),data_path:"GridData/B.json".into(),tessellation:2,size:(20,20)};
  let draft=preview_furniture_stock_transaction(raw,2,FurnitureStockAction::Place{destination:&dest,item_id:40000001,xy:(31,25),orientation:"GridOrientation_Down"}).unwrap();
  let before:serde_json::Value=serde_json::from_str(raw).unwrap();
  let after:serde_json::Value=serde_json::from_str(&draft.patched_json).unwrap();
  let grids=|v:&serde_json::Value|v["World"]["GridCollection"]["Grids"].clone();
  assert_eq!(grids(&after)["10"],grids(&before)["10"]);
  assert_eq!(grids(&after)["20"]["NextGridObjectID"],4);
  assert_eq!(grids(&after)["20"]["Objects"]["3"],serde_json::json!({"ID":3,"ItemID":40000001,"X":31,"Y":25,"Orientation":"GridOrientation_Down"}));
  assert_eq!(after["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],1);
  assert!(draft.untouched_bytes_preserved&&!draft.writer_authorized&&!draft.export_authorized);
 }
 #[test]
 fn structural_drafts_reject_stale_counter_state_and_non_cardinal(){
  let action=PlainGridStructureAction::Duplicate{x:5,y:6};
  for source in [SOURCE.replace("NextGridObjectID\":8","NextGridObjectID\":7"),SOURCE.replace("\"Y\":2","\"Y\":2,\"State\":{}"),SOURCE.replace("GridOrientation_Down","unknown")]{
   assert!(preview_plain_grid_structure(&source,&target(),(1,2),action.clone()).is_err());
  }
  assert!(preview_plain_grid_structure(SOURCE,&target(),(3,2),action).is_err());
 }
}

#[derive(Clone,Copy,Debug,PartialEq,Eq,Hash,PartialOrd,Ord)]
pub struct AreaNetworkPose{pub item:u32,pub x:i32,pub y:i32,pub left:bool,pub diagonal:bool}
/// Exact whole-grid native network representation. Do not regenerate adjacent
/// roads or silently normalize a fence; its known parts must round-trip.
pub fn validate_area_network(d:&PlainGridDestination,rows:&[AreaNetworkPose])->Result<(),PatchError>{
 if !matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536{return Err(PatchError::InvalidTarget);}
 use fence_topology::{FencePart,decompile_fence,compile_fence_with_posts};
 let q=d.tessellation as i32;let w=(d.size.0*d.tessellation) as i32;let h=(d.size.1*d.tessellation) as i32;
 let mut anchors=HashSet::new();let mut groups=std::collections::BTreeMap::<(u32,bool),Vec<FencePart>>::new();let mut roads=0;let mut fences=0;
 for p in rows{
  let kind=p.item/100_000;
  if p.x<0||p.y<0||p.x>=w||p.y>=h||p.x%q!=0||p.y%q!=0||!anchors.insert((kind,p.x,p.y)){return Err(PatchError::InvalidTarget);}
  match kind{
   401=>{roads+=1;if p.left||p.x%(2*q)!=0||p.y%(2*q)!=0||p.x+2*q>w||p.y+2*q>h{return Err(PatchError::InvalidTarget);}},
   407=>{
    fences+=1;let base=fence_topology::family_for_part(p.item,p.diagonal).ok_or(PatchError::InvalidTarget)?;
    if p.item==base&&p.left{return Err(PatchError::InvalidTarget);}
    let k=fence_topology::part_key(base,p.diagonal,p.item).ok_or(PatchError::InvalidTarget)?.max(1) as i32;
    let (dx,dy)=if p.diagonal{(k*q,k*q)}else if p.left{(q,k*q)}else{(k*q,q)};
    if p.x+dx>w||p.y+dy>h{return Err(PatchError::InvalidTarget);}
    groups.entry((base,p.diagonal)).or_default().push(FencePart{item:p.item,x:p.x,y:p.y,left:p.left,diagonal:p.diagonal});
   },_=>return Err(PatchError::InvalidTarget)
  }
 }
 if roads>4096||fences>512{return Err(PatchError::InvalidTarget);}
 for ((base,diag),parts) in &groups{
  let (nodes,edges)=decompile_fence(*base,d.tessellation,*diag,parts)?;
  let posts=parts.iter().filter(|p|p.item==*base).map(|p|(p.x,p.y)).collect();
  let rebuilt=compile_fence_with_posts(*base,d.tessellation,*diag,&nodes,&edges,&posts)?;
  if rebuilt.into_iter().collect::<std::collections::BTreeSet<_>>()!=parts.iter().copied().collect(){return Err(PatchError::InvalidTarget);}
  if groups.iter().any(|(k,other)|*k!=(*base,*diag)&&other.iter().any(|p|nodes.iter().any(|&(x,y)|i64::from(p.x).abs_diff(i64::from(x))<=8*q as u64&&i64::from(p.y).abs_diff(i64::from(y))<=8*q as u64))){return Err(PatchError::AmbiguousTarget);}
 }
 Ok(())
}
pub struct AreaNetworkDraft{pub draft:GridCoordinateDraft,pub removed:Vec<String>,pub allocated:Vec<String>}
/// Retain unchanged native IDs and raw members. Only exact known network
/// records are removed; all furniture, unknown state and inventory stay put.
pub fn preview_area_network_replacement(source:&str,d:&PlainGridDestination,before:&[AreaNetworkPose],after:&[AreaNetworkPose])->Result<AreaNetworkDraft,PatchError>{
 use serde_json::Value;
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||!matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||!valid_id(&d.grid_id)||full_grid_scope(&d.layout_path).is_none(){return Err(PatchError::InvalidTarget);}
 validate_area_network(d,before)?;validate_area_network(d,after)?;
 let old:HashSet<_>=before.iter().copied().collect();let desired:HashSet<_>=after.iter().copied().collect();
 if old==desired||old.len()!=before.len()||desired.len()!=after.len(){return Err(PatchError::InvalidTarget);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let grid=grids.get(&d.grid_id).ok_or(PatchError::MissingTarget)?;
 let matches=|g:&Value|g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(d.layout_path.as_str())&&g.get("GridDataPath").and_then(Value::as_str)==Some(d.data_path.as_str());
 if !matches(grid)||grids.values().filter(|g|matches(g)).count()!=1||grid.get("ID").and_then(Value::as_u64)!=d.grid_id.parse::<u64>().ok()||grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation))||collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|o|o.contains_key(&d.grid_id))){return Err(PatchError::AmbiguousTarget);}
 let map=grid.get("Objects").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let next=grid.get("NextGridObjectID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(PatchError::InvalidTarget)?;
 if map.len()>100_000||map.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|n|n==0||n>=next||n.to_string()!=*k||v.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(PatchError::AmbiguousTarget);}
 let mut actual=HashSet::new();let mut removed=Vec::new();
 for (id,v) in map{
  let item=v.get("ItemID").and_then(Value::as_u64).ok_or(PatchError::InvalidTarget)?;
  if !matches!(item/100_000,401|407){continue;}
  if v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(PatchError::InvalidTarget);}
  let int=|k:&str|v.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget);
  let orientation=v.get("Orientation").and_then(Value::as_str).ok_or(PatchError::InvalidTarget)?;
  if !matches!(orientation,"GridOrientation_Down"|"GridOrientation_Left"){return Err(PatchError::InvalidTarget);}
  let p=AreaNetworkPose{item:u32::try_from(item).map_err(|_|PatchError::InvalidTarget)?,x:int("X")?,y:int("Y")?,left:orientation=="GridOrientation_Left",diagonal:road_mode(v).ok_or(PatchError::InvalidTarget)?};
  if !actual.insert(p)||!old.contains(&p){return Err(PatchError::AmbiguousTarget);}
  if !desired.contains(&p){removed.push(id.clone());}
 }
 if actual!=old{return Err(PatchError::MissingTarget);}
 let mut added:Vec<_>=desired.difference(&old).copied().collect();added.sort_unstable();
 let following=next.checked_add(added.len() as u32).filter(|n|*n<u32::MAX).ok_or(PatchError::InvalidTarget)?;
 if map.len()+added.len()>100_000{return Err(PatchError::InvalidTarget);}
 let selector=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id:40100068};
 let mut locator=JsonLocator::grid_axis(source,&selector,"X")?;locator.signed_path=None;locator.item_path=None;
 let prefix=vec![k("World"),k("GridCollection"),k("Grids"),k(&d.grid_id)];
 let mut parent=prefix.clone();parent.push(k("Objects"));let mut counter=prefix;counter.push(k("NextGridObjectID"));
 locator.capture.insert(parent.clone(),None);locator.capture.insert(counter.clone(),None);locator.walk_complete()?;
 let mr=locator.capture.get(&parent).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let cr=locator.capture.get(&counter).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(PatchError::InvalidTarget);}
 let removing:HashSet<_>=removed.iter().collect();locator.capture.clear();locator.pos=mr.start;locator.expect(b'{')?;
 let mut members=Vec::new();let mut visited=0;
 loop{
  locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
  let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=parent.clone();p.push(k(&key));locator.value(&mut p)?;
  if !removing.contains(&key){members.push(source[start..locator.pos].to_owned());}
  visited+=1;locator.space();
  if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(PatchError::InvalidDocument);}
 }
 if visited!=map.len(){return Err(PatchError::InvalidDocument);}
 let mut additions=Vec::new();let mut allocated=Vec::new();
 for (i,p) in added.iter().enumerate(){
  let id=next+i as u32;let state=if p.diagonal{serde_json::json!({"FenceMode":{"Diagonal":true}})}else{Value::Null};
  let v=serde_json::json!({"ID":id,"ItemID":p.item,"X":p.x,"Y":p.y,"Orientation":if p.left{"GridOrientation_Left"}else{"GridOrientation_Down"},"State":state});
  let key=id.to_string();members.push(format!("\"{}\":{}",id,v));allocated.push(key.clone());additions.push((key,v));
 }
 let mut edits=vec![(mr,format!("{{{}}}",members.join(",")))];if !added.is_empty(){edits.push((cr,following.to_string()));}edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::new();let mut last=0;for (r,v) in edits{candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&source[last..]);
 if candidate.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
 let target=root["World"]["GridCollection"]["Grids"][&d.grid_id].as_object_mut().ok_or(PatchError::MissingTarget)?;
 let objects=target.get_mut("Objects").and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?;
 for id in &removed{objects.remove(id);}for (id,v) in additions{objects.insert(id,v);}
 if !added.is_empty(){target.insert("NextGridObjectID".into(),Value::from(following));}
 if serde_json::from_str::<Value>(&candidate).map_err(|_|PatchError::InvalidDocument)?!=root{return Err(PatchError::InvalidDocument);}
 validate_json_without_edit(&candidate)?;
 Ok(AreaNetworkDraft{draft:GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false},removed,allocated})
}

#[cfg(test)]
mod area_network_tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"Inventory":{"40100068":{"Amount":17}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40100068,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40000001,"X":8,"Y":4,"Orientation":"GridOrientation_Down","Unknown":1e2},"3":{"ID":3,"ItemID":40100068,"X":8,"Y":4,"Orientation":"GridOrientation_Down","State":{"FenceMode":{"Diagonal":true}}}}},"8":{"ID":8,"Objects":{"1":{"ID":1,"ItemID":40100068}}}}}}}"#;
 fn dest()->PlainGridDestination{PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Test.json".into(),tessellation:2,size:(40,40)}}
 fn road(item:u32,x:i32,y:i32,diagonal:bool)->AreaNetworkPose{AreaNetworkPose{item,x,y,left:false,diagonal}}
 #[test]fn full_network_replacement_keeps_unchanged_ids_and_unrelated_lexical_members(){
  let old=[road(40100068,4,4,false),road(40100068,8,4,true)];
  let next=[old[0],road(40100038,12,4,true)];
  let result=preview_area_network_replacement(SOURCE,&dest(),&old,&next).unwrap();
  assert_eq!(result.removed,vec!["3"]);assert_eq!(result.allocated,vec!["4"]);
  assert!(result.draft.patched_json.contains("\"Unknown\":1e2"));assert!(!result.draft.export_authorized);
  let a:serde_json::Value=serde_json::from_str(SOURCE).unwrap();let b:serde_json::Value=serde_json::from_str(&result.draft.patched_json).unwrap();
  assert_eq!(a["Player"],b["Player"]);let g=&b["World"]["GridCollection"]["Grids"];let old_g=&a["World"]["GridCollection"]["Grids"];
  assert_eq!(old_g["8"],g["8"]);assert_eq!(g["7"]["Objects"]["1"],old_g["7"]["Objects"]["1"]);assert_eq!(g["7"]["Objects"]["2"],old_g["7"]["Objects"]["2"]);
  assert!(g["7"]["Objects"].get("3").is_none());assert_eq!(g["7"]["Objects"]["4"]["ItemID"],40100038);assert_eq!(g["7"]["Objects"]["4"]["State"]["FenceMode"]["Diagonal"],true);
  assert_eq!(g["7"]["NextGridObjectID"],5);
  assert!(preview_area_network_replacement(SOURCE,&dest(),&old[..1],&next).is_err());
  assert!(preview_area_network_replacement(SOURCE,&dest(),&old,&[next[0],road(40100038,4,4,true)]).is_err());
  let stale=SOURCE.replace("\"Diagonal\":true","\"Diagonal\":false");assert!(preview_area_network_replacement(&stale,&dest(),&old,&next).is_err());
  let removed=preview_area_network_replacement(SOURCE,&dest(),&old,&[]).unwrap();assert_eq!(removed.removed.len(),2);assert!(removed.allocated.is_empty());
 }
 #[test]fn whole_fence_network_round_trips_original_parts(){
  let nodes=vec![(20,20),(22,20),(24,20)];let edges=nodes.windows(2).map(|p|(p[0],p[1])).collect::<Vec<_>>();
  let original=fence_topology::compile_fence_with_posts(40700000,2,false,&nodes,&edges,&std::collections::BTreeSet::new()).unwrap();
  let next=original.iter().map(|p|AreaNetworkPose{item:p.item,x:p.x,y:p.y,left:p.left,diagonal:p.diagonal}).collect::<Vec<_>>();
  let old=[road(40100068,4,4,false),road(40100068,8,4,true)];
  let result=preview_area_network_replacement(SOURCE,&dest(),&old,&next).unwrap();
  assert_eq!(result.allocated.len(),original.len());
  let mut invalid=next.clone();invalid[0].x=1;assert!(preview_area_network_replacement(SOURCE,&dest(),&old,&invalid).is_err());
 }
}
