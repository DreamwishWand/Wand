# DB-05 SAVE — read-only, versioned mapping

This is a **standalone schema contract**, not a replacement for the legacy DreamwishWand/web Rust P1G Codec, Worker/SaveSession, or Writer. There is no connected production Save Editor in the current DreamwishWand/Wand main branch. Keep DB-05 independent of concurrent DB-00 and SRC-06 branches until interfaces are merged.

## Verified and unverified evidence

- data/ddv/save/registry.v1.json registers historical Switch schema 624/626 and Steam schema 626 Build **candidates** from the old Rust Core. They are not independently verified against current game builds.
- Two Switch .profile files are labelled v626/v643; labels are filename-only evidence. The inspected Switch file named profile.json contains binary data, not JSON text. Do not infer a decoded structure from its extension.
- SRC-01 contains 13,202 native Steam v1.26.2 item IDs in four item families with a SHA-256-pinned manifest. This catalog provenance does not imply save-schema compatibility.
- Historical Rust structural evidence covers GameInfo.Version, GameInfo, Player, and World only. Inventory, Chest, Wardrobe, Appearance, Quest, Grid and World placement remain unresolved.
- All rights, ownership, Writer and export authorizations stay false. Unknown fields MUST be preserved using the original bytes, not by reconstructing a JSON object.


## Historical schema 626 field map (66 paths)

`data/ddv/save/legacy626-fields.v1.json` captures **66 source-code-supported field path candidates**, not a decoded-current-save survey. Every record is version 626 scoped, lists exact legacy build candidate(s), includes an original Rust file provenance, and sets `observedStatus=legacy_source_code_only` and `writable=false`. The mapping is also exported by `getLegacySaveFields()` in JS/TypeScript and `legacy_fields()` in Rust. Domains:

- Inventory: `Player.ListInventories` route IDs, `CompatibleItemType`, item IDs, `Amount`.
- Chest: `Player.ContainerInventories`, `BelongsToPlayer`, `ParentItemID`, `Size`, indexed slots, `ItemID`, `Amount` (source-backed Steam626 and exact scoped Switch626 paths; no generic Writer grant).
- Collection: `Player.CollectionSets`, `CollectionDefinitionID`, `GroupData`, `GroupsCollectionItems` and saved `State`.
- World: `World.GridCollection.DiffGrids`, grid IDs, default layout references, saved modified/removed objects (legacy Steam 626 only).

- Appearance: `Player.AvatarIsMale`, male/female avatar, hair colors, saved clothing slots, incompatible clothes, makeup, eyeball and customization map. These are old scoped readset candidates, not generalized editing or proof of rights.

17 historical ID-reference positions are annotated in the field map: 14 candidate Item ID positions with `catalog=DB-01`, plus CollectionDefinition, Grid and World Object IDs with **no catalog alignment**. The adapter exposes `getLegacySaveIdReferences(namespace?)`; Rust exposes the nested `LegacyIdReference` type. Every reference has `join=exact_numeric_only`, `currentCatalogCoverageVerified=false`. A saved grid ID is **not** automatically a DB-04 World ID; a Collection Definition is **not** a DB-03 Quest ID. No reference closure is claimed.

The existing Rust source scopes and limits remain authoritative for their own historical operations. The DB does not infer Item/Quest/World ID coverage, award eligibility or ownership, and does not relax the existing Writer permissions.

## Source integration

The JS/TypeScript adapter at src/lib/save/registry.mjs exports matchSaveBuild, inspectDecodedSave, borrowUntouchedDecodedSave, makeGameIdIndex, matchGameId and diffSaveWitnesses. The declarations are in registry.d.ts. The adapter consumes **strictly decoded** documents only; it is not a Codec.

The isolated Rust/WASM-compatible crate at crates/ddv-save-schema exposes typed BuildCandidate, DeclaredBuild, ReadOnlyAssessment and inspect_decoded. It borrows the decoded JSON object after legacy strict validation; there is no parser, decryption, SaveSession, Writer, save serialization or feature flag that would grant edits. Cargo verification command:

    cargo test --manifest-path crates/ddv-save-schema/Cargo.toml

Both JSON registries are recursively immutable when loaded by the JS adapter. The database never authorizes writes. A positive shape witness is neither a strict Codec proof nor an external Build proof.

## Compatibility policy — decoded structure first

**Ignore platform, game-version and Build-ID differences when classifying save-data structure.** Retain those identifiers only as provenance and historical regression evidence. A save's `GameInfo.Version` value is also observed metadata, not an equality gate. The Codec (outside DB-05) must still strictly decode the original save, and no shape observation alone authorizes writing.

`probeSaveStructure(decoded)` checks 66 known historical path candidates in five independently assessed domains: inventory, chests, collection, grids and appearance. It reports observed path counts, explicit type conflicts, missing/untested domains and bounded sampling. Missing optional fields are **not** treated as incompatible; conflicts in actually observed paths yield `shape_conflict`. The result is only `shape_candidate` or `sampled_candidate`, never an asserted full compatibility or Codec guarantee. Historical `builds` arrays document source evidence, not per-platform reader enablement.

`inspectDecodedSave(decoded, optionalBuild)` checks the required structural root (`GameInfo.Version` as unsigned integer, `Player` and `World` objects). It reports optional historical Build metadata without rejecting unregistered builds, newer save schema numbers or different platforms. The original object stays untouched. Decode/round-trip proof and Writer permission remain external.

`src/lib/save/db00-join.mjs` accepts any **validated DB-00 `wand.game-db.snapshot@1`** plus a decoded Save passing the root structure check. Its exact positive decimal Item-ID join intentionally does **not** compare catalog platform, release version or Build ID to the save. Missing IDs in a partial catalog remain `unresolved_in_partial_catalog`; an ID absent from a complete snapshot is `not_in_catalog_snapshot`. A catalog match does not imply historical availability, current native validity, entitlement, Save Codec safety or Writer authorization.

Keep DB-00's provenance/version fields for catalog accuracy, but never use them as hard gates for structural Save compatibility. Use explicit structural mismatch and external Codec/Writer safety checks as separate concerns.

## Read-only private SRC-06 handoff

Use only the private redacted SRC-06 save-structure.json, never a personal raw save. Run:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --out /private/new-db05-run

Optional SHA-pinned SRC-01 manifest verification and cross-version root witness diff:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --previous /private/old-save-structure.json --items /private/src01/items.jsonl --items-manifest /private/src01/manifest.json --out /private/new-db05-run

The output db05-private-summary.json is private. Store it in an owner-private Drive folder after review. The utility now recognizes the four legacy root fields plus 66 published Rust-source legacy schema-626 field paths, mapping numeric dictionary keys to their canonical placeholders (for example, /{id} to /{containerId}). It never emits the original dictionary key values, unknown field names, or other unrecognized paths; those are counted only. A cross-version comparison reports **observed witness differences**, not proof of native schema migration or deletion; SRC-06 scanner redaction, array/map coverage and player-specific structures can affect observed paths. Source save files are never modified.

## Synthetic tests

    node --test tests/save-schema.test.mjs
    python -m unittest discover -s tools/db-05-save -p 'test_*.py' -v

Real decoded-save validation, Rust compilation and production integration are separate, currently unverified gates.

## Remaining work (not silently authorized)

1. SRC-06 actual strictly decoded, redacted witnesses with exact Build provenance; never publish private save content.
2. Codec boundary for duplicate keys, UTF-8 and versioned Build admission.
3. DB-01/03/04 exact Item/Quest/World save reference path evidence, with an explicit source version; no heuristic ID remapping.
4. Deep inventory, chests, ownership, quantity, wardrobe, appearance, progress, placement and version-diff field maps.
5. Lossless unknown-field byte preservation and genuine fixture contract regression before any Writer feature can separately be admitted.

## Structural comparison — DB-05 read-only candidate witness

`compareSaveStructures(previous, current)` compares two decoded in-memory save objects. It **does not** compare Switch/Steam identifiers, Build IDs, `GameInfo.Version` values, item quantities, names, or other scalar save values.

The comparison returns `wand.db05.save-structure-comparison@1` with per-domain classifications: `same_known_field_shape`, `observed_shape_drift`, `structural_conflict`, `insufficient_evidence`, or `sampled_inconclusive`. The overall result may be `invalid_root` or `inconclusive`. Observed fields and differences contain only **public historical field templates and JSON type names**, never map-key identifiers, user-defined field names or save values.

All structural candidates are bounded to 66 **historical** Rust-backed field definitions. Missing optional fields are not automatically conflicts; malformed observed nested containers and JSON type changes are. Arrays/maps beyond the sampling limit yield inconclusive evidence, never full compatibility assertions. If two saves share the same known shape, they may still differ in unrecognized/new fields, Codec layout, DLC rights or required Writer semantics. Consequently these results are **read-only diagnostics**, not permission to re-encode, export or overwrite a save.

Example:
```js
import { compareSaveStructures } from './src/lib/save/registry.mjs';
// Inputs must already be decoded by an independently validated Codec:
const diagnostic = compareSaveStructures(decodedBefore, decodedAfter);
if (diagnostic.status === 'structural_conflict') {
  // Use the per-domain conflictingKnownPaths in a non-sensitive diagnostic.
}
```

## SRC-06 private redacted witness bridge

The DB-05 ingest tool produces **private** `wand.db05.ingest@1` summaries with known public path templates and redacted `publicWitnesses` types. The new `src/lib/save/redacted-witness.mjs` compares two such summaries, without requiring raw save bytes or handing private source data to the browser:

```js
import { compareRedactedSaveWitnesses } from './src/lib/save/redacted-witness.mjs';
const diagnostic = compareRedactedSaveWitnesses(privateSummaryA, privateSummaryB);
```

It accepts only the sanitized DB-05 ingest envelope, rejects unknown field paths, unsanitized numeric map keys, duplicate fields, invalid JSON type labels and raw SRC-06 scanner reports. It never serializes user values, unknown field names or source paths. Game version, Build ID and platform are **not compatibility gates**. It classifies observed type conflicts, additional/omitted known witnesses, numeric-kind ambiguity and insufficient coverage independently by domain.

