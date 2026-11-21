# DB-02 × DB-03 — source-pinned static quest item acquisition bridge

**Scope:** A private, read-only join between the verified SRC-02 Steam **v1.26.2 r5** acquisition snapshot and DB-03's owner-private Steam **v1.26.1** `quest-item-flows.json`. It is valid only because the full native `Mission.json` bytes were independently proven identical across Steam 1.26.1 → 1.26.2. **Condition.json changed** and is not reused or evaluated. The Guide dataset retains its actual source version label; this is not a blanket 1.26.2 Guide release.

Implementation: `src/lib/acquisition/quest-item-bridge.mjs` and `.d.mts`. The loader `loadPrivateQuestAcquisitionView(flowBytes, missionBridgeBytes, acquisition)` demands:
1. An already verified private r5 browser acquisition loader (manifest SHA `ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c`).
2. The owner-private original `SRC-03 GUIDE DATA/Steam-v1.26.1/database/quest-item-flows.json` **exact bytes**, independently SHA-pinned as `682f5730c614332668ea1b2558622babbc36009d0f6ab305331a9d7091d8ae5a`.
3. The owner-private `steam-1.26.2-mission-source-bridge.private.json` **exact bytes**, separately SHA-pinned as `ce0bfdf4fda1beaf6493659966eb4bc47da9af58cf7f3c3fb0b96d2d8c1b6011`. It proves native Mission SHA `f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24` is unchanged and explicitly records the changed current Condition SHA `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`.

No trust anchor comes from a user-selected file itself. The entire original byte digest is checked **before** JSON parsing. Native flow schemas, exact row-kind totals, 461 quest IDs, 1,352 distinct candidate Item IDs, source paths, original wire fingerprints, and per-kind semantics must match; otherwise the bridge fails closed. Results are frozen, read-only, on-device, and tagged `privateSource:true`, `publishable:false`.

## Source validation (private, no original rows committed)

| Original source flow | Occurrences | Linked to SRC-02 r5 static acquisition rows | Not linked within the partial SRC-02 index |
|---|---:|---:|---:|
| `additional_reward_loot_candidate` | 330 | 66 | 264 |
| `intro_item_grant_candidate` | 70 | 17 | 53 |
| `post_mission_cleanup_reference` | 824 | 357 | 467 |
| `substep_handoff_definition` | 293 | 102 | 191 |
| **Total** | **1,517** | **542** | **975** |

These counts were calculated from the *exact, independently hash-verified* existing owner-private releases, without publishing any source records. **Linked** means a matching native Item ID in DB-02's static relation index. **Not linked** means an absence from its **partial** extracted set; it never means nonexistent, impossible, unavailable, not owned or impossible to purchase. The old DB-03 `indexMembership` field is a separate partial SRC-01 membership and is preserved without reclassification.

## Query contracts

```js
const view=await loadPrivateQuestAcquisitionView(
  new Uint8Array(await questFlowsFile.arrayBuffer()),
  new Uint8Array(await missionProofFile.arrayBuffer()),
  verifiedR5Acquisition
);
const references=view.getQuestItemReferences('2070000628'); // source-defined candidate refs
const quests=view.getItemQuestReferences('30400064');       // reverse lookup
```

Each original occurrence keeps `flowKind`, exact native `sourceField`, `nativeWireSha256`, original quest/step IDs, conditional/weighted candidate labels, configured amount or keep-items flag where sourced, and the original `indexMembership`. Optional DB-02 static links expose only `sourceRecipeIds`, `sourceAcquisitionPathIds`, candidate stall presence and honest partial-coverage classification. No derived aggregated guaranteed quantities, probabilities, current prices, rewards received, quest status or player inventory appear.

This is a **private source interoperability primitive**, not a standalone public Guide or Collection publication or automatically activated UI feature. A future Guide/Collection UI can call the bridge only after explicit local import of all independently pinned files and appropriate distribution-rights review. **Do not** add the original JSON, manifests containing private data, game archives, translations or saves to GitHub/Pages.

Synthetic regression tests: `node --test tests/acquisition-quest-item-bridge.test.mjs`.
