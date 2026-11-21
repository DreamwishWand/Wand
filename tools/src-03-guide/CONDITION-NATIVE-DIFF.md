# DB-03 — exact native Condition definition comparison

`condition_native_diff.py` compares original Steam `Condition.json` native binary
frames **per original definition ID**, without claiming to understand gameplay.
The target bytes must match the independently captured same-build
`wand.src01.format-probe@1` full-file SHA-256 and size before the tool
reports any added, removed, changed or unchanged records.

## Verified context

The existing owner-private Steam v1.26.1 baseline has **5,439** extracted
Condition definitions and raw `Condition.json` SHA-256:

`f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150`

The independent Steam v1.26.2 format probe reports target original
`Condition.json` length **571,341 bytes**, SHA-256:

`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`

The archived baseline length is **571,256 bytes**. Thus the full source
changed, but source-level added/removed/changed **definition IDs are not
established until the actual v1.26.2 bytes have been compared**. Do not
manufacture a zero-diff report from missing input.

## Owner-private offline invocation

```sh
python tools/src-03-guide/condition_native_diff.py \
  --baseline-condition '/private/v1.26.1/itemlist/Condition.json' \
  --baseline-version 1.26.1 \
  --baseline-sha256 f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150 \
  --expected-baseline-count 5439 \
  --target-probe '/private/v1.26.2/format-probe.json' \
  --target-condition '/private/v1.26.2/itemlist/Condition.json' \
  --out '/private/DB03-v1.26.2/condition-native-diff.json'
```

Omit only `--target-condition` when the actual updated source is not
available; the report will explicitly say `TARGET_BYTES_NOT_AVAILABLE`,
with `comparison=null`, rather than reporting no changes. Once genuine
target bytes are supplied, source SHA-256, size and native frame structure
are checked before emitting `COMPARED_NATIVE_DEFINITIONS_ONLY`.

The source-native frame decoder validates canonical Protobuf wire fields,
frame bounds, original ID/frame offset consistency and duplicate frame
offsets. Per-definition signatures are computed over complete canonical
original wire bytes: new parser annotations cannot create false game updates.
A changed ID is **not** necessarily a changed prerequisite, and an added
Condition ID is **not** necessarily a new quest. The result does not expose
localized strings or private record bodies.

## Publication and interpretation

Only public code and synthetic fixtures belong in GitHub. Input raw assets
and output report belong on owner-private storage. The CLI rejects output
inside this public checkout and source/output path aliasing; reports are
written atomically with restricted permissions when supported.

The comparator deliberately does **not** evaluate condition semantics,
player progress, DLC purchases, quest release status, date predicates,
eight-language text changes, or Star Path server responses. A complete
v1.26.2 Guide refresh still needs current original localization and an
independently verified extraction that maps the changed source to the Guide
consumer.

Synthetic tests: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v`.