A private local CLI consumes **only the two redacted ingest reports** and writes a new JSON report in a private directory. For Windows PowerShell, once genuine strictly decoded structural evidence exists, a typical sequence is:

```powershell
py -3 tools/db-05-save/ingest.py --structure "C:\\Private\\src06-old\\save-structure.json" --out "$env:LOCALAPPDATA\\WandDb05\\old"
py -3 tools/db-05-save/ingest.py --structure "C:\\Private\\src06-new\\save-structure.json" --out "$env:LOCALAPPDATA\\WandDb05\\new"
node tools/db-05-save/compare.mjs --previous "$env:LOCALAPPDATA\\WandDb05\\old\\db05-private-summary.json" --current "$env:LOCALAPPDATA\\WandDb05\\new\\db05-private-summary.json" --out "$env:LOCALAPPDATA\\WandDb05\\comparison.json"
```

The `--out` file must not already exist; output within a Git repository is rejected, and no input is modified. Keep all reports private because even redacted structural witnesses can be sensitive. The current SRC-06 Drive output folder has no actual reports, so **no real Steam 1.26.2 or Switch 643 structural compatibility conclusion is made** by this code. Ingest evidence is from a lexical scanner, not the strict Rust Codec. Thus `authoritative=false`, `complete=false`, and all Writer, ownership mutation, export and original-overwrite authorizations remain false.

## Read-only structural findings from original 626/643 saves (2026-11-21)

The owner supplied an updated encrypted Steam profile, and the existing P1G
interoperability algorithm decrypted it locally as a ZIP archive containing
one `profile` JSON entry. The decoded `GameInfo.Version` is 643. Two
separately retained, plaintext Switch-origin saves report schema 626 and 643.
Neither platform is used as a structural compatibility gate.

A local, read-only exhaustive walk of the **66 public historical path
templates** found their observed JSON type sets consistent across the three
originals except for a previously incorrect historical DB-05 type
restriction on the *known* chest path
`/Player/ContainerInventories/{containerId}/ParentItemID`.
All three originals contain both JSON `integer` and `null` at that known
path. Its allowed candidate kind is therefore `integer|null`.
`null` never becomes a valid catalog Item ID or ownership proof.
One pre-existing appearance path was present in a Steam 643 sample but
not observed in the other originals; absence is not proof of incompatibility.

This is local private-save **shape evidence only**, not a proof of Codec
round-trip, unknown/new field preservation, complete schema closure, or
Writer authorization. Personal saves, raw JSON, user identifiers,
envelope hashes, and private structural reports must remain outside Git.
Only this historical **public field definition** and synthetic tests are
committed.

## 16 additional common fields, observed across private 626/643 originals

`data/ddv/save/common626643-fields.v1.json` supplements (does not replace) the
existing 66-path historical registry. Exactly **16 public-name fields** were
located in past Wand source code and their JSON types were observed in each of
three owner-private save originals: one schema 626 and two schema 643.

Domains: world (6), progression (7), cosmetics (3). Examples:
`/World/Characters` (array), `/World/Characters[]/SkinID` (integer),
`/World/QuestInfo/MissionsCompleted` (array), `/Player/AchievementsData`
(array), `/Player/BattlePassStates` (object), `/World/Realms` (object).
No user-save values, map keys, names, raw JSON, or original bytes are
embedded in the registry or committed to GitHub.

The source field names originate from historical public Wand
`steam626-native-fields.mjs` and `progression-reference-index-v125`
sources, **not from a newly verified game-native C# type mapping**. Actual
types were independently observed from the 626/643 save originals. This is
observational schema evidence only; it does not establish entitlement,
availability, editable ownership, Codec round-trip or Writer safety.

`getCommonSaveFields()`, `probeCommonSaveStructure(decoded)` and
`compareCommonSaveStructures(before,after)` expose read-only structural
witnesses without comparing platform or version labels. Large arrays are
sampled and do not yield exhaustive proof. Existing `probeSaveStructure`
and `compareSaveStructures` continue operating on the historical 66 paths,
preserving compatibility with established callers.

The SRC-06 -> DB-05 private `ingest.py` allowlist now includes the extra
16 templates, so these names survive redaction while all unrecognized and
numeric-key paths remain redacted. `compareRedactedSaveWitnesses` now returns
8 independently judged domains (five historical, plus world, progression,
cosmetics). New domains that are unobserved remain inconclusive, not a false
structural equivalence. All upstream reports remain private, and all
authorizations remain false.

## Native-source typed save witnesses — 85 additional direct fields

`data/ddv/save/native1261-observed-fields.v1.json` records **85 distinct,
publicly named, direct Protobuf fields** from `Profile` (13), `ProfilePlayer`
(35), and `ProfileWorld` (37). For each field it retains the class name,
Protobuf field number, native C# property type, and observed JSON kind.
These are **additional to** the legacy 66 and common 16 fields: total 167
nonoverlapping, read-only field templates.

**Native source:** the owner's Game Source Archive, Steam v1.26.1
`Il2CppDump/dump.cs` (SHA-256 pinned in the manifest). The snapshot is
not the currently running Steam v1.26.2 binary, and this manifest never
claims that the v1.26.1 dump attests the exact current native build.
**Save observations:** three separate owner-private originals (one
`GameInfo.Version=626`, two `GameInfo.Version=643`) each contained
these 85 direct fields with JSON kinds consistent with the v1.26.1
native property types. Platform labels and version numbers do not gate
structural matching.

Examples include inventory ID counters, currency map *shape*, equipment,
crafting, outfit/decoration presets, pets, world buildings, villages,
recurring events and weather. The registry excludes private save values,
names, numeric map keys, entitlement contents, and all raw game-file bytes.
It records no ownership grants or mutation permissions.

Read-only APIs: `getNativeSaveFields()`,
`probeNativeSaveStructure(decoded)`,
`compareNativeSaveStructures(previous,current)`. Reports only public
field templates, observed JSON kinds, drift/conflict/uncertainty and
explicit `writerAuthorized=false`; no Codec, Writer or export authority.

The SRC-06 → DB-05 private witness allowlist now comprises 167 known
field templates plus four root path templates. This enables non-sensitive
type differences from future updates to be compared without publishing
the underlying save. The redacted comparator now returns ten named
diagnostic domains (including `profile` and `player`). No private
report is checked into the repository.

For a new game update, validate the previously confirmed types against
a **locally available** native dump, without requesting private-save
reuploads:

```bash
python tools/db-05-save/verify_native_dump.py --dump /private/source/Il2CppDump/dump.cs
```

The default requires the exact SHA-256 pinned in the v1.26.1 manifest.
A different game-source version is explicitly opt-in for *comparison only*:

```bash
python tools/db-05-save/verify_native_dump.py --dump /private/new-version/dump.cs --allow-new-source
```

A changed or missing native field number/property type is reported as
a review-required mismatch. Even 85/85 matching fields in a new native
dump cannot automatically verify Codec round-trip, references, new
fields, current-build attestation or Writer safety. Raw private saves
must remain outside Git, and this verifier accepts **no save input**.

## Native v1.26.1 nested Protobuf field witnesses (58 new public paths)

`data/ddv/save/native1261-nested-fields.v1.json` records **58 unique
nested paths** whose names, direct parent Protobuf message classes,
field numbers and C# property types originate from the SHA-256-pinned
Steam **v1.26.1** `Il2CppDump/dump.cs`. These nested paths were
observed in each of the three separate owner-private 626/643 save
originals. Three other candidate paths already belonged to the prior
66-field registry and were **excluded rather than counted twice**.
Thus 66 historical + 16 common + 85 direct native + 58 nested native
= **225 distinct known public field templates**.

The nested groups cover pet relationships and nullable timestamps,
cookbook favorites, tools, Royal Duties, backpack overflow, fast travel,
villages, houses, decoration presets, floating islands, building
metadata, critters and grid structures. Non-public map keys and personal
values are never stored. For example, `/World/FloatingIslands/{id}/Unlocked`
is a public template, while a path containing an actual numeric island ID
is rejected by the public comparison API. The private SRC-06 importer
normalizes that ID to the known template before a report can be used.

`observedJsonKinds` contains only actual JSON *type names* from these
three owner-private save originals. Some timestamps were observed as
`null` or `string`; `Village.AccessibilityConditions` was
`null` or `object`. A decoration-preset `ShareInfo` field was
`null` in all three saves. Although native metadata identifies its
message type, a non-null `ShareInfo` object was **not observed**, so
the registry does not claim its child structure is validated.
`allowedJsonKinds` records this limited nullable candidate separately.

New read-only functions `getNestedSaveFields()`,
`probeNestedSaveStructure(decoded)`, and
`compareNestedSaveStructures(a,b)` identify known shape observations,
missing witnesses, type conflicts, and harmless nullable-kind drift.
The latter is reported as `changedKindPaths` with
`observed_witness_difference`, **not** as a proved incompatibility.
As with all other DB-05 probes, large repeated fields/maps are sampled,
the source build is v1.26.1 rather than the current v1.26.2 game
binary, and Writer/export authority remains permanently **false**.

The source-verification tool also supports validating all nested native
field tags and property types:

```bash
python tools/db-05-save/verify_native_dump.py --dump /private/Il2CppDump/dump.cs --nested
```

For a different native game-source version, add
`--allow-new-source` for **comparison only**. The verifier uses
streaming input, emits public field names and counts only, requires the
exact pinned digest by default, and does not read a save file.

## Deeper native field witnesses and one-pass cross-domain shape comparison

`data/ddv/save/native1261-deep-fields.v1.json` contains 83 **new,
non-duplicated** public nested JSON path/type witnesses. They were selected
from 98 candidates obtained from the SHA-256-pinned Steam **v1.26.1**
IL2CPP `dump.cs` and independently observed in all three private
Steam/console original saves (one schema 626, two schema 643).
**15 candidates overlapped existing templates after normalizing public
map placeholders**, so they were not added twice.

