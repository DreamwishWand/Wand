# DB-04 — Steam 1.26.2 original GridData native-code comparison (2026-11-22)

**Status: source-corroborated read-only GridData terrain preview enabled for original Steam 1.26.2; placement/edit semantics remain unverified.**

This is a narrowly scoped **read-only GridData decoder** evidence report, not authorization for placement, save writes, grid-object transforms, or general native-code compatibility.
No original binaries, disassembled game-code bytes, source-world payloads,
player saves, or private ZIP snapshots are committed.

## Source identification

The original *Steam* game binaries were inspected privately from the owner's
`Dreamwish Wand/v1.26.2/Steam` source archive and compared with the Steam
1.26.1 baseline from `Game Source Archive/Steam/Baselines`. This directory
is separate from the incomplete historical
`Game Source Archive/Steam/Updates/v1.26.2` directory.

| Pinned source | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| Steam 1.26.1 GameAssembly.dll | 176819200 | `a11bdf8245c691e6c66c7579193de6f259edb01c035ecc9e01f19fd358ee034d` |
| Steam 1.26.1 global-metadata.dat | 39563532 | `5005195e74242ec0736987c50204e13efd68c9223cfd01dd00182fb2f388444f` |
| Steam 1.26.2 GameAssembly.dll | 176820736 | `a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653` |
| Steam 1.26.2 global-metadata.dat | 39563696 | `a05e1ab76adaae54d410febd818cbf339141eae4ceae1a4eed1f54fd5c27d166` |

The original 1.26.2 FullVersion.txt identifies a build beginning
`releases_1.26ex-v1.26.2-6-g77de7caf1acf` (incremental-22).

## Exact native method identity and byte comparisons

For both originals, IL2CPP **metadata v31** resolves the exact
`Definitions.Grid.GridData` class in `Meta.Definitions.dll`.
The code generator's method-pointer table was located by original image
name; tokens resolve to executable PE32+ sections and exact AMD64
`.pdata` function starts. This is **not** an inferred `dump.cs` RVA delta.

| Method (arguments) | Token RID | 1.26.1 RVA | 1.26.2 RVA | PE unwind bytes | Linear instructions | Changed instructions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `get_Item` (2) | 12720 | 59801664 | 59800896 | 473 | 120 | 25 |
| `set_Item` (3) | 12721 | 59802144 | 59801376 | 406 | 97 | 34 |
| `IProtobufOnBinarize.OnBinarize` (0) | 12724 | 59803888 | 59803120 | 1942 | 429 | 108 |
| `GetNumberOfBitsPerPosition` (0) | 12725 | 59805840 | 59805072 | 100 | 30 | 5 |

GNU binutils objdump 2.44 was used for **linear instruction comparison** of
each corresponding .pdata function interval (method start through unwind
end), with the same relative instruction offsets and lengths.
Across **676** aligned instructions, **172** instructions had byte
differences. Every changed instruction uses a **PC-relative data reference,
call, or jump**; there were no byte changes to other instruction categories.
Differences in relative displacements are consistent with code/data
repositioning. RVA starts are all shifted by **-768**, while method
interval sizes and instruction-boundary sequences remain unchanged.

These are repeatable observations on the above pinned game originals;
they do **not** prove that every changed PC-relative call reaches an
equivalent callee, that RIP-relative referenced game data are equivalent,
or that linear decoding constitutes a complete control-flow proof.

In the sampled original StreamingAssets files, the native Meadow layout
and GridData bytes have the same source SHA-256 as pinned Steam 1.26.1
snapshots (see `terrain_evidence.py`):
- `SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json`:
  `5c6cd62b2ffbeff4b19f1864d1a0a2a4db4528e1685ff79f77cf5a58334f4113`
- `GridData/Villages/Village04-MeadowLevel-GridData.json`:
  `bfd75928343dacc6f2768f80585a0c2b1d5afe1c12ee2f97777bc94c20a96424`

The two matching source files are independent corroboration of those *data
records*, not proof of the entire version's native terrain behavior.

