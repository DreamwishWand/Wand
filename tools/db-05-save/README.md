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
For **77 of the 132** new fields, at least one observation used bounded
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