The 83 new templates cover chest item `State`, inventory furniture
restrictions and markers, world grids and per-grid object `ItemID`,
position, orientation and nullable state, room and wallpaper metadata,
village areas, character friendship data, favorite gifts, restaurant
orders, store displays, cooking history and tool upgrades.
The full DB-05 read-only coverage now comprises:
66 historical + 16 common + 85 direct native + 58 nested native +
83 deeper native = **308 distinct known public path templates**.
They do **not** imply 308 complete native fields or full save-schema
closure; they are independently observed *candidate* field paths.

For each new path, `nativeMessage`, `protobufFieldNumber`,
`nativePropertyType`, and allowed/observed *JSON type names* are
recorded. The source build remains **v1.26.1** (not a newly verified
v1.26.2 native dump), and the originals remain entirely private.
No private user IDs, map keys, raw decoded JSON, file hashes or personal
save values are committed.

`getUnifiedSaveShapeCatalog()`, `probeUnifiedSaveStructure(decoded)`,
and `compareUnifiedSaveStructures(before, after)` provide a public
**cross-domain** shape-only diagnostic over all 308 templates. Domains
include inventory, chests, collection, grids, appearance, world, player,
progression, cosmetics and profile. Reports distinguish:
`same_observed_witnesses` (same known *observed* subset, **not**
full compatibility), `observed_witness_difference`,
`observed_type_conflict`, `inconclusive` (sampled or absent domains),
and `invalid_root`. A change between two separately permitted JSON
types (e.g., `null` ↔ `string` for `LastGiftDate`) appears in
`changedKindPaths`, not in `conflictingKnownPaths`. Unknown fields
are not dropped from the **input save** (the diagnostic does not mutate
or re-encode anything), but their names/values never enter the report.

The existing private `ingest.py` and JS redacted witness comparator
now recognize these **83 additional public templates**. Numeric user
map keys are normalized privately to `{id}` only when the resulting
template is allowlisted, otherwise dropped. The private raw report,
personal saves and decoded data never belong in Git.

To verify native source fields without loading any save, run locally:

```bash
python tools/db-05-save/verify_native_dump.py --dump /private/v1.26.1/Il2CppDump/dump.cs --deep
```

For a *different* native source version, add
`--allow-new-source` for a **review-required comparison only**. An
exact SHA-256 match on its own does not demonstrate a Writer/Codec
round-trip, new game build identity, unknown field preservation or safe
ownership editing. All write and export authorization remains **false**.

## Steam v1.26.2 archived IL2CPP source identity (2026-11-21)

The owner-held **Steam v1.26.2** Game Source Archive contains
`Il2CppDump/dump.cs` (89,453,137 bytes). Its complete file SHA-256 is
`0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`.
The separately archived **Steam v1.26.1** IL2CPP dump has exactly the
same full-file digest, not merely the same byte count. This observation
is recorded in `data/ddv/save/native1262-dump-equivalence.v1.json`.
It means **the two archived dump.cs files are byte-identical**. It
does **not** establish that executable binaries, GameAssembly.dll,
global-metadata.dat, every game asset, or encrypted save Codec/Writer
behavior are unchanged.

This content identity connects the 85 direct + 58 nested + 83 deep
= **226** source-pinned public Protobuf field templates to the archived
v1.26.2 `dump.cs`, while leaving the historical/common **82** templates
in their distinct evidence classes. There is no claim of whole-game
binary equality, exhaustive native schema coverage, save ownership,
Codec round-trip, or Writer safety.

Repeat the digest and all 226 field-number/native-C#-type checks on a
local, private copy of the game source:

```bash
python tools/db-05-save/verify_source_equivalence.py --candidate /private/v1.26.2/Il2CppDump/dump.cs --baseline /private/v1.26.1/Il2CppDump/dump.cs
```

Without `--baseline`, only the candidate's pinned SHA-256 and public
field contracts can be verified; the receipt explicitly marks the
baseline copy **not checked**. If a future source changes, normal
verification stops. Use `--source-changed-review` to compare public
field tags/types as a **review-only** diagnostic; even when 226/226
known types match, changed source content is still classified
`review_required`. No actual save is read by this command.

## Private automatic nested schema discovery for future updates

`tools/db-05-save/discover_native_shapes.py` is a **local, read-only**
Protobuf shape discovery tool. Its inputs are a native IL2CPP
`dump.cs` and two or more **already decoded, owner-private** JSON
profiles supplied through the private decoder workflow. It traverses
the source-defined Protobuf message graph (repeated fields and maps),
checks observed JSON types across all supplied samples, and excludes
known 308 templates. Actual map keys are replaced with public
`{id}` placeholders **in memory**. Potentially sensitive
purchase/account/entitlement path families are excluded. No raw
values, user IDs, filenames, private map keys, or decoded save
documents are serialized into the output.

Example (private files and output must remain outside the Git checkout):

```bash
python tools/db-05-save/discover_native_shapes.py --dump /private/source/dump.cs --decoded-json /private/save-a.json --decoded-json /private/save-b.json --decoded-json /private/save-c.json --out /private/new-discovery.json
```

The report is deliberately marked `safeForPublicRepository=false`
and `ownerReviewRequiredBeforeRegistryPromotion=true`. It lists
only source-named candidate paths, source class/Protobuf tag/property
type, the **observed JSON kind names**, and sampling flags. By default
it traverses at most seven message levels and samples up to 32
entries per repeated field/map, so its discoveries are **not**
exhaustive. Sampling and lack of observed subobjects must not be
interpreted as verified absence, compatibility, or permission to edit.

The private proof-of-concept run over the three available 626/643
originals found **1,202 source-defined, observed field paths** at
depth seven before deduplication and review; 385 of those paths were
sampled at least once under the proof-of-concept's 64-entry limit.
These counts are exploratory, not 1,202 approved registry entries.
Do **not** commit that private output. Synthetic Python CI tests
cover determinism of output contents, redaction, map placeholders,
known-path deduplication, sampling, and refusal to write inside Git.

## Steam v1.26.2 archive: 132 additional domain-specific save witnesses

`data/ddv/save/native1262-domain-fields.v1.json` registers **132 new
public JSON path templates** from the owner-provided, SHA-256-pinned
Steam **v1.26.2 archived IL2CPP `dump.cs`** and the three owner-private
Steam/Switch original saves (schemas 643/643/626). The two archived
1.26.1/1.26.2 source dumps are byte-identical; executable/Codec
identity is *not* claimed. The 132 were manually screened from
**138** native-source-defined, observed candidates, with **six
overlaps** rejected against all five pre-existing registries. There
are now **440 unique public DB-05 field templates** (66 + 16 + 85
+ 58 + 83 + 132).

The additions cover inventory meal-state substructures; achievements,
collection sets, mount customization; house floors, rooms and
wallpaper settings; village rocks and unlock prerequisites; grid
object storage and farming states; and active mission-slot progression.
`observedJsonKinds` reports JSON **type names**, never original values.
Ten fields observed only as `null` have `allowedJsonKinds` expanded using the native nullable/message type (`Nullable<int>`, `Nullable<bool>`, `Timestamp`, or `MultiReward`) as an explicitly **unobserved but plausible** non-null shape. Their `observedJsonKinds` remain strictly `["null"]`; no non-null child structure is asserted.\n\nFor **77 of the 132** new fields, at least one observation used bounded
wildcard sampling. These findings are read-only shape *candidates*,
not a complete survey of every item/object in all saves. Even
`observedJsonKinds: ["null"]` is not evidence of a non-null message
shape. Personal names, player IDs, map keys, raw save JSON and any
decrypted or encrypted save bytes are never included in the public
registry.

`getDomainSaveFields()` returns this frozen catalog. Existing
`probeUnifiedSaveStructure` and `compareUnifiedSaveStructures`
now cover all **440** known public templates, without introducing
version/platform compatibility gates or any Writer/export permission.
The private SRC-06 ingest and redacted witness comparator accept only
the 132 new exact templates in addition to pre-existing allowlisted
paths, and reject actual map identifiers.

The new **read-only** native-source verification command validates
Protobuf *parent and child message chains*, including repeated
fields and map value classes, and checks all 132 direct field
numbers and native C# types:

```bash
python tools/db-05-save/verify_domain_native_fields.py --dump /private/v1.26.2/Il2CppDump/dump.cs
```

It hashes the complete file and fails on unexpected source bytes.
`--source-changed-review` is an explicit **review-only** comparison
mode for future game updates. Its output contains *only* approved
public templates and type/tag comparison status. An arbitrary map
key or private path is rejected; private saves are **not** inputs.

Neither a matching type nor a synthetically passing structure
authorizes save encoding, mutations, DLC ownership, purchases,
entitlements, or exporting a modified save. Writer safety and
unknown-field preserving round trips must be separately proven.

## Read-only internal save reference graph (DB-05)

`data/ddv/save/reference-relations.v1.json` defines **14 public
native-source-backed reference rules** connecting existing 440 field
templates. The rules include:

- Map-key ↔ embedded `ID` checks for player containers, full grids,
  diff grids, full-grid objects and diff modified objects;
- Full/diff grid object `State.Storage.ContainerInventoryID` →
  `Player.ContainerInventories` map keys;
- Full/diff grid object `State.SubGrid.GridID` → observed full/diff
  grid keys;
- House room floor and wall grids, building grid lists, village area
  grids and floating-island grids → observed full/diff grid keys.

The owner-private Steam schema 643, Switch schema 643, and Switch
schema 626 originals were inspected **locally** for the relevant
candidate links, without uploading extracted personal IDs or counts.
On those three originals, the checked container/grid/object map keys
matched their embedded IDs, and the sampled storage, subgrid, room,
building, village and island grid references were resolvable inside
the same decoded save. This is *observational evidence*, not proof
that every save, future version or partial profile satisfies
complete reference closure.

`probeSaveReferences(decoded)` accepts one already-decoded save
**in memory**; `compareSaveReferenceProbes(old, new)` compares
privacy-redacted numeric counters between two decoded saves.
`getSaveReferenceRelations()` exposes the frozen, versioned
public rule contract. All are exported from
`src/lib/save/registry.mjs` and implemented in
`src/lib/save/references.mjs`.