## Independent original-reference audit (2026-11-22)

The new `native_version_reference_audit.py` compares **pinned private
originals** against exact native metadata token identities. It validates full
PE unwind instruction byte coverage, fails on changed non-relative bytes,
classifies direct call/jump destinations and checks whether the complete
destination PE unwind function bytes are identical across game builds.

Audited source pair is the same four SHA-256-pinned originals listed above.
A local execution over these originals produced:

| Original GridData method | Changed instructions (relative only) | Direct target pairs | Byte-identical | Relocation-only code structure | Unmapped / unresolved |
| --- | ---: | ---: | ---: | ---: | ---: |
| `get_Item` | 25 | 9 | 4 | 3 | 2 |
| `set_Item` | 34 | 8 | 4 | 2 | 2 |
| `IProtobufOnBinarize.OnBinarize` | 108 | 27 | 8 | 17 | 2 |
| `GetNumberOfBitsPerPosition` | 5 | 2 | 2 | 0 | 0 |

The second-stage audit also disassembles bounded, exact-PE-unwind direct
callee functions. **22** of the **28** previously uncorroborated direct
target pairs have relocation-only instruction differences, while **6**
remain without confirmed complete unwind function boundaries. There were
**zero structurally divergent mapped callees** in this bounded direct
sample. In total: 18 byte-identical, 22 relocation-only and 6 unmapped
out of 46 method/target-pair observations.

These are direct-target checks only, not a recursive proof. A byte-different
callee whose instruction changes are only relative references may still
execute different downstream code or load different data. RIP-relative
source-data targets have not been semantically correlated. Consequently,
`get_Item`'s successful palette path and bit-width helper are more strongly
corroborated than the entire transitive call graph, while the native terrain
decoder gate **remains closed for Steam 1.26.2**.

Run privately (GNU binutils objdump required; original binaries never leave
the operator machine):

```shell
python tools/db-04-world/native_version_reference_audit.py \
  --old-dll "<steam-1.26.1>/GameAssembly.dll" \
  --old-metadata "<steam-1.26.1>/global-metadata.dat" \
  --new-dll "<steam-1.26.2>/GameAssembly.dll" \
  --new-metadata "<steam-1.26.2>/global-metadata.dat"
```

The script emits only aggregate counts and pinned hashes, sets
`nativeTerrainDecoder1262Approved:false`, and does not emit any original
machine-code bytes or private source filenames. CI runs synthetic unit tests
without needing either proprietary original.

## Third-stage thunk and RIP-source audit (2026-11-22)

For this stage, all **four** pinned original Steam 1.26.1/1.26.2
`GameAssembly.dll` and `global-metadata.dat` files were retrieved and
SHA-256 independently checked against the table above. The original PE64
exception directories contained 446,405 (1.26.1) and 446,401 (1.26.2)
runtime function entries. Direct disassembly of the four original GridData
RVA/unwind intervals reproduced **676 aligned instructions and 172 changed
PC-relative instructions**.

The six previously unresolved direct-target *occurrences* actually
resolve to **two distinct original entry points reused by three methods**.
Both entry points are executable but have no `.pdata` record, and both
start with a bounded 5-byte `JMP rel32` to an **exact `.pdata` function
start** in each version. The two terminal functions are byte-identical
and relocation-only, respectively. The new audit follows **only**
explicit bounded direct JMP thunks and classifies their bounded terminal
code; it does not infer arbitrary unwindless function extents.

| Method | Direct-target pairs | Terminal byte-identical (including thunk) | Terminal relocation-only (including thunk) | Unresolved / structurally divergent |
| --- | ---: | ---: | ---: | ---: |
| `get_Item` | 9 | 5 | 4 | 0 |
| `set_Item` | 8 | 5 | 3 | 0 |
| `IProtobufOnBinarize.OnBinarize` | 27 | 9 | 18 | 0 |
| `GetNumberOfBitsPerPosition` | 2 | 2 | 0 | 0 |
| **Total direct target observations** | **46** | **21** | **25** | **0** |

