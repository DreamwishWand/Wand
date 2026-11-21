use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm_bindgen::prelude::*;

const INDEX_SCHEMA: &str = "wand.collection.runtime@1";
const ROW_SCHEMA: &str = "wand.collection.records@1";
const STATE_SCHEMA: &str = "wand.collection.local@1";
const MAX_WORKSPACES: usize = 5;
const MAX_ROWS: usize = 300_000;
const CATEGORY_ORDER: [&str; 29] = [
    "Furniture","Landscaping","Roads & Fences","Wallpaper & Flooring","Buildings",
    "Environment Effects","Clothing","Appearance","Touch of Magic","Photo Mode",
    "Tools","Upgrades","Characters","Companions","Critters","Mounts","Crafting",
    "Meals","Ingredients","Foraging","Fish","Gems","Timebending","Memories",
    "Board Game","Snippets","Lorekeeper Tales","Quest Puzzles","Exhibition"
];
const LOCALES: [&str; 8] = ["en", "fr", "it", "de", "es-ES", "ja", "zh-CN", "pt-BR"];


const DB00_RELEASE_SCHEMA: &str = "wand.game-db.release@1";
const DB00_SNAPSHOT_SCHEMA: &str = "wand.game-db.snapshot@1";
fn intern(dictionary: &mut Vec<String>, value: String) -> usize {
    if let Some(index) = dictionary.iter().position(|entry| entry == &value) { index }
    else { let index = dictionary.len(); dictionary.push(value); index }
}
#[derive(Deserialize)]
struct Db00Source {
    id: String,
    visibility: String,
}
#[derive(Deserialize)]
struct Db00Release {
    id: String,
}
#[derive(Deserialize)]
struct Db00Target {
    platform: String,
    #[serde(rename="gameVersion")]
    game_version: Option<String>,
    #[serde(rename="buildId")]
    build_id: Option<String>,
}
#[derive(Deserialize)]
struct Db00Index {
    schema: String,
    id: String,
    count: usize,
    target: Db00Target,
    sources: Vec<Db00Source>,
    releases: Vec<Db00Release>,
    shards: Vec<ShardMeta>,
}
#[derive(Deserialize)]
struct Db00Shard {
    schema: String,
    offset: usize,
    count: usize,
    items: Vec<Db00Item>,
}
#[derive(Deserialize)]
struct Db00Item {
    id: String,
    names: HashMap<String,String>,
    #[serde(rename="nameStatus")]
    name_status: String,
    category: Option<String>,
    #[serde(rename="stateClass")]
    state_class: Option<String>,
    #[serde(rename="stateSemantic")]
    state_semantic: Option<String>,
    #[serde(default)]
    worlds: Vec<String>,
    #[serde(default)]
    universes: Vec<String>,
    #[serde(default,rename="contentIds")]
    content_ids: Vec<String>,
    #[serde(default,rename="releaseIds")]
    release_ids: Vec<String>,
    #[serde(default,rename="sourceRefs")]
    source_refs: Vec<String>,
    #[serde(default)]
    relations: Vec<String>,
}

#[derive(Clone, Deserialize)]
struct ManifestTarget {
    platform: String,
    #[serde(rename = "gameVersion")]
    game_version: String,
    #[serde(rename = "buildID")]
    build_id: String,
}

#[derive(Clone, Deserialize)]
struct ShardMeta {
    file: String,
    offset: usize,
    count: usize,
    bytes: usize,
    sha256: String,
}

#[derive(Clone, Deserialize)]
struct Index {
    #[serde(rename = "s")]
    schema: String,
    #[serde(rename = "t")]
    target: ManifestTarget,
    #[serde(rename = "f")]
    families: Vec<String>,
    #[serde(rename = "c")]
    state_classes: Vec<String>,
    #[serde(rename = "m")]
    semantics: Vec<String>,
    #[serde(rename = "w")]
    worlds: Vec<String>,
    #[serde(rename = "u")]
    universes: Vec<String>,
    #[serde(rename = "e")]
    expansions: Vec<String>,
    #[serde(rename = "wl")]
    world_labels: Vec<Vec<String>>,
    #[serde(rename = "ul")]
    universe_labels: Vec<Vec<String>>,
    #[serde(rename = "n")]
    count: usize,
    shards: Vec<ShardMeta>,
}

#[derive(Deserialize)]
struct Shard {
    #[serde(rename = "s")]
    schema: String,
    offset: usize,
    count: usize,
    #[serde(rename = "r")]
    rows: Vec<(u64, usize, usize, usize, Vec<usize>, Vec<usize>, Vec<usize>, Vec<Option<String>>)>,
}