Each rule returns its **public path template**, mode
(`id_matches_map_key` or `ref_exists`), observed/resolved/
unresolved/missing/malformed/type-issue counts and a sampled flag.
Raw map keys, object identifiers, save values and generated paths
with actual IDs never appear. A mismatch returns
`observed_anomaly`, which is **not** a finding that the save is
corrupt; absent target indexes return `insufficient_evidence`,
not a false missing-reference alert. If a repeated field/map is
larger than a bounded scan permits, its status becomes
`sampled_inconclusive`. A `0` grid ID can be a valid map
key; no blanket zero-as-null rule is applied.

The two-save comparison deliberately uses **counts and statuses
only**. A different but still resolvable ID with unchanged counts
will not be detected; `same_observed_counts` is *not* proof of
identity or semantic equivalence. The probe does not mutate its
input or consult external DB-01 item catalogs or DB-04 world
registries. No game version/platform compatibility gate,
ownership permission, cross-catalog completeness claim,
Codec validation, Writer or export capability is granted:
`referenceClosureVerified=false`,
`writerAuthorized=false`, `exportAuthorized=false`.

The GitHub CI runs only synthetic reference fixtures, including
valid zero IDs, broken storage links, missing container indexes,
private malformed map keys, duplicate or mismatched object IDs,
large-map sampling and comparison ambiguity. Private decoded
saves remain entirely outside the Git repository.

## DB-05 → DB-01/DB-04 private read-only catalog link

`data/ddv/save/catalog-link-rules.v1.json` defines **eight** public
candidate references already grounded in the 440 known DB-05 fields.
`src/lib/save/catalog-links.mjs` exposes
`createSaveSourceCatalogBridge(db01,db04)`. The injected `db01`
must be the existing **private** DB-01 v2 lazy catalog client (or an
equivalent interface with the same source contract); `db04`
must be the existing **partial** `createWorldCatalog(...)` output.
No new catalog or client loader is created here, and **no private
DB-01 shard files, native sources, user saves or game assets**
are copied to the public repository.

The eight candidate families are chest slots, ListInventory item
map keys, CollectionSet item map keys, placed grid object ItemID,
diff-grid modified-object ItemID, mount ItemID, village SceneItemId,
and save GridDataPath. All item lookups are **exact positive integer
IDs** using `db01.getItem(id)`, which preserves the existing
SHA-256-verified lazy ID-bucket semantics. DB-04 lookups use its
separate `objects` or `scenes` maps for those native identifiers.
Crucially, **DB-04 `grids` are keyed by source paths** such as
`GridData/Villages/Meadow.json`, *not* the save's numeric Grid.ID.
Only the save's exact `GridDataPath` may be compared to that key.
No path coercion, filename matching or numeric grid ID equivalence
is inferred.

Two deliberately different APIs are provided:

- `bridge.lookupItem(id)`: an **explicit local caller-only**
  retrieval of the partial DB-01 item definition and partial DB-04
  world object, returning a candidate classification. This output
  includes the explicitly requested item ID and source records.
  It must not be logged as a public save audit.
- `await bridge.auditSave(decoded, limits?)`: scans the decoded
  profile **in memory** and returns only fixed public path templates,
  observed/matched/unresolved/malformed/sampled counters and source
  version labels. It never emits private map keys, numerical save IDs,
  grid source path values, item names or user data. Lookups are bounded
  to 256 references per family and 128 distinct DB-01 IDs; extra
  observations are marked inconclusive, not interpreted as absent.

A missing ID is `unresolvedInPartialCatalog`, **not** evidence
that the item is nonexistent, unowned, invalid, unavailable, or that
the save is corrupt. An item returned as
`definition_unclassified` is not silently promoted to an
`item` domain. Zero-valued item references are reported as possible
empty sentinels without producing a DB-01 lookup. Missing paths,
malformed references, and truncated lookups remain separately visible.

**Source provenance limit:** DB-01 is currently a Steam **1.26.2**
partial private catalog; DB-04 is primarily from the **1.26.1**
native world archive, although a consumer can supply any verified
partial DB-04 source in future. Matching a numeric item ID or the
textual version label across these catalogs proves neither a common
source lineage nor an identical save schema. The bridge records
`sourceVersionLabelsEqual` and
`sourceAndSaveJointlyVerified=false`, but never upgrades either
catalog to joint-authoritative status. It does not enforce game
version/platform labels as save shape gates.

Neither the cross-catalog lookup nor a report with all candidate IDs
matched establishes ownership, DLC entitlement, verified collision/
placement, actual save reference closure, byte-exact game build
equivalence, Writer safety, or export authorization. All such
permissions remain **false**, and all catalogs remain partial.
The GitHub CI uses only synthetic saves and synthetic DB-01/DB-04
catalog providers; no owner-private source is committed.

## Browser developer diagnostics (unlinked; decoded JSON only)

`/save/diagnostics/` provides an **unlinked developer-only page**
for a **locally selected, already-decoded** DDV save JSON.
`src/lib/save/SaveDiagnosticsPanel.svelte` is the reusable UI
component; it accepts a decoded document plus an **optional**
existing private `SaveSourceCatalogBridge`. The page is not
listed in the normal navigation, has a `noindex,nofollow` meta
tag, and is **not presented as the final Save Editor**.

- The file picker now accepts both **encrypted P1G `.profile` / `.dat` / `.bin` (≤32 MiB)** and **previously decoded `.json` (≤128 MiB)**. All file bytes are transferred to a one-shot dedicated browser Worker (not cloned). The Worker wipes its transferred bytes, decodes and parses the content privately, and returns only allowlisted anonymous counts. The page keeps no decoded profile object, ciphertext, or JSON text. Nothing is written to a server, URL, IndexedDB, `localStorage`, telemetry, download, or Git. Clicking "読み込み内容を破棄" terminates an in-flight Worker and clears its result.
- `makeSaveDiagnosticView()` shows the **440** public known
  structure templates, structural domain coverage and the
  **14** internal save reference rules. It exposes only
  public rule labels, counts and inconclusive flags, never
  raw IDs, map keys, source paths or private values.
- `makeSaveCatalogAuditView()` can present the existing
  **eight** DB-01/DB-04 reference families if a caller has
  *separately* obtained a verified private DB-01 catalog client
  and a partial DB-04 world catalog. Without that dependency,
  the button is disabled. The page never silently loads,
  publishes or embeds private DB-01/DB-04 data.
- All parsing and client loading error messages are fixed,
  non-sensitive strings and do not interpolate arbitrary
  private file names, raw parser snippets, object keys, or
  thrown source exceptions. Browser UI code is tested with
  synthetic 626/643 documents.

The developer page now **does accept** encrypted P1G using the **existing JavaScript Collection read-only decoder** (`src/lib/collection/private-p1g-codec.js`) reused from the already shipped saved-store Worker. This is **not** the proposed Rust/WASM save Codec/Writer, and save encoding or export remains unavailable. The separate production Codec/WASM decoder and
unknown-field-preserving Writer remain necessary for the full
Save Editor; this route is a diagnostics integration seam,
not a replacement or a read-only public release. It also
does **not** infer account, DLC, ownership, completeness,
placement or export permission.

**DB-04 source update status (2026-11-21)**: The accessible
`SRC-05 WORLD DATA` Drive folder contains two Steam
v1.26.1 partial/native preview ZIPs, and the Steam
v1.26.2 `Updates` folder inspected in Game Source Archive
had no files. A verified v1.26.2 DB-04 world bundle was
not available in the checked folders. Identical IL2CPP
`dump.cs` across 1.26.1/1.26.2 does not substitute for
1.26.2 world assets or a trusted source ledger.


## P1G Worker-backed DB-05 diagnostics integration

`src/lib/save/save-diagnostics-worker-core.mjs` reuses the
**existing local read-only** Collection P1G codec and the
strict, duplicate-key/unsafe-integer-rejecting JSON parser.
`src/lib/save/save-diagnostics.worker.mjs` accepts only the
one-shot command `inspect-local-save-diagnostics` with a
transferred `Uint8Array` and a fixed `json` or `p1g` format.
The Worker returns a `save-diagnostics-summary` object with
the **440 public structural templates**, **14 internal
reference rules**, observed counts, and only fixed public
labels. No raw JSON, profile ciphertext, private map keys,
ID values, names, account fields or arbitrary errors cross
the Worker boundary.

The main-thread `sanitizeSaveDiagnosticView()` verifies the
exact result contract and rebuilds the display model from
locally declared rule IDs and domain names. It rejects unknown
IDs, duplicate rows, malformed counters, unexpected types,
and any attempt to grant Writer/export permissions. The
component `SaveDiagnosticsPanel.svelte` accepts this
pre-sanitized `report`; the old `decoded` prop remains
available for explicitly trusted internal callers only.
The optional DB-01/DB-04 in-memory catalog bridge is not
injected into the public worker route; that control remains
disabled until a separately verified private source
integration is provided.

Both encrypted and unencrypted file inputs are decoded
within the Worker. The main thread retains only the
anonymous result and references to the one-shot Worker
while it is active; the Worker wipes the original byte
buffer and exits. User cancellation terminates that
Worker. Errors are sanitized to fixed Japanese text,
not underlying keys, file names or decoder exceptions.

The P1G path is validated by synthetic Node AES-256/ZIP
test inputs for schema 626 and 643. The same tests cover
duplicate JSON keys, out-of-range integers, ciphertext
alignment, Worker privacy, corrupted data, report ID
forgery, and source data redaction. No actual private
save is used in public CI. Success authorizes read-only
diagnostics **only**; it does not prove byte-for-byte
re-encoding, unmodified unknown-field preservation,
ownership/entitlements, or safe editing.

## Native Rust reference graph and WASM build (read-only, 2026-11-21)

`crates/ddv-save-schema/src/reference_graph.rs` now uses the *same
versioned* public `data/ddv/save/reference-relations.v1.json`
manifest as `src/lib/save/references.mjs`. Its function
`inspect_references(&serde_json::Value)` checks all **14** internal
save ID relations (container, grid, object-map identity;
storage/subgrid links; house, building, village and island grid links).
The JSON-only boundary `probe_save_references_json(decoded_json)`
returns a **fixed redacted result** containing 14 public rule
templates, aggregate counts and statuses. It never emits actual
map keys, numeric save IDs, account fields or raw values.