This does **not** mean all transitive calls or runtime behavior are
equivalent. A bounded call-target instruction match does not establish
the semantics of further calls or mutable global data.

The separate RIP-relative source classification found **75 distinct
instruction-level RIP reference pairs** in these four methods:

| Reference kind / original target backing | Observations |
| --- | ---: |
| Address-only `LEA` into writable, file-backed `.data` | 43 |
| Address-only `LEA` into writable, zero-filled virtual `.data` | 1 |
| Explicit-width access into writable, file-backed `.data` | 16 |
| Explicit-width access into writable, zero-filled virtual `.data` | 15 |
| Read-only source-data accesses | 0 |
| **Total** | **75** |

The previously marked **unmapped** RIP targets were *not* out-of-image:
the `.data` section has a VirtualSize larger than its SizeOfRawData, so
the image loader allocates its uninitialized, zero-filled tail at runtime.
The source audit now distinguishes file-backed from virtual zero-fill
references rather than rejecting the latter as missing from the PE file.

All 75 observed references target **writable virtual `.data`**, either
by address or by memory access. Equality of initial file bytes or
zero-filled allocation does **not** prove equality of dynamically
initialized runtime values, scene-specific state, or subsequent writes.
These mutable references remain a blocker to *general* native-state compatibility,
but the two **read-only GridData getter/bit-width success paths** were
independently inspected for their dependence on those globals.
The bounded source-local terrain decoder may therefore use those two getter
semantics only, without promoting complete native execution/placement proof.

The audit command above now emits thunk classification and
`ripReferenceSourceClasses` as aggregate JSON categories. CI uses only
synthetic tests for thunk safety, PE virtual backing, source-width
provenance and mutation invariants; original proprietary binaries stay
private.

## Limited Steam 1.26.2 read-only GridData compatibility proof

The original 1.26.2 and 1.26.1 disassemblies were checked specifically for
the **successful (non-exception) read path**. This is narrower than treating
all 75 writable RIP references or the whole transitive call graph as equal:

- `GridData.get_Item(int x,int y)` bounds-checks X and Y, obtains the native
  palette, computes `x * SizeY + y`, calls
  `GetNumberOfBitsPerPosition`, shifts the packed byte in MSB-first order,
  masks the code and performs indexed palette access. The corresponding
  1.26.1/1.26.2 instructions and immediate constants agree after
  relocation normalization.
- `GetNumberOfBitsPerPosition` reads the palette count and returns 1 for
  sizes 1–2, 2 for 3–4 and 4 for greater sizes. The DB-04 decoder restricts
  that last branch to 5–16 entries, so its 4-bit result can represent every
  returned palette index.
- The native `get_Item` helper used to return the indexed array value has
  the same normal-return instruction shape in both builds; its observed
  relocation difference lies in an exception call. The extractor rejects
  invalid native palette indices, sizes and unused padding bits before
  presenting the grid-local view.
- In these two getter methods, RIP-relative writable-data reads/writes are
  the one-time IL2CPP metadata initialization guard. Other RIP-relative
  references are `LEA` metadata/exception addresses. Normal grid-cell
  arithmetic uses object-local sizes, palette and packed-byte array
  contents, not unproven global gameplay state.
- The original Steam 1.26.2 Meadow GridData protobuf source SHA-256
  `bfd75928343dacc6f2768f80585a0c2b1d5afe1c12ee2f97777bc94c20a96424`
  matches the pinned 1.26.1 source bytes. The original Meadow native
  GridCollection source likewise matches
  `5c6cd62b2ffbeff4b19f1864d1a0a2a4db4528e1685ff79f77cf5a58334f4113`.
  This corroborates actual *2-bit* terrain input compatibility; 1-bit and
  4-bit decoding is grounded by the same getter and bit-width native
  instruction paths, with synthetic bounded regression cases.

