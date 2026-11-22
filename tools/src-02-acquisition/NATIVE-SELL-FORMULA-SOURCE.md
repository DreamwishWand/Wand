# DB-02 — original Steam v1.26.2 formula definition source join

## Result: authenticated source record identity, not a runtime sell quote

Previous work SHA-pinned the original `FormulaDynamicPriceDatabase` entry in
`ddv_Data/StreamingAssets/protoDb.bin`, retaining four purchase-formula
Item references and one sell-formula Item reference. It did **not** locate
the referenced definitions.

The missing original definition source has now been independently found in
`ddv_Data/StreamingAssets/itemlist/Formula.json` (**32 native binary
frames**). A raw filename suffix of `.json` does not imply JSON text:
the actual wire format is a length-prefixed native protobuf record sequence.
The exact SHA-256 of the owner-supplied Steam 1.26.2 original is
`e147b306ce4bf5a6a143e4342d4e12e1571d36688842ed732fdfa23e7ba66451`
(8,760 bytes). The existing SHA-pinned original `protoDb.bin` is
`dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623`
(1,335,720 bytes).

**Original-private verified findings:**

- All **5/5** dynamic-price formula references resolve to real native
  `Formula.json` Item definitions, comprising **4 purchase formula**
  references and **1 sell formula** reference.
- The one source sell-formula definition carries an explicit currency
  field, an ObjectType string, an equation string, and a table with
  **7** keyed floating-point records.
- The one sell-formula's source currency matches the game's serialized
  soft currency. Exactly **7/7** explicit sell-price-cache rows match
  the formula table by source Item ID **and numeric amount**. These
  are original serialized source matches, **not live retail prices**.
- Those seven source keys are distinct from the **371** fixed cooking
  recipe ingredient Items already audited by DB-02. That does not
  prove formula eligibility or ineligibility for other items.
- The other **474** cached sell rows lack serialized `Amount` fields;
  absence is not an observed runtime price of zero.

The exact original IL2CPP `SellPriceFormulaItemData` definition
confirms field IDs 6 (ObjectType), 7 (ForCurrency), 8 (Equation)
and 9 (TablesOfValues), and native source table float32 values.
The runtime Type resolved from ObjectType and the native formula
registration/selection are **not authenticated** by this source join.
The expression has **not been evaluated** for any arbitrary item.
No actual ingredient, meal, or other live sell price is established.


## SHA-verified source ObjectType and IL2CPP subtype correspondence

The exact original Steam 1.26.2 sell formula's serialized ObjectType
references the native **ActivityItem / Consummable** subtype. The exact
original 89,453,137-byte IL2CPP `dump.cs`, SHA-256
`0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`,
declares `ItemType.ActivityItem = 3` and
`ActivityItemType.Consummable = 15`. The 371 independently enumerated
fixed cooking ingredients belong to the *different* declared native
ActivityItem subtypes `Crop = 2`, `Fish = 10`, and
`Ingredient = 11`, with distinct C# item data classes. This is a
**source-to-metadata taxonomy correspondence**; it is not an execution
trace of `GetObjectTypeMetaInfo`, native formula registration, or any
runtime price provider. The seven formula-table/cache keyed matches are
also distinct from the 371 fixed ingredient IDs.

`native_formula_type_taxonomy.py` fails closed on the complete original
IL2CPP dump SHA, matching enum/class declarations and required native
type API declarations. Pass the optional `--dump` flag to
`audit_native_sell_formula_source.py` to enable this second source
authentication gate; without it, the report explicitly indicates that
the metadata correspondence was not verified. The result never prints
source-specific formula IDs, equations or per-item amounts.
**No actual cooking-item sell price is established.**

## Native runtime type-dispatch proof from exact Steam v1.26.2 code

The original SHA-authenticated **GameAssembly.dll** (176,820,736 bytes;
SHA-256 `a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653`)
was inspected directly at the native RVA declarations in the matching
`dump.cs`:

- `SellPriceFormulaItemData.GetObjectTypeMetaInfo` (0x40208A0)
  splits the serialized ObjectType, looks up the top-level native
  `ItemType`, parses its subtype, and calls
  `ItemDatabase.ItemTypeMetaInfo.GetItemTypeMetaInfo`.
- `IsFormulaValidForItem` (0x4021150) calls that resolver, obtains the
  metadata's `ProtobufClassType`, retrieves the candidate IItemData's
  actual runtime class, and compares those class identities for equality.
  This is an **exact runtime class-type match**, not an arithmetic price
  computation or a general category/name matching heuristic.
- `GetSellPriceFormulaItemData` (0x4020E60) checks the requested currency,
  then calls the preceding native eligibility gate.
- Game metadata separately declares `ActivityItemType.Meal = 3`,
  `Crop = 2`, `Fish = 10`, `Ingredient = 11`, and
  `Consummable = 15`. The only authenticated source sell formula
  specifies **ActivityItem/Consummable**, not Meal or fixed-ingredient
  subtypes.

The proof has **seven verified native direct-call targets**, **nine
SHA-256-checked instruction windows**, and the exact class-identity
comparison opcode. The self-contained read-only verifier
`audit_native_sell_formula_type_dispatch_1262.py` authenticates
`Formula.json`, `protoDb.bin`, `dump.cs`, and `GameAssembly.dll`;
it also reruns the existing 5/5 definition and 7/7 cache source joins.
All original bytes remain private.

Example on an existing, private local copy of Steam 1.26.2 originals:

```powershell
py -3 tools/src-02-acquisition/audit_native_sell_formula_type_dispatch_1262.py `
  --formula "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\itemlist\Formula.json" `
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin" `
  --dump "D:\Private\Steam-v1.26.2\Il2CppDump\dump.cs" `
  --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
```

**Boundary:** exact original method call flow is demonstrated, but the
runtime `ItemDatabase.ItemTypeMetaInfo` registry population, loaded
price-database provider order and any particular item instance's live
price remain unverified. Even if the formula is not eligible for a meal
or ingredient, that does not imply that another database provider has
a known sell price. Retain UNKNOWN for unverified sale values; do not
export a computed "price" based on this conditional formula alone.

## Local private audit

From a checked-out Wand repository with the **original** Steam 1.26.2
files supplied privately:

```powershell
py -3 tools/src-02-acquisition/audit_native_sell_formula_source.py `
  --formula "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\itemlist\Formula.json" `
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin" `
  --dump "D:\Private\Steam-v1.26.2\Il2CppDump\dump.cs"
```

The script validates complete file SHA-256, 32 frames, native source
entry and cache body digests, all five reference IDs, and the seven
key-and-amount matches. It rejects mismatched, truncated or synthetic
original sources and returns **aggregate counts and boolean evidence
only**. No original formula IDs, equations, strings, item-specific
values or original source bytes are printed or committed. No player
save is accessed or written.

For source-independent regression tests:

```powershell
py -3 -m unittest discover -s tools/src-02-acquisition -p "test_*.py" -v
```

**Remaining:** establish exact native runtime ObjectType resolution,
registered provider selection, and whether the formula is used on
any cooking-price path. Continue to treat all 160 fixed cooking
ingredients with no unique static soft-sell definition as **unknown**;
a matching original source definition is not a confirmed price.