The scan caps each map/array to **4096** children and each
individual traversal to **65,536** visited nodes, including
intermediate nodes, to protect against deeply nested structures.
Partial work is marked `sampled_inconclusive`.
Missing destination indexes report `insufficient_evidence`,
not fabricated dangling or corrupt references. Grid ID `0`
is allowed. Any anomalies are *diagnostics*, not an assertion
that a save is invalid.

`Cargo.toml` enables `wasm` as an **optional** feature using
`wasm-bindgen`. CI now runs both native Rust unit tests and a
`wasm32-unknown-unknown` release build, verifying a
`ddv_save_schema.wasm` exists. These prove Rust compilation
and availability of a WASM-compatible read-only entrypoint;
**they do not install/ship the generated JS binding glue,
integrate the browser Worker, or replace the JavaScript P1G
decoder yet**. All site diagnostics continue to use the
existing safe JS reader until the WASM runtime is separately
integrated and verified.

Native unit tests use synthetic schema 626/643 documents and
verify ID-key consistency, zero IDs, missing target indexes,
nonmatching IDs, bounded maps, input immutability, and no
private ID leaks in JSON output. These tests do not compare
original save bytes, verify Codec roundtrips, or certify any
Writer/export functionality. `referenceClosureVerified=false`,
`writerAuthorized=false`, `exportAuthorized=false` remain
mandatory.

`serde_json::from_str` in the standalone WASM entrypoint is
**not** a replacement for the strict duplicate-key,
unsafe-number, ZIP/CRC or P1G validation currently owned
by the JavaScript Codec. A future browser/WASM integration
must keep the strict Codec boundary and parity-test Rust
against the existing JS reference observations.

## Exact cross-language reference graph parity gate

`tools/db-05-save/compare_js_rust.mjs` executes the existing
`probeSaveReferences` JS implementation and the Rust
`probe_save_references_json` implementation (via the
`crates/ddv-save-schema/examples/reference_probe.rs` local
CLI) against the *same* eight synthetic inputs. It compares
the complete JSON report objects using strict deep equality,
including the 14 rule IDs, modes, statuses, per-rule counts,
sample flags, index sizes, and all safety prohibitions.

The fixtures cover Steam/Switch-shaped schema 626 and 643,
missing container/diff-grid target indexes, mismatched map
identities, dangling storage/room links, malformed private
map keys, field type conflicts, >4096-member sampled maps,
and invalid roots. GitHub Actions runs this gate **after
Rust tests** and before compiling the WASM target; any
divergence fails the DB-05 workflow. The example writes
*only anonymized Rust reports* to stdout and has no Writer,
Codec or export access. Source JSON stays inside the
synthetic CI process; **never pass an owner-private save
to this example**. No production Rust/WASM browser
integration is inferred from this parity check.


## Rust 440-template unified shape probe (synthetic parity)

The independent Rust module `crates/ddv-save-schema/src/unified_shape.rs` now observes the
same **440 public field templates** in six checked-in source classes used by
JavaScript `probeUnifiedSaveStructure()`. It borrows a decoded JSON document,
reports only predeclared public paths, JSON kind names and anonymous counts,
and keeps platform/build/schema number out of compatibility gates.

`probe_unified_shape_json()` is a WASM-compatible entrypoint **only for data
already validated by the strict external Codec**. Its serde_json parser does
not enforce duplicate-key rejection, and this module does not decrypt P1G,
retain original bytes, authorize Writer/export, or connect to the browser UI.
Malformed input returns a fixed anonymous error. The synthetic parity gate
`node tools/db-05-save/compare_unified_shape.mjs` compares the entire Rust/JS
shape observations and blocks divergent implementations in CI. All input
fixtures are synthetic; no private save files belong in Git or CI fixtures.


## DB-05 to DB-03 exact mission-slot evidence (read-only)

The new source-backed manifest `data/ddv/save/guide-link-rules.v1.json`
defines `/World/MissionSlots/{id}/Slots[]/MissionId`, the native
`MissionSlot` integer field 2. The public JS adapter
`createSaveGuideProgressBridge(index)` validates a local owner-private
`wand.db03.quest-search@1` search index through DB-03's existing
`validateGuideSearch`. It offers `auditSave(decoded)` as a bounded
read-only exact numeric ID candidate join against **playable missions only**.
An ID missing from that subset is `unresolved_in_playable_quest_subset`,
**not** evidence that a native quest does not exist.

Reports contain only a static rule label, status and anonymous counters.
Private saved map keys, player values, native quest IDs and localized
names are never included. Default scan cap: 256 observed references;
truncated traversal is inconclusive. `MissionId=0` is a sentinel, not
an owned/completed mission. 626/643/platform differences do not select
separate code paths: only the actual decoded structure is observed.

The Guide index validator checks metadata and index structure, but this
bridge does not independently hash the proprietary original Mission.json
bytes. No external source+save build attestation, progress/completion proof,
entitlement or Writer/export permission is granted. The separate
`Player.AchievementsData[]/AchievementID` namespace cannot be joined to
the playable Mission index; a separately source-verified DutyAch adapter
is required. No private game content or owner saves are committed.

CI: `node --test tests/save-guide-links.test.mjs`.


## DB-05 -> DB-03 DutyAch achievement ID candidates (read-only)

The declared save path is `Player.AchievementsData[]/AchievementID`
(native `AchievementData` field 1, `int`). It is included among the
440 public, source-backed path templates observed in the three saved
626/643 samples.

`createSaveAchievementBridge(dutyIndex)` accepts the *owner-private*
`guide/duties.json`, emitted by DB-03 `native_guide.py` from the original
`ddv_Data/StreamingAssets/itemlist/DutyAch.json`. It checks the native
Guide schema/family, target metadata, unique canonical IDs, per-record
source file, uniform source SHA-256, native wire digest and frame index.
This is **metadata validation only**: it does not re-hash the original
proprietary DutyAch.json bytes. Independently verify the original
source and generated index before trusting the source identity.

`auditSave(decoded)` compares actual positive saved AchievementID numbers
to these private native DutyAch ID candidates. Its public return value
contains a fixed family label, status and **anonymous counters only**.
The scan is bounded to 256 rows by default; truncation is explicit.
A zero ID is a sentinel, malformed IDs are separate, and an unknown
ID is `unresolved_in_supplied_duty_index`, never a claim that the
game has no such achievement or a save is corrupt. The save's platform
and version are provenance, never gates for structural inspection.

No `CurAmount`, `MaxAmount`, `State`, claimed rewards, timestamps, actual
saved IDs, localized labels, personal fields or game-source bytes are
returned or committed. The adapter does not prove full history,
completion, progress, entitlement, ownership, Codec round-trip safety,
or Writer/export authorization. Active quest Mission IDs belong to
the **separate** Mission index and are not DutyAch IDs.

Test: `node --test tests/save-achievement-links.test.mjs`.


## Owner-modified saves: achievement observations without corruption claims

The supplied owner save files are **not guaranteed to be pristine game saves**.
Mission-related objects, quests and saved references may have been intentionally
deleted or changed. A field's absence in these samples is NOT evidence that
the original game omits that field, that it has a default value, that an
achievement is incomplete, or that the edited save is corrupt.

`data/ddv/save/achievement-observation-fields.v1.json` records seven
source-backed native `AchievementData` members (the numeric ID,
`CurAmount`, `ClaimedRewardMilestone`, opaque `State`, repeated
`TypesCollected`, repeated `ItemsUsed`, and `MaxAmount`). Names and
JSON type expectations are sourced from the previously verified
Steam v1.26.2 archived native IL2CPP metadata, cross-referenced to
the observed 626/643 save shapes. These field names do **not** establish
state-machine semantics or real completion thresholds.

`inspectSaveAchievementProgress(decoded, {maxRecords})` is a separate
read-only observation API. It accepts already-strictly-decoded save
objects, checks only the minimal GameInfo/Player/World root, and returns
anonymous counts for present/absent native field kinds. Native `int` is
counted within the signed 32-bit range; opaque State enum strings are
not decoded, and repeated int arrays are inspected only to bounded depth
(256 achievements, 128 elements per repeated array by default). Missing
individual achievement fields, `World.MissionSlots`, QuestInfo, or
mission-related world objects are **never automatically restored** or
interpreted as corruption. Unknown user fields are untouched.

An unexpected native kind is reported as an *observed type difference*,
not a determination that a modified save is broken. The result never
includes actual saved IDs, personal names, private map keys, enum values,
progress amounts, timestamps, item values or proprietary game source.
Progress, completion, entitlement, save integrity, Codec round-trip,
Writer and export remain **unverified/disabled**. The original source
must be independently confirmed before treating an observed native
field as required game behavior.

Regression: `node --test tests/save-achievement-progress.test.mjs`
(synthetic modified 626/643 saves, deleted mission branches, unknown enum
strings, unexpected kinds, bounded observations and privacy checks).


## Browser Worker: redacted achievement field observations

`/save/diagnostics/` now shows the anonymous seven-field achievement
observation from `inspectSaveAchievementProgress` after the existing
strict local-only P1G or JSON decode in the disposable Worker. The
`makeSaveDiagnosticView` adapter constructs a fixed-label summary, and
`sanitizeSaveDiagnosticView` validates and reconstructs this untrusted
Worker reply before Svelte receives it. The browser summary contract
has been bumped from `wand.db05.browser-readonly-diagnostics@1` to
`@2`, with a required `achievementObservation` field. The surrounding
one-shot Worker message contract remains unchanged; no new browser
decoder, fetch, storage, Writer, or export path was introduced.

The seven entries display only locally predetermined Japanese field
labels, observed/absent counts, type differences and bounded repeated
array element counts (256 saved achievement records, 128 repeated
integers per field). Stored achievement IDs, state names, numerical
progress, reward milestones, game source record bodies and personal
data are never transferred to page components. The page explicitly
states that absent mission objects/quests/achievements in an owner-edited
save do not establish corruption or incomplete achievements.

