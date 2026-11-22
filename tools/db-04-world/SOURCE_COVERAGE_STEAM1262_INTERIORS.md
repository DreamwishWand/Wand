# DB-04 WORLD — Steam v1.26.2 Houses and Rooms source coverage

The original game-derived snapshot and original game assets stay in
**owner-private storage**, not in the public repository. This document reports
evidence counts and implementation boundaries only.

## Verified original-source checkpoint (2026-11-22)

| Source evidence | Earlier partial interior snapshot | Current |
| --- | ---: | ---: |
| Total native layout records, all DB-04 families | 203 | **260** |
| Total original GridData records | 788 | **891** |
| Source-local default GridObject records | 29,167 | **30,334** |
| Read-only decoded source-local terrain cells | 5,214,773 | **5,244,434** |
| Original source SHA-256 registrations | 997 | **1,157** |

**Full interior layout coverage for the checked Steam v1.26.2 source tree:**

- **60** named `SceneLayouts/Houses/<folder>/` original layout files,
  including noncanonical original filenames (e.g. separate folder/file names)
- **7** original PlayerHouse layouts directly under `SceneLayouts/Houses/`
- **13** Room layouts: restaurant, ScroogeShop, TianaRestaurant, Boutique,
  GrandExhibition main layout and all eight GrandExhibition/Diorama variants
- Total checked **80 original House/Room layouts**, all represented in the
  private snapshot. The 57 newly added layouts provide 1,167 original native
  starting GridObject records, and their 343 literal GridData references are
  checked without substituting inferred file names.

The source-native `Grid.ID`, `GridObject` identity, x/y and orientation
are *local evidence*, not global coordinates. Room/Houses/PlayerHouse
envelopes carry opaque source-specific context at root protobuf field 1 and
a nested `Meta.GridCollection` at field 2. The context is preserved as a
SHA-256 digest without reverse-engineering location or edit permission.
Some Room layouts, including the restaurant, store and exhibition main
layouts, contain a **direct** native `Meta.GridCollection`. The eight
exhibition dioramas use the **wrapped** form.

## Important source inventory correction

The earlier DB-04 checkpoint incorrectly asserted that
`GridData/Rooms/Wall24x9-GridData.json` was missing. **It exists in the
original Steam v1.26.2 `GridData/Rooms` folder.** We fetched its exact
**43-byte original** and source-decoded its 24×9 Wall grid. The four
previously omitted layouts (AliceHouse, AuroraHouse, OswaldHouse, and
PlayerHouse-Cabin-1) are included in the current 260-layout snapshot. No
substitute or synthetic game-derived GridData was used.

**Reference closure:** All literal GridData paths referenced by the
**included 260 native source layouts** resolve to an original GridData
record in the private snapshot. ZIP CRC and all member SHA-256 hashes
match; all 260 layout IDs, 891 grid paths and 30,334 layout object IDs
are individually unique. There are no unresolved **included-layout**
GridData references.

This is not a proof of completeness of the entire Steam StreamingAssets
hierarchy, all game world records, furniture footprints, world transforms,
runtime occupancy, collision geometry or legality of object placement.
Those require independent original-source verification. The private
snapshot's `sourceScopeVerified`, `worldHierarchyComplete` and
`placementRulesComplete` remain `false`.

## Public read-only decoder and synthetic regression

- `world.py` supports direct `Meta.GridCollection` and wrapped
  House/Room `Meta.GridCollection` with literal original path and wire
  field provenance; it does not infer world edits.
- `test_interiors.py` uses only constructed synthetic protobuf-wire
  fixtures, including all eight diorama path variants, direct Restaurant,
  House/PlayerHouse contexts, malformed wrappers, literal Wall24 source
  path, and source-local default objects.
- This public repository does **not** contain the v1.26.2 original game
  files, their full extracted source-derived asset database or private
  save data.

Run:

```sh
python -m unittest discover -s tools/db-04-world -p 'test_*.py' -v
```
