# DB-03: exact-source Steam update bridge (mission definitions only)

**Purpose.** Reuse original game mission definitions across an update only when an **independently recorded target-version full-file SHA-256** equals the SHA-256 of the archived original Mission binary. This is *not* a whole-Guide version upgrade, localization conversion, client/UI data publication, player progress check or permission to reuse changed Condition definitions.

## Inputs and output

Use a previously verified, owner-private baseline `guide/quest-search.json`, the exact corresponding raw `ddv_Data/StreamingAssets/itemlist/Mission.json`, and the separately captured **target-version** `format-probe.json` (`wand.src01.format-probe@1`). The probe must have `itemlistCandidates.Mission.json` with the expected source path, complete-file byte count and SHA-256, and the `binary_structure_probe` status. The bridge also requires target probes for eight related static sources (`Character`, `Condition`, `Story`, `Scene`, `DutyAch`, `RecurringEvent`, `ConditionalEvent`, `Ftue`). It compares each other source with an actual archived file when provided, rather than inferring sameness from the game version label.

```bash
python tools/src-03-guide/mission_source_bridge.py \
  --baseline-mission '/private/Steam-v1.26.1/ddv_Data/StreamingAssets/itemlist/Mission.json' \
  --baseline-search '/private/Guide-v1.26.1/guide/quest-search.json' \
  --target-probe '/private/SRC-01-Steam-v1.26.2/format-probe.json' \
  --baseline-condition '/private/Steam-v1.26.1/ddv_Data/StreamingAssets/itemlist/Condition.json' \
  --baseline-other-dir '/private/Steam-v1.26.1/ddv_Data/StreamingAssets/itemlist' \
  --out '/private/DB-03-Steam-v1.26.2/mission-source-bridge.json'
```

The script writes `wand.db03.mission-source-bridge@1` **only to the owner-private output path**, with source SHA-256s, target probe SHA-256, exact 1,030-record source census and an explicit `PARTIAL_MISSION_BYTES_ONLY` status. It rejects a missing/altered target probe, mismatched baseline Mission or wrong target platform/version, changed target Mission bytes, invalid original census and duplicate IDs. When the archived Condition file is supplied, it specifically reports whether its SHA-256 changed. A missing old Condition source produces `null` (`unknown`), *never* an invented unchanged result.

**Steam v1.26.1 → v1.26.2 result (owner-private originals, 2026-11-21):** Mission SHA-256 `f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24` is identical in the independent 1.26.2 probe and the archived raw 1.26.1 binary, so the **733 playable mission / 289 group / 8 unclassified** static Mission definitions are byte-identical. `Character`, `Story`, `Scene`, `DutyAch`, `RecurringEvent`, `ConditionalEvent` and `Ftue` also have matching raw full-file hashes when independently checked against archive copies. **Condition changed** and cannot be reused as 1.26.2. No claim is made that current locale ZIPs are unchanged (they differ), that prior extracted localized text is verified for 1.26.2, or that live season conditions/entitlements are known.

Do **not** change `quest-search.json.target.gameVersion` or rename old text to v1.26.2 based only on this evidence. The proper next full Guide refresh requires the changed original `Condition.json`, current localization corpus and a new version-specific extraction. The bridge output records proof for Mission-only reuse without mislabeling current requirements, rewards or localized strings.

**Tests**: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py'`. No original game files or derived text in GitHub; only code, synthetic tests and hashes documenting provenance.