#[derive(Clone)]
struct Item {
    id: u64,
    family: usize,
    semantic: usize,
    world: Vec<usize>,
    universe: Vec<usize>,
    expansion: Vec<usize>,
    labels: Vec<String>,
    search: String,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Entry {
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quantity: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    discovered: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    favorite: Option<bool>,
}

impl Entry {
    fn valid(&self) -> bool {
        self.status.as_ref().is_none_or(|s| s == "owned" || s == "missing")
            && self.quantity.is_none_or(|q| q <= 999_999)
    }
    fn empty(&self) -> bool {
        self.status.is_none() && self.quantity.is_none()
            && self.discovered.is_none() && self.favorite.is_none()
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Workspace {
    id: String,
    name: String,
    entries: BTreeMap<String, Entry>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct State {
    schema: String,
    active: String,
    workspaces: Vec<Workspace>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            schema: STATE_SCHEMA.into(),
            active: "local-1".into(),
            workspaces: vec![Workspace {
                id: "local-1".into(),
                name: "My Collection".into(),
                entries: BTreeMap::new(),
            }],
        }
    }
}

fn valid_workspace_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 80
        && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn valid_item_id(s: &str) -> bool {
    s.len() <= 16 && !s.is_empty() && !s.starts_with('0')
        && s.bytes().all(|b| b.is_ascii_digit())
        && s.parse::<u64>().is_ok_and(|n| n > 0 && n <= 9_007_199_254_740_991)
}
fn valid_state(s: &State) -> Result<(), String> {
    if s.schema != STATE_SCHEMA || s.workspaces.is_empty() || s.workspaces.len() > MAX_WORKSPACES {
        return Err("COLLECTION_BACKUP_SCHEMA".into());
    }
    let mut ids = HashSet::new();
    for w in &s.workspaces {
        if !valid_workspace_id(&w.id) || !ids.insert(w.id.clone())
            || w.name.trim().is_empty() || w.name.len() > 80
        {
            return Err("COLLECTION_WORKSPACE_INVALID".into());
        }
        if w.entries.len() > MAX_ROWS {
            return Err("COLLECTION_ENTRIES_LIMIT".into());
        }
        for (id, entry) in &w.entries {
            if !valid_item_id(id) || !entry.valid() {
                return Err("COLLECTION_ENTRY_INVALID".into());
            }
        }
    }
    if !ids.contains(&s.active) {
        return Err("COLLECTION_ACTIVE_WORKSPACE_INVALID".into());
    }
    Ok(())
}
fn parse_state(source: &str) -> Result<State, String> {
    if source.len() > 10_000_000 {
        return Err("COLLECTION_BACKUP_TOO_LARGE".into());
    }
    let state: State = serde_json::from_str(source).map_err(|_| "COLLECTION_BACKUP_INVALID")?;
    valid_state(&state)?;
    Ok(state)
}
fn locale_index(locale: &str) -> usize {
    LOCALES.iter().position(|l| *l == locale).unwrap_or(0)
}
fn display(text: &str) -> String {
    text.replace("<nobr>", "").replace("</nobr>", "")
        .replace(&['\u{200b}', '\u{200c}', '\u{200d}', '\u{feff}'][..], "")
        .trim().to_string()
}
fn one_of(needle: &str, values: &[String], indices: &[usize]) -> bool {
    needle.is_empty() || indices.iter().any(|&i| values.get(i).is_some_and(|v| v == needle))
}
fn output<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "COLLECTION_SERIALIZATION_FAILED".into())
}
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Query {
    locale: String,
    search: String,
    category: String,
    world: String,
    universe: String,
    expansion: String,
    status: String,
    offset: usize,
    limit: usize,
}
fn checked_index(source: &str) -> Result<Index, String> {
    let index: Index = serde_json::from_str(source).map_err(|_| "COLLECTION_INDEX_JSON")?;
    if index.schema != INDEX_SCHEMA || index.target.platform != "Nintendo Switch"
        || index.target.game_version != "1.25.0" || index.target.build_id != "52BD625D9B4E0053"
        || index.count == 0 || index.count > MAX_ROWS || index.shards.is_empty()
        || index.families.is_empty() || index.semantics.is_empty()
        || index.world_labels.len() != index.worlds.len()
        || index.universe_labels.len() != index.universes.len()
        || index.world_labels.iter().any(|l| l.len() != 8)
        || index.universe_labels.iter().any(|l| l.len() != 8)
    {
        return Err("COLLECTION_INDEX_UNSUPPORTED".into());
    }
    let mut offset = 0usize;
    for s in &index.shards {
        if s.offset != offset || s.count == 0 || s.count > 10000 || s.bytes == 0
            || s.sha256.len() != 64
            || !s.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || !s.file.starts_with("records-") || !s.file.ends_with(".json")
            || s.file.bytes().any(|b| !(b.is_ascii_alphanumeric() || b == b'-' || b == b'.'))
        {
            return Err("COLLECTION_INDEX_SHARD_INVALID".into());
        }
        offset = offset.checked_add(s.count).ok_or("COLLECTION_INDEX_OVERFLOW")?;
    }
    if offset != index.count {
        return Err("COLLECTION_INDEX_COUNT_MISMATCH".into());
    }
    Ok(index)
}

#[wasm_bindgen]
pub struct CollectionEngine {
    index: Option<Index>,
    rows: Vec<Item>,
    lookup: HashMap<u64, usize>,
    state: State,
    db00_mode: bool,
    db00_sources: HashSet<String>,
    db00_releases: HashSet<String>,
    db00_relations: Vec<(u64,u64)>,
}

