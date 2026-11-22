# DB-02 — Shared IL2CPP interface TypeInfo usage (Steam v1.26.2)

## Exact-original finding: the same TypeInfo slot is referenced by four methods

An independent read-only audit of the SHA-pinned Steam v1.26.2
`GameAssembly.dll` and `dump.cs` identifies the **same metadata usage
storage address** (RVA `0x9B2F018`) in four native methods:

| Original owner and method | TypeInfo initialization | TypeInfo read / invocation |
| --- | ---: | ---: |
| `ProtoDatabase.SaveBinary` | 1 | 2 (cast, interface invocation) |
| `ItemDatabase.ExportForBuild` | 1 | 2 (cast, interface invocation) |
| `GridData.DataValidation` | 1 | 1 (interface invocation on a newly constructed clone) |
| `AudioGridData.DataValidation` | 1 | 1 (interface invocation on a newly constructed clone) |
| **Total** | **4** | **6** |

These **ten exact RIP-relative references** were found across the original
IL2CPP executable section, rather than selected by searching a narrow
single-method disassembly. All four initialization references invoke the
same native metadata usage initializer. Both export paths perform a
runtime type cast before calling the generic slot-zero interface
invocation helper. The two grid-validation methods create clone objects
and call that same helper with the same TypeInfo storage value.

The exact original, pre-runtime-initialization 64-bit encoded storage
token is `0x2002283B`. The original metadata usage initializer extracts
its high-bit **usage kind 1 (TypeInfo)** and its encoded usage index
**70,685**. Its kind-one resolver calls the original native type
resolver. **The index is not a managed type name.**

The new auditor validates **12 native instruction-window SHA-256
digests**, **11 direct native call targets**, the precise raw TypeInfo
token, original class/method metadata, four owner contexts, both
GridData/AudioGridData clone constructors, and the *entire-section*
set of ten RIP-relative references.

## What this DOES and DOES NOT prove

**Proven from the original binary:**

- The two build/export paths and two grid-validation paths refer to the
  **same IL2CPP runtime TypeInfo usage slot**.
- The type is dynamically resolved from the original encoded usage,
  rather than being inferred from nearby source names.
- The original C# metadata declares an `IProtobufOnBinarize` interface
  with exactly three concrete implementers:
  `DynamicItemPriceDatase`, `GridData` and `AudioGridData`.
- The grid-validation callers and native export routines use a common
  generic interface-dispatch implementation.

**Still NOT proven:**

- That the encoded TypeInfo usage index **70,685** maps to the
  managed `IProtobufOnBinarize` type. The original IL2CPP **type
  registration and global metadata definition mapping** necessary
  to translate this usage index into its exact managed name is not
  present in the verified original files available to this audit.
  The three known implementers are supporting context, not a
  cryptographic or metadata-table identity proof.
- That a particular game's loading/saving action calls
  `DynamicItemPriceDatase.OnBinarize()`.
- That the dynamic price cache is rebuilt in the live game or that
  any source-unpriced ingredient has the fallback price `1`.

This is stronger than a call-site guess: the **same pointer and its
encoded type-metadata usage** are verified across four method contexts.
It does **not** silently replace that evidence with an assumed C#
interface identity.

## Private read-only reproducibility

~~~powershell
py -3 tools/src-02-acquisition/audit_native_shared_binarize_typeinfo_1262.py --dump "D:\Private\Steam-v1.26.2\dump.cs" --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
~~~

The original files are authenticated by SHA-256 and read in place.
The auditor never invokes original code, copies source instructions,
prints item IDs/prices or reads player saves. Python regression tests
use synthetic encoded metadata tokens and synthetic relative-reference
patterns. The typed source-only lifecycle evidence and authenticated
private meal pricing view expose aggregate usage counts and
**explicitly unresolved** type-name and live-runtime flags.

**Next evidence required:** a version-matched original
`global-metadata.dat` / type registration mapping for translating the
usage index into an exact managed interface class. A raw numeric
usage index, a matching slot count and nearby managed names alone
cannot certify the identity.