This supports **source-local, read-only** 1/2/4-bit terrain tile/window and
palette-count presentation for source-verified **Steam 1.26.2** archives.
The native record's platform must be Steam. Previous extracted snapshots
marked `native_packing_not_verified_for_game_version` remain un-decoded
until re-extracted/reverified against their original bytes. Versions after
1.26.2 and other platforms are not promoted.

The proof does **not** assert all initialization routines or other
transitive callees are equivalent. It does not establish global world
coordinates, position transforms, terrain transitions, object occupancy,
collision, placement permission, runtime mutable state, or Save Editor
write safety. Accordingly `nativeCodeBodyVerified`,
`placementLegalityVerified` and `worldCoordinatesVerified` remain
`false` in the read-only adapter.

## Original Steam 1.26.2 direct JSON GridData sources

The source archive also contains four Village04 `GridData/**/*.json`
files whose bytes are **literal JSON**, not protobuf. Each has exactly
`SizeX`, `SizeY`, `FloorTypes` and an integer floor-mask array with
`SizeX*SizeY` elements. Source `GridCollection` links identify the
Forest, Savannah, Cliff and Wetland `BlockSpawn` variant. Native
`GridData.get_Item` directly indexes this array in X-major order when
compacted-byte storage is absent. These literal values include
`BlockAutomaticSpawning = 262144` as a mask bit.

The extracted 1.26.2 Village04 *subset* contains 12 GridData records,
nine layouts, eight AreaType references and 4,494 default source anchor
records. Four grids use direct JSON values; eight others use source-packed
1/2/4-bit values. This does not attest to game-wide completeness.

Original source-only comparison of those direct arrays against the
corresponding separate base terrain records shows that removing just the
262144 source flag yields per-cell equality on three pairs. Wetland
retains 1,947 additional differences: they are **not** normalized or
explained as placement permission. The extraction preserves the original
literal masks without filtering or rewriting any flags.

Private source file SHA-256 records, the ZIP's full derived JSON register,
and the original incomplete coverage status belong in SRC-05. Browser
display remains read-only: placement permission, live world coordinates,
object collision and world save editing are not inferred from these masks.

## Capability boundary — read-only terrain only

- `terrain_codec.py` and browser `getNativeTerrainWindow` now accept
  the narrow Steam 1.26.2 **read-only** packed-floor indexing path, not
  placement or edit legality. A structurally changed later game version
  remains unverified and its raw bytes are retained.
- Source-local grid-index/window and native default-layout anchor previews
  remain separate from global coordinates, collision/occupancy, navigation,
  rotations, object placement and save writes; those capabilities are
  **not** unlocked for 1.26.2.
- Continue separate native runtime initialization and placement-method
  verification before exposing any world-editing operation.

## Reproduction outline

1. Verify all four SHA-256 source file pins independently.
2. Resolve the four methods using the source-correlated
   `native_method_pointers.py` resolver with each version's
   `GameAssembly.dll` and `global-metadata.dat`.
3. Map each resolved RVA through the exact executable PE64 section to a
   file offset and extract only its corresponding .pdata function interval
   in a **private** workspace.
4. Linearly disassemble both private intervals with x86-64 objdump and
   compare instruction offsets, lengths, bytes, and addressing forms.
5. Keep caller/callee identity, data-reference equivalence, dynamic behavior,
   and terrain semantics explicitly **unverified** until separate evidence.

No source-origin proofs from 1.26.1 should be silently inherited by a
later game version.


## Steam v1.26.2 original GridArea getter and isolated cardinal-local read path (2026-11-23)

Independently fetched the **owner-private Steam original executables and IL2CPP v31 metadata** for both builds. File SHA-256 pins are the four originals documented in the source-identification table above. The original metadata type `Definitions.Grid.GridArea` resolves to `Meta.Definitions.dll`; its original method RID is joined to the module's native method-pointer array, rather than offsetting an unverified `dump.cs` RVA. For all listed methods, the actual native pointer for Steam 1.26.2 resolves to the paired RVA shown below.

