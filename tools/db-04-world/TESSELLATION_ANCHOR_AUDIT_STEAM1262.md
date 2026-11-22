# DB-04 — native grid tessellation versus source-local anchor bounds (Steam v1.26.2)

Read-only provenance audit. Original game assets, source-derived object coordinates,
and the full snapshot stay in owner-private SRC-05 WORLD DATA.

## Evidence from the 260-layout / 891-GridData owner-private snapshot

All **30,334 native default \`GridObject\` anchors** were correlated by
\`(layoutId, Grid.ID)\` with the **literal GridData path** on that
layout's native \`Grid\` entry. These IDs must not be joined globally by
\`Grid.ID\` alone: grid IDs repeat across layouts.

| Source-native Grid.TessellationFactor | Original initial anchors | Outside raw SizeX×SizeY | Outside SizeX×factor by SizeY×factor |
| --- | ---: | ---: | ---: |
| 1 | 18,018 | 0 | 0 |
| 2 | 12,316 | 8,018 | 0 |
| **Total** | **30,334** | **8,018** | **0** |

The **8,018** out-of-raw-bounds anchors are exclusively associated with
the \`OffGridBuildings\` source family (which uses original factor 2
on the relevant entries). There are no missing GridData records, missing
size/factor inputs, or anchors outside the empirical factor-scaled envelope
in this selected source subset.

This corroborates the hypothesis that source-native anchor integer
coordinates use a scale associated with \`Grid.TessellationFactor\`.
**It does not yet prove the exact game's world-space conversion or
the geometry/legality of object placement.** In particular, the observed
extent correlation is not proof of:

- World/scene origin, rotation, height or navigation transforms
- The rotated or tessellated footprint of any native item
- Allowed floor-type masks, collision, occupancy, or spawn blocking
- Whether the engine permits a move, rotation or cross-grid transfer
- Runtime/save-specific positions and edits (owned by DB-05)

The source-native boolean \`gridEditRestrictions\` fields and a building's
\`GridAreaData\` can provide separate raw evidence, but **cannot** by
themselves authorize an edit; dynamic state and engine placement checks
remain unverified.

## Executable audit

\`local_anchor_audit.py\` is an independent read-only auditor that works
on a privately extracted DB-04 snapshot. It accepts JSON families
\`layouts.json\`, \`grids.json\`, and \`layoutObjects.json\`.
It does not open/alter saves or write any object placement.

\`\`\`sh
python tools/db-04-world/local_anchor_audit.py \
  --snapshot /path/to/private/snapshot \
  --output /path/to/private/nativeAnchorEnvelopeEvidence.json
\`\`\`

The evidence returned by \`verify_bundle.py\` also includes
\`nativeAnchorEnvelopeEvidence\`. Its categorical flags are explicit:
\`nativeWorldTransformVerified=false\`,
\`occupancyPredicateVerified=false\`,
\`collisionRulesVerified=false\` and
\`placementLegalityVerified=false\`.

Newer/unavailable original GridData, unsupported factors, and missing
dimensions are **unknown** rather than assumed safe. An anchor outside
the observed envelope is **an audit discrepancy**, not sufficient proof
that the game would reject an edit. Conversely, being inside that
envelope is **never** permission to place an object.

Synthetic-only unit tests cover factors 1 and 2, raw-vs-scaled bounds,
missing original data, unknown factors, duplicate IDs, and layout-scoped
native Grid.ID collisions. No original commercial assets are embedded
in tests.
