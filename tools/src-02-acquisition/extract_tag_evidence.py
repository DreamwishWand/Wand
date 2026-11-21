#!/usr/bin/env python3
"""Owner-private Steam 1.26.2 native TagItemData evidence, joined to pinned SRC-02 r5.

Do not promote native Name or DisplayName localization keys to translated names.
Only raw source records are read; no game files are modified or published.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-01-items'))
from steam1262 import varint  # noqa: E402

TAG_SHA256 = 'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4'
PARENT_SHA256 = 'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c'
CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
SCHEMA = 'wand.db02.native-tag-evidence@1'
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_FRAME_BYTES = 1024 * 1024
MAX_ROW_COUNT = 5000


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(value: bool, reason: str) -> None:
    if not value:
        raise ValueError('DB02_TAG_' + reason)


def canonical(data: object) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def regular_bytes(path: Path, limit: int) -> bytes:
    require(path.is_file() and not path.is_symlink(), 'INVALID_INPUT')
    require(0 < path.stat().st_size <= limit, 'INPUT_SIZE')
    return path.read_bytes()


def native_frames(payload: bytes):
    require(0 < len(payload) <= MAX_SOURCE_BYTES, 'TAG_SOURCE_SIZE')
    pos, seen_ids = 0, set()
    while pos < len(payload):
        frame_key, pos = varint(payload, pos)
        size, pos = varint(payload, pos)
        require(0 < size <= MAX_FRAME_BYTES and size <= len(payload) - pos, 'TAG_FRAME_BOUNDS')
        frame = payload[pos:pos + size]
        pos += size
        fields = {}
        sub = 0
        while sub < len(frame):
            tag, sub = varint(frame, sub)
            field, kind = tag >> 3, tag & 7
            require(field > 0 and kind in (0, 1, 2, 5), 'UNSUPPORTED_FIELD')
            if kind == 0:
                value, sub = varint(frame, sub)
            elif kind == 2:
                n, sub = varint(frame, sub)
                require(n <= len(frame) - sub, 'TRUNCATED_FIELD')
                value = frame[sub:sub + n]
                sub += n
            else:
                n = 8 if kind == 1 else 4
                require(n <= len(frame) - sub, 'TRUNCATED_FIELD')
                value = frame[sub:sub + n]
                sub += n
            if field in (1, 2, 3):
                require(field not in fields and kind == (0 if field == 1 else 2), 'DUPLICATE_OR_BAD_NATIVE_FIELD')
                fields[field] = value
        require(set(fields) == {1, 2, 3}, 'REQUIRED_NATIVE_FIELDS')
        item_id = fields[1]
        require(type(item_id) is int and 2_000_000_000 < item_id <= 2_147_483_647 and
                frame_key == item_id - 2_000_000_000, 'TAG_FRAME_ID_MISMATCH')
        require(item_id not in seen_ids, 'DUPLICATE_TAG_ID')
        seen_ids.add(item_id)
        try:
            name = fields[2].decode('utf-8', errors='strict')
            display_key = fields[3].decode('utf-8', errors='strict')
        except UnicodeDecodeError as exc:
            raise ValueError('DB02_TAG_INVALID_UTF8') from exc
        require(0 < len(name) <= 256 and 0 < len(display_key) <= 512 and
                name.strip() == name and display_key.strip() == display_key and
                all(ord(char) >= 32 for char in name + display_key), 'UNSAFE_NATIVE_TEXT')
        yield item_id, frame_key, name, display_key
        require(len(seen_ids) <= MAX_ROW_COUNT, 'TOO_MANY_TAGS')


def refs_from_acquisition(recipes: bytes, membership: bytes) -> tuple[set[int], set[int]]:
    selectors, tags = set(), set()
    require(len(recipes) <= 8 * 1024 * 1024 and len(membership) <= 8 * 1024 * 1024,
            'SOURCE_ROWS_SIZE')
    for ln in recipes.splitlines():
        if not ln:
            continue
        row = json.loads(ln)
        for ing in row.get('ingredients', []):
            if ing.get('kind') == 'anyTag':
                selectors.add(ing['tagId'])
            if ing.get('kind') == 'tagAlternatives':
                selectors.update(ing['tagIds'])
    for ln in membership.splitlines():
        if not ln:
            continue
        row = json.loads(ln)
        tags.update(row['tagIds'])
    require(all(type(i) is int and i > 0 for i in selectors | tags), 'INVALID_TAG_REFERENCE')
    return selectors, tags


def reject_git_output(output: Path) -> None:
    require(not output.exists(), 'REFUSE_OVERWRITE')
    for ancestor in (output.parent, *output.parent.parents):
        require(not (ancestor / '.git').exists(), 'REFUSE_GIT_OUTPUT')


def extract(tag_path: Path, src02_dir: Path, output: Path) -> dict:
    tag_path = tag_path.resolve(strict=True)
    src02_dir = src02_dir.resolve(strict=True)
    output = output.resolve()
    require(src02_dir.is_dir() and output not in src02_dir.parents and src02_dir != output,
            'OVERLAP_INPUT')
    reject_git_output(output)
    source = regular_bytes(tag_path, MAX_SOURCE_BYTES)
    require(digest(source) == TAG_SHA256, 'WRONG_VERSION_TAG_ORIGINAL')
    parent_bytes = regular_bytes(src02_dir / 'manifest.json', 1024 * 1024)
    require(digest(parent_bytes) == PARENT_SHA256, 'UNTRUSTED_SRC02_PARENT')
    parent = json.loads(parent_bytes)
    require(parent.get('schema') == 'wand.src02@1' and parent.get('platform') == 'Steam' and
            parent.get('gameVersion') == '1.26.2' and
            parent.get('source', {}).get('conditionSha256') == CONDITION_SHA256,
            'PARENT_SOURCE_MISMATCH')
    recipe_bytes = regular_bytes(src02_dir / 'recipes.jsonl', 8 * 1024 * 1024)
    membership_bytes = regular_bytes(src02_dir / 'ingredient-selector-membership.jsonl', 8 * 1024 * 1024)
    require(digest(recipe_bytes) == parent['files']['recipes.jsonl'] and
            digest(membership_bytes) == parent['files']['ingredient-selector-membership.jsonl'],
            'TAMPERED_SOURCE_ROWS')
    selectors, member_tags = refs_from_acquisition(recipe_bytes, membership_bytes)
    rows = []
    for item_id, frame_key, native_name, display_key in native_frames(source):
        rows.append({'tagId': item_id, 'frameKey': frame_key,
                     'nativeName': native_name, 'displayNameKey': display_key,
                     'usedByRecipeSelector': item_id in selectors,
                     'usedByIngredientMembership': item_id in member_tags})
    rows.sort(key=lambda r: r['tagId'])
    ids = {r['tagId'] for r in rows}
    require(len(ids) == len(rows) and selectors <= ids and member_tags <= ids,
            'UNRESOLVED_NATIVE_TAGS')
    counts = {'nativeTagDefinitions': len(rows),
              'recipeSelectorTagIds': len(selectors),
              'ingredientMembershipTagIds': len(member_tags),
              'uniqueReferencedTagIds': len(selectors | member_tags)}
    report = {'schema': 'wand.db02.native-tag-evidence-report@1',
              'status': 'verified_native_identity_not_localized_names',
              'counts': counts, 'allReferencedTagsResolved': True,
              'localizedDisplayNamesVerified': False, 'liveEligibilityVerified': False,
              'sourceNativeClass': 'TagItemData', 'nativeTypeEvidenceVersion': 'Steam v1.26.1'}
    rows_bytes = b''.join(canonical(row) for row in rows)
    report_bytes = canonical(report)
    manifest = {'schema': SCHEMA, 'platform': 'Steam', 'gameVersion': '1.26.2',
                'privateOnly': True, 'publicationAuthorized': False,
                'parentSrc02ManifestSha256': PARENT_SHA256,
                'nativeTagSourceSha256': TAG_SHA256,
                'conditionSourceSha256': CONDITION_SHA256,
                'source': 'ddv_Data/StreamingAssets/itemlist/Tag.json',
                'nativeNameField': 2, 'displayNameKeyField': 3,
                'nativeClassEvidence': 'Steam v1.26.1 TagItemData fields, v1.26.2 original SHA256',
                'counts': counts,
                'files': {'tags.jsonl': digest(rows_bytes), 'report.json': digest(report_bytes)}}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.db02-tag-', dir=output.parent) as tmp:
        directory = Path(tmp)
        (directory / 'tags.jsonl').write_bytes(rows_bytes)
        (directory / 'report.json').write_bytes(report_bytes)
        (directory / 'manifest.json').write_bytes(canonical(manifest))
        require(not output.exists(), 'REFUSE_OVERWRITE')
        os.rename(directory, output)
    return {'schema': SCHEMA, 'status': 'verified_private_tag_evidence',
            'manifestSha256': digest(canonical(manifest)), 'counts': counts,
            'privateOnly': True, 'publicationAuthorized': False}


def main():
    p = argparse.ArgumentParser(description='Owner-private current Steam native Tag index')
    p.add_argument('--tag', type=Path, required=True)
    p.add_argument('--src02', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(extract(args.tag, args.src02, args.out), sort_keys=True))


if __name__ == '__main__':
    main()