| Native method and IL2CPP token | 1.26.1 RVA | 1.26.2 RVA | aligned instructions | source-reference displacement-only changes |
| --- | --- | --- | ---: | ---: |
| `GridArea.get_Item(int,int)` `0x0600343F` | `0x3923370` | `0x3923070` | 26 | 7 |
| `GridArea.TryGetGridLocalPosition` `0x0600344A` | `0x3923BB0` | `0x39238B0` | 132 | 10 |
| `GridArea.GetSizeForOrientation` `0x06003447` | `0x3923750` | `0x3923450` | 81 | 12 |
| `GridArea.MoreRotationSize` `0x06003448` | `0x3923880` | `0x3923580` | 78 | 12 |
| `GridArea.GetRotated` `0x0600345B` | `0x3924D30` | `0x3924A30` | 79 | 6 |
| `GridArea.GetUnRotated` `0x0600345A` | `0x3924C10` | `0x3924910` | 79 | 6 |
| `GridArea.GetStrideFor(int)` `0x0600344F` | `0x39241A0` | `0x3923EA0` | 23 | 6 |
| **Total** | | | **498** | **59** |

The original PE64 `.pdata` boundaries and existing 1.26.1 source-pinned method ranges were checked. Full aligned AMD64 instruction sequences for those bounded ranges contained **zero changed non-relative instruction bytes**; all **59** differing instructions changed an AMD64 relative branch/call or RIP-relative displacement, including the legitimate `cmp [rip+disp32],imm8` and `mov [rip+disp32],imm8` forms (which do not place `disp32` at the end of an instruction).

The normal successful `GridArea.get_Item(x,y)` read path uses original `x*SizeY+y` indexing, not assumed Y-major indexing or an inferred occupancy mask. The 1.26.2 cardinal `TryGetGridLocalPosition` has the matching source-local algorithmic instruction structure at orientations 0, 4, 8 and 12. The **bounded, read-only, intrinsic 1:1 GridArea-local** preview can therefore show original fixed32 `GridLayers` in its own local frame for these cardinal cases. The preview remains separate from original `GridObject` anchors and from save coordinates.

**Limitations:** a structural instruction comparison alone does not prove downstream native calls, dynamically initialized globals, runtime GridArea-to-Grid tessellation ratios, object anchor transformations, noncardinal rotations, physical occupancy, collisions or placement legality. The 1:1 transform is **a local-frame specialization**, not proof that an actual placed object uses 1:1. Only the source-local read preview is enabled; actual World Editor placement validation and writes remain disabled. No original game binary or disassembly bytes are added to the public repository.


## Steam 1.26.2 intrinsic 16-direction GridArea source-local extension (2026-11-23)

The same privately pinned original 1.26.1/1.26.2 IL2CPP v31 metadata and executable pair was used to resolve additional native methods by exact metadata token, module pointer table and PE64 function boundary. Comparison of bounded x86-64 instruction sequences found **no non-relative instruction-byte changes** in the listed methods:

| Original GridArea method | Method token | 1.26.1 RVA | 1.26.2 RVA | Instructions | PC-relative-only changes |
| --- | --- | --- | --- | ---: | ---: |
| `GridAreaData.GetGridArea` | `0x0600309F` | `0x38FA210` | `0x38F9F10` | 78 | 10 |
| `GridArea.MoreRotationGetGridLocalPosition` | `0x0600344B` | `0x3923D80` | `0x3923A80` | 171 | 18 |
| `GridArea.GetAlignedRotatedCorners` | `0x06003449` | `0x39239A0` | `0x39236A0` | 145 | 16 |
| `GridArea.Cos` | `0x06003458` | `0x3924B10` | `0x3924810` | 29 | 9 |
| `GridArea.Sin` | `0x06003459` | `0x3924B90` | `0x3924890` | 29 | 9 |
| `GridArea..cctor` | `0x0600345E` | `0x3924F80` | `0x3924C80` | 80 | 25 |