Browser reply validation rejects missing/duplicate/unrecognized field
IDs, forged status strings, out-of-bound or negative counters and
changed safety flags. Private labels or unknown reply properties are
dropped and replaced with fixed source labels. Both synthetic encrypted
P1G and plain JSON files are tested; test fixtures are never owner
originals. This does not verify achievement completion, a full
unmodified save, Codec round-trip, account ownership, or editing rights.

CI: `node --test tests/save-diagnostic-view.test.mjs
tests/save-p1g-worker-diagnostics.test.mjs`.


## DB-03 DutyAch + native achievement progression evidence (scoped)

`data/ddv/save/achievement-native-behavior-evidence.v1.json` records
four native source observations for `CurAmount`, `MaxAmount`,
`ClaimedRewardMilestone` and `State` separately from private save
observations. Its provenance is **owner-held Nintendo Switch v1.26.1
static native instruction analysis** (Build ID `3346726B2F640E01`).
This does not establish Steam v1.26.2's identical runtime behavior,
hardware correctness, persistence, general reward-class success,
or any exact DutyAch reward tier/goal values.

Within that **specific inspected native path**, `SetProgress` assigns
`CurAmount` and compares old/new values before milestone update.
`ClaimRewards` records the maximum of the old claimed threshold and
the just-claimed milestone after its normal reward-success branch.
`AchievementState.Completed` has native enum value `1` in this build.
`MaxAmount` is an identified native `int` field, not a verified source
of all final-stage requirements or a safe clamp target. None of
these observations permits `State` text decoding, completion rules,
reward grants or save mutations for all categories and builds.

`createSaveAchievementBridge(privateDutyIndex).auditProgressEvidence(decoded)`
uses **only the exact matched achievement IDs** from the already
validated private `guide/duties.json` index. It returns four static
field keys and *anonymous* observed/absent/native-kind-difference
counts, a matched-record count, malformed-row count and explicit
sampling. Matched rows with no progress fields are recorded as
absent, **not incomplete**. Unmatched IDs never contribute progress
evidence. The implementation does not compare actual progress
values, decode State names, invent missing achievements, repair
deleted mission objects, or assert any completion/reward ownership.

The adapter validates private Guide index structure and source SHA
*metadata* but cannot re-hash the owner-held DutyAch source in a
browser; original source and save build attestation are separate.
No original proprietary source, owner save, private Guide index,
actual ID, progress value, enum string or milestone value is
published by this PR. Writer and export remain prohibited.

CI: `node --test tests/save-duty-progress-evidence.test.mjs`.


## Actual native DutyAch milestones and configured reward IDs (owner-private)

The checked-in **schema-only** source contract at
`data/ddv/save/duty-milestone-wire-contract.v1.json` records original
archived Steam IL2CPP protobuf members (dump.cs SHA-256 pinned):
`Definitions.Items.AchievementItemData.Milestones` is repeated
field **13**; its `AchievementMilestone` child has `Milestone`
(field **1**, int), `RewardItem` (field **2**, int) and
`RewardAmount` (field **3**, int). This proves the field interpretation
in the inspected Steam build only; the raw game source is private.

`tools/db-05-save/duty_milestones.py` reads original binary
`ddv_Data/StreamingAssets/itemlist/DutyAch.json` with the canonical
DB-03 native wire parser and matches **every** frame ID/index/wire
SHA-256 to an existing owner-private `guide/duties.json` from the
same original file. It refuses incomplete, cross-version or
SHA-mismatched private indexes. For each repeated field 13 payload
only exact three-member, ordered, signed-int32 `AchievementMilestone`
wire triples are promoted to a typed source milestone.
Unknown, mixed, out-of-order or future field 13 variants remain
`opaque_or_mixed_field13`, with NO guessed condition or reward.
No field 13 is `no_field13_observed`, not proof the underlying
achievement has no further task or reward logic.

Run **locally or against private Drive materialized sources**:

```bash
python tools/db-05-save/duty_milestones.py \
  --native /PRIVATE/DutyAch.json \
  --duties /PRIVATE/guide/duties.json \
  --output /PRIVATE/db05-duty-milestones.private.json
```

Never place the resulting private index, original source or owner
save inside Git; the exporter rejects a Git checkout as an output
directory. Only anonymous summary counts are printed.

The source-only definition projection can be passed to
`createSaveDutyMilestoneBridge(privateDuties, privateProjection)`.
The JavaScript bridge validates exact private DB-03 ID, original
source SHA metadata, every record wire SHA, exact frame indexes,
typed monotonic milestones, and aggregate counts. It then inspects
an already strictly decoded possibly **owner-modified** save using
the exact numeric AchievementID join, returning anonymous counts of
configured milestone entries and saved numeric value comparisons:
`CurAmount >= Milestone` and
`ClaimedRewardMilestone >= Milestone`. These are **arithmetic
positions only**, never a proof of completion, reward eligibility,
grant, ownership or safe Writer state. Unknown/removed save records
remain neutral. Private actual IDs, threshold values, item IDs,
quantities, raw state names and strings do not leave the bridge.

Only the offline exporter hashes the original private DutyAch bytes;
the JS bridge validates internal private metadata only, and does
not imply that a private save was produced by the same build.
All edit/export privileges remain false.

CI: `python -m unittest discover -s tools/db-05-save -p 'test_*.py'`
and `node --test tests/save-duty-milestones.test.mjs`
(synthetic records only).


## DB-01 native reward definitions: exact DutyAch source SHA cross-version join

The owner-private Steam v1.26.2 DB-01 accepted release
(`wand.db01.private-shards@2`, 39/39 original itemlists, 302/302
read-shards) preserves the exact **DutyAch.json source SHA-256**
from the Steam v1.26.1 original used for DB-03/DB-05:
`1eae65460b71efd2d1c27904ff6b8ca30898d1c2a3220b9ef90b1dd9cef7c479`.
This byte identity concerns **DutyAch.json only**, not executable
behavior, game runtime, other files, save status or entitlements.

The owner-private snapshot audit found **635** DutyAch definitions,
**396** typed-milestone definitions, **1,646** typed milestone entries
and **77** unique nonzero configured reward IDs. All **1,646** reward
references match a DB-01 v1.26.2 native definition. Of these, **52**
references belong to `catalogDomain:'item'`; **1,594** belong to
`catalogDomain:'definition_unclassified'` including Currency.
These are configuration references, NOT owned items or grants.
An unclassified native definition is not a verified inventory item.

`src/lib/save/duty-rewards.ts` exports
`inspectDb05DutyRewardsInDb01(catalog, privateDuties, privateMilestones)`.
Call it with the owner-private, SHA-checking DB-01 TypeScript client
created by `createDb01CatalogClient`, the owner-private DB-03
`guide/duties.json` and the DB-05 private milestone projection.
The adapter validates the previously verified DB-03/DB-05 projection
contract, then reads the DutyAch source category shard and requires
**every** ID, original native field-2 key and original-source SHA
metadata to match the private source before it compares any rewards.
A different declared game version is allowed only for matching
original DutyAch bytes, not assumed on the version label alone.

Configured nonzero reward IDs are resolved via bounded
`Db01CatalogClient.getItems` requests. The API returns **only static
labels and anonymous numbers** of exact source matches, unresolved
IDs, native item-domain IDs, and other native-definition IDs.
No actual item/achievement IDs, names, thresholds, quantities,
saved values, account data or DLC rights leave this bridge.

Runtime checks compare metadata authenticated by DB-01's private
shard client, not original game bytes. An independently audited
private release remains mandatory before trusting its source hashes.
Missing reward definitions in a partial index stay unresolved.
An owner-modified save with removed mission or achievement objects
is never automatically called corrupt or incomplete. This adapter
does not read a save or authorize writing, exporting, reward claims,
item ownership, entitlement, or collectibility.

CI: `node --experimental-strip-types --test tests/save-duty-reward-db01.test.mjs`


## Owner-declared clean new-save baseline — private reference regression

`src/lib/save/clean-baseline.mjs` provides
`createCleanSaveBaseline(strictlyDecodedSave, {
ownerDeclaredClean:true, ownerDeclaredNoCheats:true,
ownerDeclaredNoRestrictedObjectEdits:true})`.
These properties mean **owner declarations**, not technical proof
that no cheats or movement/removal of immovable objects occurred.
A baseline captures only 23 fixed, public game field templates
and their aggregate kinds/child counts. It retains no raw save,
map keys, numeric IDs, names, progress values or accounts.
The function explicitly does not determine source Build,
codec-roundtrip safety, complete editor schema, or Writer access.

The private owner-provided **Switch 1.26.2 freshly started**
encrypted save was strictly decrypted/read outside this public
repository, and its 23 fixed candidate paths were observed,
with 0 kind differences and no bounded sampling. In this particular
clean reference, 390 AchievementData and 686 DiffGrids entries were
already present. **Absence of 245 DutyAch definitions from the fresh
save does not establish corruption or missing game content.**
Likewise initial DiffGrids do not imply player modification.
These are owner-private observations, not universal invariants.
No original profile bytes or actual save keys are committed.

Use `baseline.compare(candidate)` on an already strictly decoded
second save. It returns only static field IDs for optional
unobserved paths, candidate type differences, cardinality drift
and sampling. In particular it never interprets absent mission
objects, changed counts, different schema numbers or unknown fields
as cheats, improper placement, corruption or Writer eligibility.

To create an owner-private report directly from two encrypted
local files (second file optional), run the CLI from repository root:

```bash
node tools/db-05-save/clean-baseline-cli.mjs \
  --clean /PRIVATE/clean-profile.json \
  --candidate /PRIVATE/other-profile.json \
  --out /PRIVATE/clean-baseline-evidence.json \
  --owner-declared-clean \
  --owner-declared-no-cheats \
  --owner-declared-no-restricted-edits
```

