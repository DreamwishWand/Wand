# DB-03 — typed mission item targets (Steam v1.26.1)

`mission_items.py` decodes the nested item selectors and amount definitions in quest objectives, based on named fields in the owner-held Steam v1.26.1 `Il2CppDump/dump.cs` and the native `itemlist/Mission.json`. The reader runs automatically through `mission_semantics.py` and `native_guide.py` using Python's standard library.

## Source-backed mappings

- `MissionObjectiveData` contains oneof objective payloads, such as `Possess`, `BringItem`, `CraftItem`, `CookMeal`, `PickUp`, `GiftToCharacter`, `PurchaseItem`, and `CollectCurrency`. Those payloads contain explicit `ItemSelector`, `AnyItemSelector`, or `AnyMarketableItemSelector` fields. Their exact field numbers are declared in `mission_items.ITEM_OBJECTIVES` (from IL2CPP class constants).
- `ItemSelector` oneof: `Item` = 1, `ItemList` = 2, `ItemGenerator` = 3, `FilterGenerator` = 4; all wrap `MissionItemGenerator`.
- `MissionItemGenerator`: `Item` = 1 wraps `GeneratorItem`, `ItemIngredient` = 2 wraps `GeneratorItemIngredient`, type code = 3, followed by optional constraints/tags/filters. `GeneratorItem` / `GeneratorItemIngredient` oneof `Item` = 1 (int ID), `ItemList` = 2 (`GeneratorWeightedItem` repeated field 2, `Weight` field 1, ID field 2).
- `AnyItemSelector` and `AnyMarketableItemSelector`: `ItemTypeToGive` = 1, `ItemToGive` = 2; their category enum is recorded without assuming the category represents a single item.
- `StepAmount`: `Value` = 1 (`ScalableValue.Value` = 1), `Range` = 2 (`Range.Min` = 1, `Range.Max` = 2, each a `ScalableValue`). These are **source-configured quantities**, not measured player progress.

The objective's `structured.stepsDetailed[].subSteps[].objectives[].itemTargets` field retains each `role`, selector `mode`, generator hash, raw selector SHA-256 and (when source-backed) concrete referenced IDs. Any unknown or dynamic selector yields an empty candidate list, not a guessed item. A weighted item list is a set of **alternatives**, not an assertion all listed items are required. Source filenames and native wire SHA-256 are kept on the parent quest/step/objective.

## DB-01 cross-reference

`database/item-objective-links.json` is an explicit join work queue with quest ID, step ID, substep ID, objective ID and type, selector role/mode, target item ID, configured amount/range, candidate role (`direct` or `alternative`), source wire SHA-256 and optional SRC-01 index membership. All rows are **candidates in a source-configured selector**, never a flattened "materials needed to complete the entire quest" list. For example, alternative items must not be summed together, and a `filterGenerator` with no explicit target ID must not be converted into a concrete requirement.

The currently available SRC-01 `items.jsonl` is a *partial* four-category v1.26.2 native index; the Guide source is v1.26.1. `indexMembership=not_in_supplied_index` means only that the ID was absent from the supplied partial index, **not** that the item is invalid or absent from the game. No cross-version equivalence is asserted.

## Baseline audit

Against owner-held Steam v1.26.1 `Mission.json`, 4,897 source-typed candidate item links were found for 2,551 distinct referenced IDs: 4,641 direct references and 256 alternative candidate occurrences. The optional SRC-01 partial item index included 4,451 of these occurrences; 446 were not indexed. `Mission.json` still contains 1,030 definitions (733 missions, 289 groups, 8 unclassified); no extra quests were invented. The complete native extraction, including all eight exact localization archives and SHA-256 source provenance, remains `PARTIAL` pending unknown gameplay conditions, live event scheduling, Star Path season sources, and complete v1.26.2 source verification.

Run `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v`; the new tests cover fixed and alternate items, quantity values/ranges, dynamic selectors, and end-to-end DB-01 links. Source bytes, translated game text, and derived datasets are retained only in the owner's private SRC-03 Drive folder, not the public repository.
