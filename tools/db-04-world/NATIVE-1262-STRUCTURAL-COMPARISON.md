# DB-04 — Steam 1.26.2 original GridData native-code comparison (2026-11-22)

**Status: partial, source-identified native instruction parity; terrain decoding remains disabled for 1.26.2.**

This is an evidence-only report, **not a decoder compatibility authorization**.
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

| Original GridData method | Relocation-only changed instructions | Distinct external direct target pairs | Byte-identical complete callees | Uncorroborated target pairs |
| --- | ---: | ---: | ---: | ---: |
| `get_Item` | 25 | 9 | 4 | 5 |
| `set_Item` | 34 | 8 | 4 | 4 |
| `IProtobufOnBinarize.OnBinarize` | 108 | 27 | 8 | 19 |
| `GetNumberOfBitsPerPosition` | 5 | 2 | 2 | 0 |

This checks direct targets only. Unknown/unmapped thunks and byte-different
callees are **not** declared equivalent. RIP-relative source data targets are
also counted but their semantic equivalence is not established. Therefore
`get_Item`'s successful palette path and bit-width helper are more strongly
corroborated than the entire transitive call graph, while the complete native
decoder compatibility gate **remains closed for Steam 1.26.2**.

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

## Capability boundary — unchanged

- `terrain_codec.py` and browser `getNativeTerrainWindow` **must** continue
  returning 1.26.2 unsupported/unverified status. Do not promote the
  `1.26.1` decoder merely from same-length instructions or unchanged data.
- Next native verification: correlate changed external call destinations
  and referenced data, determine whether relevant downstream implementations
  and observed 1/2/4-bit decoding semantics are equivalent. Only then
  introduce a pinned Steam 1.26.2 decoder proof and targeted regression.
- Until then, original GridCollection and Village-area **raw anchor record**
  previews (PR #177) are valid under their existing source-local-only,
  read-only contract. No global coordinates, occupancy, collisions or
  edit permissions are inferred.

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
