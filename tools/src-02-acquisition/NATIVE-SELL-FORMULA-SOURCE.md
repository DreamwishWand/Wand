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

## Local private audit

From a checked-out Wand repository with the **original** Steam 1.26.2
files supplied privately:

```powershell
py -3 tools/src-02-acquisition/audit_native_sell_formula_source.py `
  --formula "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\itemlist\Formula.json" `
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin"
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