impl Default for CollectionEngine {
    fn default() -> Self {
        Self {
            index: None,
            rows: Vec::new(),
            lookup: HashMap::new(),
            state: State::default(),
            db00_mode: false,
            db00_sources: HashSet::new(),
            db00_releases: HashSet::new(),
            db00_relations: Vec::new(),
        }
    }
}

impl CollectionEngine {
    fn load_index_impl(&mut self, source: &str) -> Result<(), String> {
        let index = checked_index(source)?;
        self.index = Some(index);
        self.rows.clear();
        self.lookup.clear();
        self.db00_mode = false;
        self.db00_sources.clear();
        self.db00_releases.clear();
        self.db00_relations.clear();
        Ok(())
    }
    fn load_db00_index_impl(&mut self, source: &str) -> Result<(),String> {
        let published: Db00Index = serde_json::from_str(source).map_err(|_|"COLLECTION_DB00_INDEX_JSON")?;
        if published.schema != DB00_RELEASE_SCHEMA || published.id.is_empty()
            || published.count == 0 || published.count > MAX_ROWS
            || published.target.platform.is_empty() || published.sources.is_empty()
            || published.sources.iter().any(|entry|entry.visibility!="public_reference" || entry.id.is_empty())
        { return Err("COLLECTION_DB00_PUBLISHABLE_INDEX_REQUIRED".into()); }
        let sources:HashSet<String> = published.sources.iter().map(|entry|entry.id.clone()).collect();
        let releases:HashSet<String> = published.releases.iter().map(|entry|entry.id.clone()).collect();
        if sources.len()!=published.sources.len() || releases.len()!=published.releases.len()
            || published.shards.is_empty()
        { return Err("COLLECTION_DB00_INDEX_DUPLICATE".into()); }
        let mut count = 0usize;
        for shard in &published.shards {
            if shard.offset != count || shard.count == 0 || shard.count > 10000
                || shard.bytes == 0 || shard.sha256.len() != 64
                || !shard.sha256.bytes().all(|b| b.is_ascii_hexdigit())
                || !shard.file.starts_with("items-") || !shard.file.ends_with(".json")
                || shard.file.bytes().any(|b|!(b.is_ascii_alphanumeric() || b==b'-' || b==b'.'))
            { return Err("COLLECTION_DB00_INDEX_SHARDS".into()); }
            count = count.checked_add(shard.count).ok_or("COLLECTION_DB00_INDEX_OVERFLOW")?;
        }
        if count != published.count {return Err("COLLECTION_DB00_INDEX_COUNT".into());}
        self.index = Some(Index {
            schema: DB00_RELEASE_SCHEMA.into(),
            target: ManifestTarget {
                platform: published.target.platform,
                game_version: published.target.game_version.unwrap_or_else(||"unknown".into()),
                build_id: published.target.build_id.unwrap_or_else(||"unknown".into()),
            },
            families: vec!["Unclassified".into()],
            state_classes: vec!["READ_ONLY".into()],
            semantics: vec!["UNLOCK_OR_AVAILABILITY".into()],
            worlds: Vec::new(), universes: Vec::new(), expansions: Vec::new(),
            world_labels: Vec::new(), universe_labels: Vec::new(),
            count:published.count, shards:published.shards,
        });
        self.rows.clear();
        self.lookup.clear();
        self.db00_mode=true;
        self.db00_sources=sources;
        self.db00_releases=releases;
        self.db00_relations.clear();
        Ok(())
    }
    fn append_db00_shard_impl(&mut self, source: &str) -> Result<(),String> {
        if !self.db00_mode {return Err("COLLECTION_DB00_INDEX_REQUIRED".into());}
        let index=self.index.as_ref().ok_or("COLLECTION_DB00_INDEX_REQUIRED")?;
        let meta=index.shards.iter().find(|shard|shard.offset==self.rows.len())
            .ok_or("COLLECTION_DB00_SHARD_ORDER")?;
        if source.as_bytes().len()!=meta.bytes {return Err("COLLECTION_DB00_SHARD_BYTES".into());}
        let shard:Db00Shard=serde_json::from_str(source).map_err(|_|"COLLECTION_DB00_SHARD_JSON")?;
        if shard.schema!=DB00_SNAPSHOT_SCHEMA || shard.offset!=meta.offset
            || shard.count!=meta.count || shard.items.len()!=meta.count
        {return Err("COLLECTION_DB00_SHARD_CONTRACT".into());}
        // Stage the dictionary too: a rejected row must not leave phantom
        // categories, semantics, world/universe or expansion IDs behind.
        let mut staged_index=index.clone();
        let mut staged=Vec::with_capacity(shard.items.len());
        let mut staged_relations=Vec::new();
        let mut ids=HashSet::new();
        for row in shard.items {
            if !valid_item_id(&row.id) {return Err("COLLECTION_DB00_ITEM_ID".into());}
            let id=row.id.parse::<u64>().map_err(|_|"COLLECTION_DB00_ITEM_ID")?;
            if !ids.insert(id) || self.lookup.contains_key(&id)
                || row.name_status!="verified" || row.names.keys().any(|l|!LOCALES.contains(&l.as_str()))
                || row.source_refs.is_empty()
                || row.source_refs.iter().any(|r|!self.db00_sources.contains(r))
                || row.release_ids.iter().any(|r|!self.db00_releases.contains(r))
            {return Err("COLLECTION_DB00_ITEM_UNVERIFIED".into());}
            for related in row.relations {
                if !valid_item_id(&related) {return Err("COLLECTION_DB00_RELATION_ID".into());}
                staged_relations.push((id,related.parse::<u64>().map_err(|_|"COLLECTION_DB00_RELATION_ID")?));
            }
            let family=intern(&mut staged_index.families,row.category.unwrap_or_else(||"Unclassified".into()));
            let semantic=intern(&mut staged_index.semantics,row.state_semantic.unwrap_or_else(||"UNLOCK_OR_AVAILABILITY".into()));
            intern(&mut staged_index.state_classes,row.state_class.unwrap_or_else(||"READ_ONLY".into()));
            let world:Vec<usize>=row.worlds.into_iter().map(|v|intern(&mut staged_index.worlds,v)).collect();
            let universe:Vec<usize>=row.universes.into_iter().map(|v|intern(&mut staged_index.universes,v)).collect();
            let expansion:Vec<usize>=row.content_ids.into_iter().map(|v|intern(&mut staged_index.expansions,v)).collect();
            let labels:Vec<String>=LOCALES.iter().map(|lang|display(row.names.get(*lang).map(|s|s.as_str()).unwrap_or(""))).collect();
            let search=labels.join(" ").to_lowercase();
            staged.push(Item {id,family,semantic,world,universe,expansion,labels,search});
        }
        staged_index.world_labels=staged_index.worlds.iter().map(|label|vec![label.clone();8]).collect();
        staged_index.universe_labels=staged_index.universes.iter().map(|label|vec![label.clone();8]).collect();
        // No shared Collection state is touched until every item is valid.
        self.index=Some(staged_index);
        for item in staged {
            self.lookup.insert(item.id,self.rows.len());
            self.rows.push(item);
        }
        self.db00_relations.extend(staged_relations);
        Ok(())
    }
    fn finish_db00_impl(&self)->Result<(),String>{
        if !self.db00_mode {return Err("COLLECTION_DB00_INDEX_REQUIRED".into());}
        self.ready()?;
        if self.db00_relations.iter().any(|(_,to)|!self.lookup.contains_key(to))
        {return Err("COLLECTION_DB00_DANGLING_RELATION".into());}
        Ok(())
    }
    fn metadata_impl(&self)->Result<String,String>{
        let index=self.ready()?;
        output(&json!({
            "version": if self.db00_mode && index.target.game_version=="unknown" {
                None
            } else {
                Some(index.target.game_version.as_str())
            },
            "platform":index.target.platform,
            "expansions":index.expansions,
            "worlds":index.worlds,
            "universes":index.universes,
            "worldLabels":index.world_labels,
            "universeLabels":index.universe_labels
        }))
    }
    fn append_shard_impl(&mut self, source: &str) -> Result<(), String> {
        let index = self.index.as_ref().ok_or("COLLECTION_INDEX_REQUIRED")?;
        let meta = index.shards.iter().find(|s| s.offset == self.rows.len())
            .ok_or("COLLECTION_SHARD_ORDER")?;
        if source.len() != meta.bytes {
            return Err("COLLECTION_SHARD_SIZE_MISMATCH".into());
        }
        let shard: Shard = serde_json::from_str(source).map_err(|_| "COLLECTION_SHARD_JSON")?;
        if shard.schema != ROW_SCHEMA || shard.offset != meta.offset
            || shard.count != meta.count || shard.rows.len() != meta.count
        {
            return Err("COLLECTION_SHARD_SCHEMA".into());
        }
        let mut staged = Vec::with_capacity(shard.rows.len());
        let mut ids = HashSet::new();
        for (id, family, class, semantic, world, universe, expansion, labels) in shard.rows {
            if id == 0 || id > 9_007_199_254_740_991 || !ids.insert(id)
                || self.lookup.contains_key(&id) || family >= index.families.len()
                || class >= index.state_classes.len() || semantic >= index.semantics.len()
                || labels.len() != 8 || world.iter().any(|&v| v >= index.worlds.len())
                || universe.iter().any(|&v| v >= index.universes.len())
                || expansion.iter().any(|&v| v >= index.expansions.len())
            {
                return Err("COLLECTION_SHARD_RECORD".into());
            }
            let labels: Vec<String> = labels.iter().map(|label| display(label.as_deref().unwrap_or(""))).collect();
            let search = labels.join(" ").to_lowercase();
            staged.push(Item { id, family, semantic, world, universe, expansion, labels, search });
        }
        for item in staged {
            self.lookup.insert(item.id, self.rows.len());
            self.rows.push(item);
        }
        Ok(())
    }
    fn ready(&self) -> Result<&Index, String> {
        let index = self.index.as_ref().ok_or("COLLECTION_INDEX_REQUIRED")?;
        if self.rows.len() != index.count {
            return Err("COLLECTION_CATALOG_INCOMPLETE".into());
        }
        Ok(index)
    }
    fn workspace(&self) -> &Workspace {
        self.state.workspaces.iter().find(|w| w.id == self.state.active)
            .expect("validated active workspace")
    }
    fn entry(&self, id: u64) -> Option<&Entry> {
        self.workspace().entries.get(&id.to_string())
    }
    fn status(&self, id: u64) -> &str {
        self.entry(id).and_then(|e| e.status.as_deref()).unwrap_or("unknown")
    }
    fn item_json(&self, index: &Index, item: &Item, loc: usize) -> Value {
        let entry = self.entry(item.id);
        let label = item.labels.get(loc).filter(|s| !s.is_empty())
            .or_else(|| item.labels.iter().find(|s| !s.is_empty()))
            .cloned().unwrap_or_else(|| format!("Item {}", item.id));
        json!({
            "itemId":item.id,
            "label": label,
            "family":index.families[item.family],
            "stateSemantic": index.semantics[item.semantic],
            "worlds":item.world.iter().map(|&i| index.worlds[i].as_str()).collect::<Vec<_>>(),
            "universes":item.universe.iter().map(|&i| index.universes[i].as_str()).collect::<Vec<_>>(),
            "expansions":item.expansion.iter().map(|&i| index.expansions[i].as_str()).collect::<Vec<_>>(),
            "status": self.status(item.id),
            "quantity":entry.and_then(|e|e.quantity),
            "discovered":entry.and_then(|e|e.discovered),
            "favorite":entry.and_then(|e|e.favorite),
        })
    }
    fn query_impl(&self, source: &str) -> Result<String, String> {
        let index = self.ready()?;
        let query: Query = serde_json::from_str(source).map_err(|_|"COLLECTION_QUERY_INVALID")?;
        if query.limit == 0 || query.limit > 200 || query.offset > MAX_ROWS
            || query.search.len() > 512
            || !["", "all", "owned", "missing", "unknown"].contains(&query.status.as_str())
        { return Err("COLLECTION_QUERY_BOUNDS".into()); }
        let loc = locale_index(&query.locale);
        let term = query.search.trim().to_lowercase();
        let mut matches: Vec<&Item> = self.rows.iter().filter(|r| {
            (term.is_empty() || r.search.contains(&term) || r.id.to_string().contains(&term))
            && (query.category.is_empty() || index.families[r.family] == query.category)
            && one_of(&query.world,&index.worlds,&r.world)
            && one_of(&query.universe,&index.universes,&r.universe)
            && one_of(&query.expansion,&index.expansions,&r.expansion)
            && (query.status.is_empty() || query.status == "all" || self.status(r.id) == query.status)
        }).collect();
        matches.sort_unstable_by(|a,b| {
            a.labels.get(loc).unwrap_or(&String::new()).to_lowercase()
                .cmp(&b.labels.get(loc).unwrap_or(&String::new()).to_lowercase())
                .then(a.id.cmp(&b.id))
        });
        let total = matches.len();
        let page = matches.into_iter().skip(query.offset).take(query.limit)
            .map(|r|self.item_json(index,r,loc)).collect::<Vec<_>>();
        output(&json!({"total":total,"items":page,"hasMore":query.offset.saturating_add(query.limit)<total}))
    }
    fn facets_impl(&self, mode: &str, locale: &str) -> Result<String, String> {
        let index = self.ready()?;
        let loc = locale_index(locale);
        let names: Vec<String> = match mode {
            "category" => {
                let mut ordered: Vec<String> = CATEGORY_ORDER.iter().map(|v|v.to_string()).collect();
                for name in &index.families {
                    if !ordered.contains(name) {ordered.push(name.clone());}
                }
                ordered
            }
            "world" => index.worlds.clone(),
            "universe" => index.universes.clone(),
            _ => return Err("COLLECTION_MODE_INVALID".into())
        };
        let mut totals = vec![0usize; names.len()];
        let mut owned = vec![0usize; names.len()];
        for item in &self.rows {
            let ids: Vec<usize> = match mode {
                "category" => vec![names.iter().position(|name|name==&index.families[item.family])
                    .ok_or("COLLECTION_FAMILY_UNKNOWN")?],
                "world" => item.world.clone(),
                _ => item.universe.clone(),
            };
            for id in ids {
                totals[id] += 1;
                if self.status(item.id) == "owned" { owned[id] += 1; }
            }
        }
        let result: Vec<Value> = names.iter().enumerate().map(|(i,id)| {
            let label = match mode {
                "world" => index.world_labels.get(i).and_then(|n| n.get(loc)).cloned().unwrap_or(id.clone()),
                "universe" => index.universe_labels.get(i).and_then(|n| n.get(loc)).cloned().unwrap_or(id.clone()),
                _ => id.clone()
            };
            json!({"id":id,"label":label,"total":totals[i],"owned":owned[i]})
        }).collect();
        output(&result)
    }
    fn progress_impl(&self) -> Result<String, String> {
        self.ready()?;
        let (mut owned, mut missing, mut unknown, mut discovered) = (0,0,0,0);
        for item in &self.rows {
            match self.status(item.id) {
                "owned" => owned += 1,
                "missing" => missing += 1,
                _ => unknown += 1,
            }
            if self.entry(item.id).and_then(|e|e.discovered)==Some(true) { discovered += 1; }
        }
        output(&json!({"owned":owned,"missing":missing,"unknown":unknown,"discovered":discovered,"total":self.rows.len()}))
    }
    fn with_state<F>(&mut self, mutate: F) -> Result<(), String>
        where F:FnOnce(&mut State)->Result<(), String>
    {
        let mut candidate = self.state.clone();
        mutate(&mut candidate)?;
        valid_state(&candidate)?;
        self.state = candidate;
        Ok(())
    }
    fn set_entry_impl(&mut self, id: u64, change: &str) -> Result<(), String> {
        if id == 0 || id > 9_007_199_254_740_991 { return Err("COLLECTION_ITEM_ID_INVALID".into()); }
        let update: Value = serde_json::from_str(change).map_err(|_|"COLLECTION_CHANGE_INVALID")?;
        let m = update.as_object().ok_or("COLLECTION_CHANGE_INVALID")?;
        if m.keys().any(|k| !["status","quantity","discovered","favorite"].contains(&k.as_str())) {
            return Err("COLLECTION_CHANGE_FIELD".into());
        }
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id==state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            let key = id.to_string();
            let mut e = w.entries.get(&key).cloned().unwrap_or_default();
            for (k,v) in m {
                match k.as_str() {
                    "status" => e.status = if v.is_null() {None} else {Some(v.as_str().ok_or("COLLECTION_STATUS_INVALID")?.to_string())},
                    "quantity" => e.quantity = if v.is_null() {None} else {Some(v.as_u64().and_then(|x|u32::try_from(x).ok()).ok_or("COLLECTION_QUANTITY_INVALID")?)},
                    "discovered" => e.discovered = if v.is_null() {None} else {Some(v.as_bool().ok_or("COLLECTION_DISCOVERED_INVALID")?)},
                    "favorite" => e.favorite = if v.is_null() {None} else {Some(v.as_bool().ok_or("COLLECTION_FAVORITE_INVALID")?)},
                    _ => return Err("COLLECTION_CHANGE_FIELD".into())
                }
            }
            if e.empty() { w.entries.remove(&key); } else { w.entries.insert(key,e); }
            Ok(())
        })
    }
    fn bulk_impl(&mut self, ids_json: &str, status: &str) -> Result<(), String> {
        if !["owned","missing","unknown"].contains(&status) {return Err("COLLECTION_BULK_STATUS".into());}
        let ids: Vec<u64> = serde_json::from_str(ids_json).map_err(|_|"COLLECTION_BULK_IDS")?;
        if ids.len() > 20_000 || ids.iter().any(|id|*id == 0 || *id > 9_007_199_254_740_991) {
            return Err("COLLECTION_BULK_INVALID".into());
        }
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id==state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            for id in ids {
                let key = id.to_string();
                let mut e = w.entries.get(&key).cloned().unwrap_or_default();
                e.status = if status == "unknown" {None} else {Some(status.to_string())};
                if e.empty() { w.entries.remove(&key); } else {w.entries.insert(key,e);}
            }
            Ok(())
        })
    }
    fn workspace_impl(&mut self, action: &str, id: &str, name: &str) -> Result<(), String> {
        self.with_state(|state| {
            match action {
                "select" => {
                    if !state.workspaces.iter().any(|w|w.id == id) { return Err("COLLECTION_WORKSPACE_UNKNOWN".into()); }
                    state.active=id.to_string();
                }
                "add" => {
                    if !valid_workspace_id(id) || state.workspaces.len()>=MAX_WORKSPACES
                        || state.workspaces.iter().any(|w|w.id==id)
                    {return Err("COLLECTION_WORKSPACE_LIMIT".into());}
                    state.workspaces.push(Workspace{id:id.into(),name:name.trim().into(),entries:BTreeMap::new()});
                    state.active=id.into();
                }
                "rename" => {
                    let w=state.workspaces.iter_mut().find(|w|w.id==id).ok_or("COLLECTION_WORKSPACE_UNKNOWN")?;
                    w.name=name.trim().into();
                }
                "delete" => {
                    if state.workspaces.len()==1 {return Err("COLLECTION_LAST_WORKSPACE".into());}
                    let n=state.workspaces.len();
                    state.workspaces.retain(|w|w.id!=id);
                    if n==state.workspaces.len(){return Err("COLLECTION_WORKSPACE_UNKNOWN".into());}
                    if state.active==id {state.active=state.workspaces[0].id.clone();}
                }
                _ => return Err("COLLECTION_WORKSPACE_ACTION".into())
            }
            Ok(())
        })
    }
}