The CLI reuses the strict, read-only P1G decoder and safely
writes anonymous evidence outside the public Git checkout only.
The input bytes and decrypted user JSON never enter the report.
It refuses to overwrite the input or an existing report.
Actual user saves and their private baseline reports must remain
outside GitHub, static hosting and CI fixtures.

CI: `node --test tests/save-clean-baseline.test.mjs`


## Editor target readset from owner-declared fresh unmodified schema 643

`data/ddv/save/editor-readset.v1.json` records **60 fixed paths**
observed in the owner's separately declared clean initial Switch
save (schema 643, game version 1.26.2 by owner declaration).
It covers ListInventories, ContainerInventories, CollectionSets,
AchievementsData, MissionSlots and GridCollection/Grids/DiffGrids.
It is a **structural observation readset**, not a complete game
schema or authorized Writer field list. All paths set `writable:false`
and `requiredInAllSaves:false`; source IDs, names, actual map keys and
player data are excluded.

Important **direct clean-save observations**:

- A fresh profile already contains **230** ordinary grids and
  **686** diff grids, including **521** saved ModifiedObjects entries.
  Diff-grid modification entries alone cannot prove that the user
  changed normally immovable game-world objects.
- ListInventory item entries use an ID-keyed map with `Amount` integer
  and `Marker` string; source-native item-ID joins remain candidates
  unless corroborated by private DB-01 originals.
- ContainerInventory slots are an array of ItemID/Amount rows.
  Container `ParentItemID` is **integer|null** in the clean reference,
  not integer-only. Slot `State` is **object|null**.
- Collection group content is nested under CollectionSets[]/GroupData[];
  collection DefinitionIDs are not the Mission ID namespace.
- World Grids/{id}/Objects/{id} and DiffGrids/{id}/ModifiedObjects/{id}
  already exist in the clean save. Their State fields are
  **object|null** and cannot be treated as proof of item ownership.
  Grids are identified by local map ID, whereas DB-04's actual
  source Grid definitions are joined by exact `GridDataPath` only.
- MissionSlot MissionId is an exact candidate for DB-03's native
  Mission ID, while AchievementID belongs to the separate DutyAch
  namespace. Missing records or removed mission objects remain neutral.

`inspectEditorReadset(decoded)` observes at most 16,384 children
per branch and 65,536 visits per field; a large grid object map is
covered without the 32-node historical sampled-only shape limit.
It reports only fixed public field IDs, observed/kind-difference
counts and explicit sampling by domain; no private values or map
keys leave the API. Build/version labels never gate structure.
Unknown paths are neither rejected nor normalized. All Writer,
export, entitlement, game-claim and strict-roundtrip guarantees
remain disabled. Editor implementation may consume this readset
as *candidate evidence*, not as an assertion of write safety.

CI: `node --test tests/save-editor-readset.test.mjs`


## Actual browser Worker Rust/WASM reference graph execution

The previous DB-05 Rust crate compiled to wasm32 but was not loaded
or executed by the browser. The developer `/save/diagnostics/` route
now invokes the compiled `ddv-save-schema` module **inside its
one-shot isolated Web Worker** after strict P1G or JSON parsing.
`src/lib/save/save-wasm-reference.mjs` instantiates the runtime
from `src/lib/save/wasm/pkg` (built by wasm-pack in Collection
CI and Pages publishing). Rust `probe_save_references_json` executes
the same 14 source-backed reference graph rules as the JS reader.
The Worker compares full redacted Rust and JS reports, then
returns a **fixed anonymous parity status only**:
`matched`, `diverged`, `skipped_large_save` or `unavailable`.
No raw IDs, field values, usernames or private saves cross the
Worker boundary; only a generated WASM binary is published.

The strict JS P1G Codec remains the **sole input decryption/CRC/
ZIP/UTF-8/duplicate-key/unsafe-integer gate**. Rust `serde_json`
does not replace that Codec and does not prove round-trip
preservation. Rust and JS results are compared only for reference
diagnostics, not as proof of absolute game correctness.
For exceptionally large (over 24 Mi-character) JSON input,
the second WASM parse is deliberately skipped to bound memory;
JS read-only diagnostics remain available with an explicit status.
If the WASM runtime cannot load, the UI says so instead of
silently claiming Rust ran; JS diagnostics are still usable.
A Rust/JS discrepancy is displayed as inconclusive diagnostic
evidence, not a corruption or Writer safety verdict.

CI builds browser glue using:

```bash
wasm-pack build crates/ddv-save-schema --release --target web \
  --out-dir ../../src/lib/save/wasm/pkg --features wasm
```

and executes `browser/save-wasm-smoke.mjs` against the generated
Pages-style Vite output with a **synthetic** JSON save. The smoke
requires an actual `.wasm` network response and a successful
14-rule parity message; it also verifies duplicate keys are
rejected prior to publishing a WASM result.
All owner-private save files, source bytes and decoded strings
remain outside the public artifact. Rust/WASM Writer and
lossless SaveSession serialization are still **not implemented**.


## Owner-private QwX clean versus historical save regression — real decoded originals

The owner's newly created, **no-cheats/no-restricted-object-edits
declared** Switch v1.26.2 QwX save was compared **privately** with
three separately kept historical Switch-origin save originals:
one schema **626** and two schema **643**. Every file passed
duplicate-JSON-key and unsafe-number validation; the fresh encrypted
P1G also passed AES/ZIP/CRC checks. The existing **23-rule** clean
baseline independently reproduced the original QwX counts exactly.

Anonymous real-file comparisons over these 23 fixed templates:

| Other save schema | Cardinality-different fixed templates | Newly observed type differences |
| --- | ---: | ---: |
| 626 | 18/23 | 0 |
| 643 (historical) | 9/23 | 0 |
| 643 (other) | 0/23 | 0 |

This proves neither that all four profiles belong to the same
account or continuous gameplay history, nor identical fields,
absence of cheating, game acceptance or safe writing. The final
643 original matched **23 structural counts** only, not the full
save JSON or user progress. Intentional earlier save deletions,
normal gameplay progression and changes between different player
accounts are deliberately not conflated.
Originals and the private per-rule comparison report are **not**
committed or shipped to GitHub Pages.

`src/lib/save/clean-regression.mjs` now builds a redacted immutable
snapshot of the **23 clean reference fields**, the **60 editor
readset templates**, and the **14 Rust/JS internal reference graph
rules**. `createCleanSaveRegression(cleanRoot,ownerDeclaration)`
returns `reference` and `compare(candidateRoot)`. A comparison
emits fixed public labels, anonymous counts and distinct diagnostic
statuses for changed cardinality, newly unobserved optional fields,
unexpected observed kinds, reference relation changes, and sampling.
It NEVER compares private record identifiers for supposed
cross-account equivalence, promotes a partial source join to
authoritative, or authorizes save writes/exports.

`tools/db-05-save/clean-regression-cli.mjs` runs the **same**
checks against encrypted P1G files (regardless of `.json` suffix)
and previously decoded plaintext JSON (including historical
`.profile`-named archives). JSON is strictly read with duplicate
key, UTF-8 and unsafe integer checks, P1G via the existing strict
read-only Codec. At most eight candidate files are accepted in
one run. Example local private use:

```bash
node tools/db-05-save/clean-regression-cli.mjs \
  --clean /PRIVATE/qwx-initial.profile \
  --candidate /PRIVATE/older-626.profile \
  --candidate /PRIVATE/older-643.profile \
  --out /PRIVATE/clean-vs-older-regression.json \
  --owner-declared-clean \
  --owner-declared-no-cheats \
  --owner-declared-no-restricted-edits
```

The result includes only anonymous fixed observations and positional
`candidate_1`, `candidate_2` labels, not original filenames,
save account strings, IDs, raw values, map keys or paths.
The CLI refuses public Git output and any overwrite of an
existing report/input; original saves are never modified.
All source-verification, entitlement, full strict round-trip,
actual player object-edit provenance, Writer and export
permissions remain explicitly false.

CI: `node --test tests/save-clean-regression.test.mjs
tests/save-clean-regression-cli.test.mjs` (synthetic fixtures only).


## Formal DB-05 -> Save Editor handoff — source-aligned, read-only

`data/ddv/save/editor-handoff.v1.json` and
`src/lib/save/editor-handoff.mjs` define the exact interface to
consume DB-05 safely in a future Save Editor. The contract is
validated **against the existing independent source manifests**
at load: 60 editor readset field templates, 14 internal-reference
graph rules, 8 known DB-01/DB-03/DB-04 reference candidate
families and 1 readset-only candidate not yet proven by the
catalog link rule. The source field paths are normalized only
for public wildcard spelling; **saved numeric grid IDs are never
converted into DB-04 source grid paths**.

Exact readset-to-source candidates:

| Domain | DB | Source family | Handoff field |
| --- | --- | --- | --- |
| Inventory | DB-01 | inventory_item_key | list_inventory_entry |
| Chest slots | DB-01 | chest_item | container_slot_item |
| Collection | DB-01 | collection_item_key | collection_group_items |
| Placed objects | DB-01 | placed_grid_object_item | grid_object_item |
| Diff-grid objects | DB-01 | modified_grid_object_item | diff_modified_item |
| Native grid definition | DB-04 | native_grid_source_path | grid_source_path |
| Mission slots | DB-03 | active_mission_slot | mission_id |
| Achievements | DB-03 | achievement_duty_id | achievement_id |
| Nullable chest parent | DB-01 | **readset-only, unverified join** | container_parent_item |

`mount_item` and `village_scene` are separate existing DB-05
catalog families but **not yet included** in the editor 60-field
candidate readset; neither may be silently treated as covered.

APIs:

- `getSaveEditorHandoff()` returns a deeply immutable,
  public, source-consistency-checked contract with explicit
  limits and unresolved gates.
- `inspectSaveEditorHandoff(strictlyDecodedProfile)` returns
  only anonymous presence/type/sampling evidence for the nine
  candidate paths and six readset domains, plus 14 native
  internal-reference diagnostics. It neither loads nor copies
  a private DB-01/03/04 index.

