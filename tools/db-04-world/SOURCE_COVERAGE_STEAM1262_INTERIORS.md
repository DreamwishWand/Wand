# DB-04 WORLD — Steam v1.26.2 interior evidence checkpoint

Owner-private source ZIP is stored under **SRC-05 WORLD DATA**, never in this
public repository. The checked GitHub code and tests contain no game original
bytes or full game-derived records.

## Scope extension (2026-11-22)

| Evidence | Previous FloatingIslands snapshot | After included interiors |
| --- | ---: | ---: |
| Source layout records | 180 | 203 |
| Original GridData records | 743 | 788 |
| Read-only source-correlated terrain cells | 5,196,146 | 5,214,773 |
| Source-local initial layout objects | 28,709 | 29,167 |
| SHA-256 source registrations | 929 | 997 |

Of **27 original interior layout files examined**, **23** were included:
19 native House/PlayerHouse sources plus four native Room sources. These
include native `Meta.GridCollection` envelopes directly stored by some Rooms
and a distinct root-field-2 embedded `Meta.GridCollection` envelope found in
Houses, PlayerHouse variants, and Boutique. New included records introduce
**200 explicit GridData references**, **45 distinct new GridData**, and
**458 source-local initial object anchors**.

The original Steam source contains references to
`GridData/Rooms/Wall24x9-GridData.json`, but that original file was not
present in the inspected v1.26.2 `GridData/Rooms` Drive source directory or
a filename search. The following four source layouts are deliberately not
imported until their required original GridData is available:

- `SceneLayouts/Houses/AliceHouse/AliceHouse.json`
- `SceneLayouts/Houses/AuroraHouse/AuroraHouse.json`
- `SceneLayouts/Houses/OswaldHouse/OswaldHouse.json`
- `SceneLayouts/Houses/PlayerHouse-Cabin-1_DefaultLayout.json`

No synthetic or borrowed replacement for the missing original asset was used.
All GridData paths referenced by the **203 included layouts** are present in
the owner-private snapshot. This is a *subset-level* assertion, not a claim
that the entire Steam game source archive has been indexed.

## Native semantics and safety boundaries

- House-specific context at root wire field 1 is **retained as SHA-256 of
  opaque source bytes**; it is not guessed to be rooms, unlocks, transforms,
  or permissions. The actual native `Meta.GridCollection` is root wire field 2.
- Some original Room records are **direct** `Meta.GridCollection`, and
  others are embedded. Dispatch preserves both forms, including accurate
  `gridDataPathWireField` provenance.
- Native `Grid.ID`, `GridObject` IDs, `x/y`, orientation, data references,
  and default objects are **source-local read-only evidence**. They do not
  establish world-space transforms, collision, navigation, runtime occupancy,
  or placement legality.
- Source membership, world hierarchy, and full placement rules remain
  **unverified**. Original commercial assets must not be committed.
- The private snapshot records a digest per original source, validates each
  JSON member against its manifest digest, and refuses unresolved references
  for every included layout.

## Synthetic regression

`test_interiors.py` covers House, PlayerHouse, Boutique-wrapped Room, direct
Room, malformed envelopes, missing context, native object/source provenance,
and preventing cross-family interpretation. Existing `test_floating_islands.py`
and `test_world.py` remain unchanged.

Run:

```sh
python -m unittest discover -s tools/db-04-world -p 'test_*.py' -v
```