The raw metadata v31 **field-default arrays** for the original 16 fixed-integer COS/SIN coefficients were independently located in *both* versions by their SHA-256 field names (`33E08F575894...` and `5B6E0D7F4186...`). All 32 signed int32 entries and both field-default blob hashes match. The 1.26.2 `GridAreaData.GetGridArea` source method sets the returned intrinsic GridArea tessellation factor to 1. These facts corroborate the original **local** 16-direction, centred integer-vector lookup, including null output cells when a rotated destination sample has no original source cell.

Source `SceneLayouts` grid entries in the private partial 1.26.2 ZIP declare native `TessellationFactor` values 1 and 2. The local preview exposes a **manually specified** caller-grid factor 1/2 to inspect how the native intrinsic lookup scales. An exact *per-placed-GridObject* factory call, runtime GridArea-to-Grid coordinate system, rotation pivot, occupied cell predicate, blocking or legal placement **is not established** by this comparison. Those operations remain unavailable. No private original method bytes, source arrays or saves are publicly committed.


## Original GridObject → Item GridArea default-read path (Steam v1.26.2)

Owner-private source-only code inspection, independent of the native
`GridArea` local-cell implementation above:

- IL2CPP `Meta.Grids.GridObject.GetGridArea()`, token
  `0x0600F005`, resolves via `Meta.dll` method pointer table to
  **Steam 1.26.1 RVA `0x042AD560`**, `0x042AD560..0x042AD71E`
  (446 bytes, SHA-256
  `bdd66b1f4856fe8b4c6ad043d3d04b5ccab3679d15db1cedd1b2ca93e2b1a0d7`)
  and **Steam 1.26.2 RVA `0x042AD610`**, `0x042AD610..0x042AD7CE`
  (446 bytes, SHA-256
  `90d26c435b77873d2c3ecd1304d2d7e6d8fd321e80c9f917e2bdd209642b7625`).
- The two bounded x86-64 methods contain **100 aligned instructions**
  with 70 byte-identical and 30 PC-relative-only instruction changes;
  no non-relative instruction change. In the 1.26.2 method, the fallback
  path reads the GridObject Item ID, retrieves the associated original
  Item definition and invokes source-pinned
  `Definitions.Grid.GridAreaData.GetGridArea`
  (`0x0600309F`, RVA `0x038F9F10`). A previously cached runtime
  GridArea can instead be returned. Therefore this is a *default Item
  GridArea read path*, **not** proof of a particular runtime object's
  effective or overridden footprint.
- `Meta.Grids.GridObject.get_Position()` (token `0x0600F001`,
  1.26.2 RVA `0x042AD4B0`) reads the source GridObject X/Y
  properties. `Meta.Grids.Grid` source `TessellationFactor` remains
  a separate property. These facts prove the three relevant native
  source fields exist, but do **not** establish how a rotated footprint
  is positioned relative to the X/Y anchor.
- From the selected private Steam 1.26.2 **260-layout, 891-terrain,
  30,334 original GridObject** snapshot, exact source
  `(SceneLayout path, Grid.ID, GridObject.ID)` to Item lookup has
  **25,674** initial-object occurrences with available original
  `Item.GridAreaData`; **4,660** reference Item IDs absent from this
  **partial** Item archive. None of the 30,334 source Grid references
  are missing. Absence of an Item in this archive is not evidence that
  its GridArea does not exist.

The typed `getOriginalGridObjectItemAreaLink` API uses an **exact**
layout-scoped source key, returns original X/Y/Orientation and Grid
factor, and independently retrieves the source Item's intrinsic GridArea
dimensions. It is read-only and explicitly leaves
`runtimeAreaOverrideExcluded`,
`actualPlacedGridAreaVerified`,
`nativeAnchorToAreaPivotVerified`,
`occupancyPredicateVerified`, `collisionRulesVerified`,
`placementLegalityVerified`, `savedGridIdentityVerified` and
`saveWritingAuthorized` as **false**. No original game binaries, Save
records or raw Item GridLayers are committed to public Git.


## Original source default GridArea outer-bound check (Steam v1.26.2)