Each link reports `sourceIdMatchVerified:false` until the
appropriate **private source-validated catalog and source hash**
are independently supplied to its existing bridge API.
All returned identifiers are **fixed public rule IDs**, never
user map keys, source item IDs, actual ItemID, MissionId,
AchievementID, GridDataPath values, localized names or save fields.

An observed field is neither proof of native content validity
nor of permission to mutate it. Missing mission/world records
(including intentionally deleted records), changed counts,
unknown fields and native initial diff-grids do not imply
corruption. Changes to GameInfo.Version are not a reader gate.
Strict P1G decode is an external prerequisite; Rust/WASM
read-only reference parity does not certify save encoding.
Lossless unknown-field byte preservation, actual codec
round-trip, source/build joint verification, item ownership,
reward claims, Writer and export remain unverified/disabled.

CI: `node --test tests/save-editor-handoff.test.mjs`


## Exact owner-private Steam 1.26.2 DB-01 catalog coverage of Switch QwX clean profile

`tools/db-05-save/native_catalog_crosscheck.py` implements an offline,
read-only foreign-key coverage audit of the **entire** owner-private DB-01
Steam native itemlist catalog (not the historical 128/256-reference sample).
It accepts strictly decoded profile JSON **only on stdin** and a
**separately SHA-pinned** DB-01 source-release ZIP. The script independently
re-hashes the ZIP against the owner-provided expected digest, the inner
source catalog and shard manifests against the DB-01 release acceptance,
and every category shard against its recorded SHA and native source-file
SHA metadata. The original game asset bytes are not in that distributed ZIP:
the prior DB-01 original-asset audit is retained as inherited provenance,
not claimed as independently rerun here.

Use `tools/db-05-save/native-catalog-crosscheck-cli.mjs` to accept encrypted
P1G saves or plaintext JSON safely. It strictly decrypts/parses the save
using the **existing read-only local P1G Codec** and passes the verified JSON
over a **local subprocess stdin pipe**, without generating a decrypted
temporary save or uploading any content. Python needs only the standard
library. Run it from a checkout, with both the private ZIP and save file
stored outside public Git:

```bash
node tools/db-05-save/native-catalog-crosscheck-cli.mjs \
  --save /PRIVATE/qwx-original-profile.json \
  --catalog /PRIVATE/db01-steam-v1262-audited.zip \
  --expected-catalog-sha256 YOUR_VERIFIED_PRIVATE_ZIP_SHA256 \
  --out /PRIVATE/qwx-native-coverage-report.json \
  --owner-declared-clean
```

The report contains **anonymous counts only** for source IDs found,
unindexed positive IDs, native-domain item versus non-item definitions,
expected category mismatches, malformed values, 0/null sentinels and
source-provenance guarantees. It never contains actual ItemIDs, account
identifiers, save keys, native source names, grid paths, titles or item
names. The CLI refuses a Git-worktree output location and never overwrites
an existing report, ZIP or save. No source files or save bytes are
committed.

The fixed families include: inventory item keys, chest slot items,
collection item keys, regular and diff-grid object items, nullable chest
parent item IDs, mission IDs, DutyAch IDs, mount item IDs and native scene
IDs. A **separate** 230-path QwX GridDataPath observation is reported as
DB-04 **unverified** until a separately original-verified DB-04 grid path
index is supplied. *Numeric save grid IDs are not definition source paths.*
Unlike the UI-oriented limited sampler, this offline scanner examines
all observed family references, bounded at 200,000 per family and fails
closed if the limit is exceeded.

An exact ID in the DB-01 source-derived catalog means only that the native
metadata defines it. A source classification of
`definition_unclassified` must not be silently promoted into a
placeable, claimable, owned or consumable inventory item. Missing missions
and diff-grid records are neutral; diff-grid defaults may be present in
a fresh unmodified profile. A matching Steam v1.26.2 catalog version label
and the owner's Switch v1.26.2 game version declaration do **not**
independently establish the executable/source builds are identical.

The release remains private. Real indexed counts are in the owner's
local private report, not shipped to GitHub/Pages or inserted into
synthetic CI tests. The synthetic test
`python3 -m unittest discover -s tools/db-05-save -p 'test_*.py'`
verifies SHA pinning, tampered shards, category names, branch limits,
nullable parents, optional missing records and non-leakage.

**Still excluded:** DB-04 exact GridDataPath source join, gameplay
legality, DLC entitlements, save Writer safety, bytes-preserving P1G
roundtrip, actual game reload and future-source cross-build guarantees.


## DB-05 / DB-04 exact GridDataPath audit — owner-private, partial source

QwX's initial Switch v1.26.2 save has **230** GridDataPath observations,
of which **201** are distinct exact source paths. The owner-private
DB-04 Steam v1.26.2 Village04 / Expansion04 / WinnieDLC partial ZIP
contains **77** native grid records. An exact path comparison yields
**75 distinct matches** (**79** save observations) and
**126 distinct paths not indexed by that partial DB-04 release**
(**151** observations). No QwX GridDataPath was malformed.
This is a coverage gap in the partial index, NOT evidence that the
save is corrupted, edited or invalid.

The owner-private scripts at tools/db-05-save/db04_grid_path_audit.py
and tools/db-05-save/db04-grid-path-cli.mjs verify the caller-pinned
DB-04 ZIP SHA-256, the SHA-256 digest of every published inner
output member and the recorded native source path/SHA metadata.
The Node CLI strictly decrypts P1G or parses plaintext JSON and
passes the result to the Python scanner over a **local stdin pipe**.
Neither the save nor decrypted content is written to a new file.
An anonymous report is written only outside Git and never overwrites
an existing report.

Usage (paths and SHA are owner-private):

    node tools/db-05-save/db04-grid-path-cli.mjs \
      --save /PRIVATE/qwx-clean.profile \
      --db04-archive /PRIVATE/db04-1262-partial.zip \
      --expected-sha256 EXPECTED_PRIVATE_ZIP_SHA256 \
      --out /PRIVATE/db05-grid-path-coverage.json

The report contains only fixed public partition labels and aggregate
counts. No actual source paths, save numeric grid IDs, object states,
map keys, account data or source IDs are returned. Numeric save grid
IDs are NEVER reinterpreted as original GridDataPath keys.
The exact source file SHA-256 evidence is inherited from DB-04's
prior source audit; this DB-05 adapter independently hashes the
distributed ZIP and its output members, not the original game files.

The DB-04 archive states sourceSubsetOnly=true and
sourceScopeVerified=false. 126 distinct QwX paths therefore remain
unindexed in this archive. Full source identity, world placement
permissions, DLC entitlement, cross-platform save Writer safety,
roundtrip preservation and actual game reload remain unverified.
CI uses only synthetic saves, synthetic ZIPs and strict P1G fixtures.


## QwX-observed 201/201 native GridDataPath completion (still not full-game DB-04)

The remaining **126 exact QwX source paths** missing from the previous
77-definition DB-04 partial release have now been located and downloaded
from the owner-provided Steam v1.26.2 GridData source tree:

- 92 VillageExpansion01/02/03 original files
- 14 Furniture original files
- 18 OffGridBuildings originals (Expansion02 / Expansion04 underwater)
- 2 Rooms originals

All 126 files had unique matching native path names. Strict file-format
probing found **125 compacted protobuf GridData** sources and
**1 direct JSON FloorTypes** source. All 126 source structures passed
dimensions/palette/compacted byte-length checks; their SHA-256 and
original raw byte lengths were recorded **privately**. These additional
raw sources contain **1,489,565 grid-local cells** and **452,764
bytes** in total. These are direct source-file observations, not
proof of placement permissions, collision or game writer compatibility.

`db04_observed_grid_completion.py` and
`db04-observed-grid-completion-cli.mjs` join all 230 saved GridDataPath
references against the authenticated DB-04 partial ZIP and the
provided original GridData source directory. They reuse DB-04's
existing source-version-aware native `world.parse_grid_structure()`
parser instead of inventing a separate codec for the compressed
protobuf files. For every previously unindexed path they verify
original raw bytes, calculate a new source SHA-256 and preserve
DB-04's native grid fields, dimensions and terrain provenance.
Any missing/invalid original fails closed; neither the save nor
the source file is rewritten.

The private supplemental output includes a source-correlated
combined grid index (**77 base + 126 new = 203** DB-04 grid
definitions) covering **201/201 distinct QwX-observed paths**
and all **230/230 saved references**, plus a separate anonymous
report. The two extra DB-04 source definitions are not referenced
by QwX. This is **complete only for the QwX-observed GridDataPath
set**. It remains **not a complete index of all Steam/Disney
Dreamlight Valley game grids**.

Example private CLI invocation:

    node tools/db-05-save/db04-observed-grid-completion-cli.mjs \
      --save /PRIVATE/qwx-profile.json \
      --db04-archive /PRIVATE/db04-v1262-partial.zip \
      --expected-db04-sha256 PINNED_ORIGINAL_ZIP_SHA256 \
      --native-grid-root /PRIVATE/Steam/ddv_Data/StreamingAssets \
      --out-report /PRIVATE/db05-201-grid-coverage.json \
      --out-zip /PRIVATE/db04-observed-extended-grid-index.zip

Input is strictly decoded by existing local P1G/JSON checks and sent
to the Python parser through local stdin, without creating an
unencrypted temporary save. Output paths must be outside public Git
and are never overwritten. The private ZIP includes parsed,
source-referenced grid definitions and original SHA/size witnesses,
but **no raw game file or player save bytes**. Anonymous output
contains only fixed counters and no native paths, save numeric IDs,
item identifiers, account fields, user names or positions.

Native original source hashes are *recorded* from the exact downloaded
Steam files; they are **not independently pinned to a separate
executable build fingerprint**. The original partial DB-04 ZIP is
externally SHA-pinned. No proof of actual Steam/Switch binary
build identity, completed original-game-wide GridData coverage,
world coordinate transforms, object immovability, placement
constraints, Rust/WASM Writer safety or actual game reload is claimed.

CI: Python native Protobuf/direct JSON source tests, tampered
GridData/ZIP and private-output guards, plus a synthetic end-to-end
Node private CLI test. Original QwX and native source files remain
outside GitHub.