#[wasm_bindgen]
impl CollectionEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CollectionEngine {CollectionEngine::default()}
    pub fn load_index(&mut self, source: &str) -> Result<(), JsValue> {
        self.load_index_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn load_db00_index(&mut self, source: &str) -> Result<(), JsValue> {
        self.load_db00_index_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn append_db00_shard(&mut self, source: &str) -> Result<(), JsValue> {
        self.append_db00_shard_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn finish_db00(&self) -> Result<(), JsValue> {
        self.finish_db00_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn metadata_json(&self) -> Result<String,JsValue> {
        self.metadata_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn append_shard(&mut self, source: &str) -> Result<(), JsValue> {
        self.append_shard_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn query_page(&self, query: &str) -> Result<String, JsValue> {
        self.query_impl(query).map_err(|e|JsValue::from_str(&e))
    }
    pub fn facets(&self, mode: &str, locale: &str) -> Result<String, JsValue> {
        self.facets_impl(mode,locale).map_err(|e|JsValue::from_str(&e))
    }
    pub fn progress(&self) -> Result<String, JsValue> {
        self.progress_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn item(&self, id: u64, locale: &str) -> Result<String, JsValue> {
        let index = self.ready().map_err(|e|JsValue::from_str(&e))?;
        let offset=self.lookup.get(&id).ok_or(JsValue::from_str("COLLECTION_ITEM_MISSING"))?;
        output(&self.item_json(index,&self.rows[*offset],locale_index(locale))).map_err(|e|JsValue::from_str(&e))
    }
    pub fn load_state(&mut self, source: &str) -> Result<(), JsValue> {
        self.state=parse_state(source).map_err(|e|JsValue::from_str(&e))?;
        Ok(())
    }
    pub fn state_json(&self) -> String {
        serde_json::to_string(&self.state).expect("validated state")
    }
    pub fn set_entry(&mut self, id: u64, changes: &str) -> Result<(), JsValue> {
        self.set_entry_impl(id,changes).map_err(|e|JsValue::from_str(&e))
    }
    pub fn set_bulk(&mut self, ids: &str, status: &str) -> Result<(), JsValue> {
        self.bulk_impl(ids,status).map_err(|e|JsValue::from_str(&e))
    }
    pub fn workspace_action(&mut self, action: &str, id: &str, name: &str) -> Result<(), JsValue> {
        self.workspace_impl(action,id,name).map_err(|e|JsValue::from_str(&e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_catalog_loads_and_queries_all_12552_records() {
        let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../static/ddv/collection/v1.25");
        let manifest=std::fs::read_to_string(root.join("index.json")).unwrap();
        let mut core=CollectionEngine::default();
        core.load_index_impl(&manifest).unwrap();
        let files:Vec<String>=core.index.as_ref().unwrap().shards.iter().map(|s|s.file.clone()).collect();
        for file in files {
            let bytes=std::fs::read_to_string(root.join(file)).unwrap();
            core.append_shard_impl(&bytes).unwrap();
        }
        assert_eq!(core.ready().unwrap().count,12552);
        let result=core.query_impl(r#"{"locale":"ja","search":"40005160","limit":72}"#).unwrap();
        let value:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(value["total"],1);
    }
    #[test]
    fn db00_publishable_release_switch_and_old_state_survive() {
        let item=json!({
            "id":"700000001","names":{"en":"Test Chair","ja":"テストのいす"},
            "nameStatus":"verified","category":"Furniture","subcategory":null,
            "stateClass":"TRACKED","stateSemantic":"OWNERSHIP_AND_DISCOVERY",
            "worlds":["IsDreamlightValley"],"universes":["Mickey"],
            "contentIds":["Expansion03"],"releaseIds":["expansion-3"],
            "relations":[],"sourceRefs":["approved-reference"]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":1,"items":[item]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"approved-snapshot",
            "count":1,"target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"approved-reference","visibility":"public_reference"}],
            "releases":[{"id":"expansion-3"}],
            "shards":[{"file":"items-000.json","offset":0,"count":1,"bytes":shard.len(),
                "sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_state(r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"Kept","entries":{"700000001":{"status":"owned","favorite":true},"999999999":{"quantity":12}}}]}"#).unwrap();
        engine.load_db00_index_impl(&index).unwrap();
        engine.append_db00_shard_impl(&shard).unwrap();
        engine.finish_db00_impl().unwrap();
        let filtered:Value=serde_json::from_str(&engine.query_impl(r#"{"locale":"ja","search":"テスト","category":"Furniture","world":"IsDreamlightValley","expansion":"Expansion03","limit":40}"#).unwrap()).unwrap();
        assert_eq!(filtered["total"],1);
        assert_eq!(filtered["items"][0]["label"],"テストのいす");
        assert_eq!(filtered["items"][0]["status"],"owned");
        assert_eq!(engine.state.workspaces[0].entries["999999999"].quantity,Some(12));
        let meta:Value=serde_json::from_str(&engine.metadata_impl().unwrap()).unwrap();
        assert_eq!(meta["version"],"1.26.2");
        assert_eq!(meta["worlds"][0],"IsDreamlightValley");
    }
    #[test]
    fn db00_private_or_unverified_sources_are_never_loaded() {
        let base=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"published",
            "count":1,"target":{"platform":"Steam","gameVersion":null,"buildId":null},
            "sources":[{"id":"private","visibility":"private"}],"releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":1,"bytes":400,"sha256":"a".repeat(64)}]
        });
        let mut engine=CollectionEngine::default();
        assert!(engine.load_db00_index_impl(&base.to_string()).is_err());
        let mut public=base.clone();
        public["sources"][0]["visibility"]=json!("public_reference");
        engine.load_db00_index_impl(&public.to_string()).unwrap();
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":1,"items":[{
            "id":"1","names":{},"nameStatus":"unverified","category":"Furniture",
            "sourceRefs":["private"],"releaseIds":[],"relations":[]
        }]}).to_string();
        assert!(engine.append_db00_shard_impl(&shard).is_err());
        assert_eq!(engine.rows.len(),0);
    }
    #[test]
    fn rejected_db00_shard_is_atomic_and_versionless_release_stays_unknown() {
        let first=json!({
            "id":"101","names":{"en":"Source One"},"nameStatus":"verified",
            "category":"NewFamily","stateClass":"TRACKED",
            "stateSemantic":"OWNERSHIP_AND_DISCOVERY",
            "worlds":["FirstWorld"],"universes":["FirstUniverse"],
            "contentIds":["FirstExpansion"],"releaseIds":[],
            "relations":[],"sourceRefs":["public-source"]
        });
        let mut second=first.clone();
        second["id"]=json!("102");
        second["sourceRefs"]=json!(["private-source"]);
        let invalid=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,
            "items":[first.clone(),second.clone()]}).to_string();
        second["sourceRefs"]=json!(["public-source"]);
        let mut valid=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,
            "items":[first,second]}).to_string();
        // Only the source reference changes. Preserve the original pinned
        // byte length with valid JSON whitespace to exercise retry semantics.
        while valid.len()<invalid.len() {valid.push(' ');}
        assert_eq!(valid.len(),invalid.len());
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"versionless-release","count":2,
            "target":{"platform":"Steam","gameVersion":null,"buildId":null},
            "sources":[{"id":"public-source","visibility":"public_reference"}],
            "releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":2,
                "bytes":invalid.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_db00_index_impl(&index).unwrap();
        let before=engine.index.as_ref().unwrap().clone();
        assert!(engine.append_db00_shard_impl(&invalid).is_err());
        assert!(engine.rows.is_empty());
        assert!(engine.lookup.is_empty());
        assert!(engine.db00_relations.is_empty());
        let after=engine.index.as_ref().unwrap();
        assert_eq!(after.families,before.families);
        assert_eq!(after.semantics,before.semantics);
        assert_eq!(after.state_classes,before.state_classes);
        assert_eq!(after.worlds,before.worlds);
        assert_eq!(after.universes,before.universes);
        assert_eq!(after.expansions,before.expansions);
        assert_eq!(after.world_labels,before.world_labels);
        assert_eq!(after.universe_labels,before.universe_labels);
        engine.append_db00_shard_impl(&valid).unwrap();
        engine.finish_db00_impl().unwrap();
        let metadata:Value=serde_json::from_str(&engine.metadata_impl().unwrap()).unwrap();
        assert!(metadata["version"].is_null());
        assert_eq!(metadata["platform"],"Steam");
        let result:Value=serde_json::from_str(&engine.query_impl(
            r#"{"locale":"en","category":"NewFamily","limit":10}"#
        ).unwrap()).unwrap();
        assert_eq!(result["total"],2);
    }
    #[test]
    fn canonical_categories_preserve_all_29_entries() {
        assert_eq!(CATEGORY_ORDER.len(),29);
        assert_eq!(CATEGORY_ORDER.iter().collect::<HashSet<_>>().len(),29);
    }
    #[test]
    fn legacy_state_round_trip_retains_unknown_ids_and_fields() {
        let input = r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"My Collection","entries":{"101":{"status":"owned","quantity":7,"favorite":true},"99999999":{"discovered":false}}}]}"#;
        let state=parse_state(input).unwrap();
        let text=output(&state).unwrap();
        assert!(parse_state(&text).unwrap()==state);
        assert!(text.contains("99999999"));
    }
    #[test]
    fn workspace_and_bulk_changes_are_atomic() {
        let mut engine=CollectionEngine::default();
        engine.set_entry_impl(101,r#"{"status":"owned","quantity":4,"favorite":true}"#).unwrap();
        engine.workspace_impl("add","local-2","Second").unwrap();
        engine.bulk_impl("[101,102]","missing").unwrap();
        assert_eq!(engine.state.workspaces[0].entries["101"].quantity,Some(4));
        assert_eq!(engine.state.workspaces[0].entries["101"].status.as_deref(),Some("owned"));
        assert_eq!(engine.state.workspaces[1].entries["101"].status.as_deref(),Some("missing"));
        assert!(engine.bulk_impl("[0,102]","owned").is_err());
        assert_eq!(engine.state.workspaces[1].entries["102"].status.as_deref(),Some("missing"));
        engine.bulk_impl("[101]","unknown").unwrap();
        assert!(engine.state.workspaces[1].entries.get("101").is_none());
    }
    #[test]
    fn unsafe_old_backups_are_rejected() {
        assert!(parse_state(r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"ok","entries":{"3":{"quantity":1000000}}}]}"#).is_err());
        assert!(parse_state(r#"{"schema":"wand.collection.local@1","active":"missing","workspaces":[{"id":"local-1","name":"ok","entries":{}}]}"#).is_err());
    }
    #[test]
    fn invalid_changes_do_not_mutate() {
        let mut engine=CollectionEngine::default();
        let baseline=engine.state.clone();
        assert!(engine.set_entry_impl(1,r#"{"quantity":-1}"#).is_err());
        assert!(engine.set_entry_impl(1,r#"{"status":"deleted"}"#).is_err());
        assert!(engine.state==baseline);
    }
}