Further source-native correlation of
`Meta.Grids.GridExtensions.IsAreaInside` (IL2CPP token `0x0600F341`)
resolves the 1.26.1 PE64 method window `0x042E5100..0x042E5207`
(SHA-256 `c78882799d69f1c169b38716a392e4337f4c4f148caf009c798a1ae89037c3c9`)
to the 1.26.2 window `0x042E51B0..0x042E52B7`
(SHA-256 `b9e514c28be3c3f8261fd329c71f8afa7be06cacab10224a5c33d9e7a5d0c457`).
Their **72** aligned instructions have no non-relative byte changes:
**61** byte-identical, **11** PC-relative displacement changes.

The 1.26.2 function calls the original
`GridArea.GetSizeForOrientation(orientation, Grid.TessellationFactor)`
and verifies that the **source position X/Y** and
`X + orientedWidth - 1`, `Y + orientedHeight - 1`
remain inside the original GridData dimensions multiplied by the
Grid tessellation factor. This verifies the **native boundary arithmetic
for an original item's DEFAULT area**, not the entire
`IsAreaInside` predicate: the function performs an additional
GridData/position validity call that is **not** implemented by the
source preview. It does not establish physical occupancy within the
outer rectangle, a cached runtime/overridden GridArea, collisions,
valid floor types, world-space transforms, EditMode permissions or
safe Save writing.

Independent source-only audit of the same owner-private Steam 1.26.2
260-layout/891-GridData subset: all **25,674 / 25,674** initial GridObject
records with available original Item `GridAreaData` fit this
strictly bounded **source default** oriented outer rectangle.
The other **4,660** Item references lack definitions in this
*partial* Item archive and are **not** classified as valid or invalid.

The read-only typed DB-04 result exposes an immutable
`sourceDefaultBoundingRect` only when this source-default geometry is
within the original Grid's factor-scaled bounds; otherwise it exposes
an explicit failure without drawing a rectangle. The World preview
draws a **dashed rectangle border only**, never filled occupied cells.
These results do **not** authorize editing, collisions or placement.

## Original GridCells default Item-layer projection (Steam v1.26.2)

Source-pinned native IL2CPP `Meta.Grids.GridCells.GetLayersForPosition`
(token `0x0600F373`; old RVA `0x042EA530`, new RVA
`0x042EA5E0`, 788-byte unwind-bounded function, v1.26.2 SHA-256
`94d8b4501ad5860d1f6a41a4089c95eec68b09752ab5a7d84a99e79bc6dddba5`)
contains 176 aligned native instructions in both owner-private
Steam 1.26.1/1.26.2 versions. The 1.26.2 instructions are byte-identical
in 141 cases, differ in PC-relative displacement in 35, and differ in
**no other instruction byte**.

The actual 1.26.2 call path iterates GridObjects retrieved from the
native GridCells index; calls `GridObject.GetGridArea` (cached override
or original Item default fallback, token `0x0600F005`); reads the native
GridObject position from its original signed X/Y fields; subtracts that
X/Y from the *queried Grid position*; takes the object's original
orientation and the Grid's own tessellation factor into the
source-matched `GridArea.TryGetGridLocalPosition`
(token `0x0600344A`); reads the fixed32 GridLayers array at the
resolved local index; and uses the original integer **bitwise OR** to
accumulate per-cell layers.

The typed `getOriginalDefaultGridLayersAtCell` in
`src/lib/world/native-default-gridlayers-cell.ts` implements only the
verified **source Item default GridArea** specialization, for an exact
original `(SceneLayout, Grid.ID, source Grid cell X/Y)` and factor 1/2.
It returns a bounded set of original per-object contributors and a
uint32 OR receipt, separately counting missing Item definitions and
items without a source GridArea. Original **oblique unmapped corners**
do not become zero-valued occupied cells. Zero OR and zero contributors
are **not** a permission, free-cell verdict, or proof of an empty
live Grid. A runtime GridArea override, dynamic Save object, native
GridCells index membership, collision and all placement rules remain
unverified; no Save writes or private original arrays are published.
