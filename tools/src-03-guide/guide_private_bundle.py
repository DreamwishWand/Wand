"""Build a private, one-folder Steam 1.26.2 static Guide bundle.

The underlying quest-search and shard projections retain their authentic
Steam 1.26.1 target; exact original Mission/localization source equality with
1.26.2 is independently established. The new Condition index is genuine
1.26.2. This is *not* a live/server Guide or a player progress validator.

NEVER commit the resulting ZIP or source data to a public repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = 'Wand-Guide-Steam-v1.26.2'
INDEX_SHA = '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d'
CHARACTER_SHA = 'a54e5847f6228b660ace695bd6ee2d36334bacfc26f4903c6afd6ba6bd207b2e'
CATALOGUE_SHA = '3384a3c340c6982bba1132482427dc00f4e371080656f74c383f65fa4812754e'
CONDITION_INDEX_SHA = 'aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f'
CONDITION_MANIFEST_SHA = 'fc1bcae901a41da9ae66a6f31faa7161889ebc7c7887ac6cda82f90718068890'
SHARD_AUDIT_SHA = '99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf'
COMPOSITE_SHA = '96f937c8c07ac6d8b799458299a3014fc1b94d005df172dba03b6d76d298a88c'
SHA_MISSION = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
SOURCE_SHA_CONDITION = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError('DB03_PRIVATE_GUIDE_BUNDLE_' + message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def exact_file(path: Path, sha: str, *, max_bytes: int = 20 * 1024 * 1024) -> bytes:
    require(path.is_file() and not path.is_symlink(), 'MISSING_OR_LINKED_' + path.name)
    require(0 < path.stat().st_size <= max_bytes, 'FILE_SIZE_' + path.name)
    data = path.read_bytes()
    require(len(data) == path.stat().st_size and digest(data) == sha,
            'FULL_BYTE_SHA_MISMATCH_' + path.name)
    return data


def json_object(raw: bytes, schema: str) -> dict:
    value = json.loads(raw.decode('utf-8'))
    require(isinstance(value, dict) and value.get('schema') == schema,
            'SCHEMA_' + schema)
    return value


def shard_entries(audit: dict) -> dict[str, tuple[int, str]]:
    require(audit.get('status') == 'VERIFIED_COMPLETE_ORIGINAL_SHARDS_AND_FRIENDSHIP' or
            audit.get('questShards', {}).get('fullShardFileSha256Available') is True,
            'SHARD_AUDIT_NOT_COMPLETE')
    entries = audit['questShards']['entries']
    require(isinstance(entries, list) and len(entries) == 32,
            'SHARD_FILE_CENSUS')
    expected = {}
    for entry in entries:
        require(isinstance(entry, dict), 'SHARD_AUDIT_ENTRY')
        name = entry.get('file')
        if (not isinstance(name, str) or len(name) != len('quest-shards/part-00.json') or
                not name.startswith('quest-shards/part-') or not name.endswith('.json')):
            raise ValueError('DB03_PRIVATE_GUIDE_BUNDLE_INVALID_SHARD_PATH')
        require(name not in expected and isinstance(entry.get('bytes'), int) and
                entry['bytes'] > 0 and isinstance(entry.get('sha256'), str) and
                len(entry['sha256']) == 64, 'SHARD_AUDIT_DUPLICATE_OR_INVALID')
        expected[name] = (entry['bytes'], entry['sha256'])
    require(set(expected) == {f'quest-shards/part-{i:02d}.json' for i in range(32)},
            'SHARD_NUMBER_CENSUS')
    require(sum(n for n, _ in expected.values()) == 98001716 and
            audit['questShards'].get('verifiedSearchQuestRecordDigests') == 733,
            'SHARD_NATIVE_CENSUS')
    return expected


def source_files(guide: Path, current: Path, audit: Path, composite: Path) -> dict[str, bytes]:
    audit_raw = exact_file(audit, SHARD_AUDIT_SHA)
    audit_obj = json_object(audit_raw, 'wand.db03.guide-shard-source-audit@1')
    original = audit_obj.get('originalOutput', {})
    require(original.get('gameVersion') == '1.26.1' and
            original.get('originalSearchSha256') == INDEX_SHA and
            original.get('nativeSourceSha256') == SHA_MISSION and
            original.get('versionRelabelled') is False,
            'BASELINE_PROVENANCE')
    require(audit_obj.get('targetSourceCompatibleWith', {}).get('gameVersion') == '1.26.2',
            'TARGET_PROVENANCE')
    composite_raw = exact_file(composite, COMPOSITE_SHA)
    composite_obj = json_object(composite_raw, 'wand.db03.guide-source-composite@2')
    # The exact proof files already attest source equivalence and lazy-shard
    # census. The individual ZIP members are independently re-hashed below.
    require(composite_obj.get('target', {}).get('gameVersion') == '1.26.2',
            'COMPOSITE_TARGET')
    out = {
        'guide/quest-search.json': exact_file(guide / 'quest-search.json', INDEX_SHA),
        'guide/characters.json': exact_file(guide / 'characters.json', CHARACTER_SHA),
        'guide/quest-catalogue.json': exact_file(guide / 'quest-catalogue.json', CATALOGUE_SHA),
        'condition-native-index-v2.json': exact_file(current / 'condition-native-index-v2.json', CONDITION_INDEX_SHA),
        'condition-native-index-manifest-v2.json': exact_file(current / 'condition-native-index-manifest-v2.json', CONDITION_MANIFEST_SHA),
        'source-proof/guide-shards-friendship-audit.private.json': audit_raw,
        'source-proof/guide-source-composite-1.26.2-v2.json': composite_raw,
    }
    condition_manifest = json_object(out['condition-native-index-manifest-v2.json'],
                                     'wand.db03.condition-native-index-manifest@2')
    require(condition_manifest.get('privateIndexSha256') == CONDITION_INDEX_SHA and
            condition_manifest.get('privateIndexBytes') == len(out['condition-native-index-v2.json']) and
            condition_manifest.get('source', {}).get('sha256') == SOURCE_SHA_CONDITION and
            condition_manifest.get('target', {}).get('gameVersion') == '1.26.2' and
            condition_manifest.get('counts', {}).get('definitionCount') == 5440 and
            condition_manifest.get('counts', {}).get('missionReferenceLeaves') == 4960,
            'CURRENT_CONDITION_CENSUS')
    index = json_object(out['guide/quest-search.json'], 'wand.db03.quest-search@1')
    require(index.get('target', {}).get('gameVersion') == '1.26.1' and
            index.get('source', {}).get('sha256') == SHA_MISSION and
            index.get('counts', {}).get('missions') == 733,
            'ORIGINAL_SEARCH_CENSUS')
    for key, (n, sha) in sorted(shard_entries(audit_obj).items()):
        data = exact_file(guide / key, sha)
        require(len(data) == n, 'ORIGINAL_SHARD_SIZE_' + key)
        out['guide/' + key] = data
    return out


def make_manifest(files: dict[str, bytes]) -> bytes:
    return (json.dumps({
        'schema': 'wand.db03.owner-guide-bundle@1',
        'target': {'gameVersion': '1.26.2', 'platform': 'Steam',
                   'scope': 'source-verified static Guide only'},
        'sourceProvenance': {
            'originalQuestSearchVersion': '1.26.1',
            'originalQuestFullFileSha256': SHA_MISSION,
            'currentConditionVersion': '1.26.2',
            'originalQuestOutputsRelabelled': False,
            'liveEventsOrSaveProgressVerified': False,
        },
        'counts': {'originalQuestShards': 32, 'searchableQuests': 733,
                   'currentNativeConditions': 5440, 'currentSourceTypedMissionMentions': 4960},
        'files': {name: {'bytes': len(raw), 'sha256': digest(raw)}
                  for name,raw in sorted(files.items())}
    }, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def doc() -> bytes:
    return ('''Dreamwish Wand / Guide / Steam v1.26.2 â owner-private static bundle

Use:
1. Extract this ZIP locally. Do not select the ZIP file itself.
2. Open Dreamwish Wand > Guide and choose the extracted folder
   "Wand-Guide-Steam-v1.26.2" once.
3. The browser checks original Guide index and current Condition v2 source
   fingerprints. It loads each of the 32 quest details only when selected.
4. This contains licensed game-derived text and must remain private.

Quest names and details originate from Steam v1.26.1 extracted outputs whose
Mission source and all 8 localization payload families have been verified
identical to the v1.26.2 originals. Their original version metadata is kept.
Current Condition definitions are truly v1.26.2 (5,440 definitions; 4,960
static Mission references). This is NOT a full live Guide, user-save progress
or account entitlement evaluator. A static Condition reference is not proof
of a mandatory quest prerequisite or an active quest.

The source-proof folder contains owner-private audit summaries. No underlying
Steam source binaries or actual user save files are included.
''').encode('utf-8')


def add_zip(z: ZipFile, name: str, data: bytes) -> None:
    item = ZipInfo(f'{ROOT}/{name}', date_time=(2026, 11, 22, 0, 0, 0))
    item.compress_type = ZIP_DEFLATED
    item.external_attr = 0o100644 << 16
    z.writestr(item, data, compress_type=ZIP_DEFLATED, compresslevel=6)


def build(guide: Path, current: Path, audit: Path, composite: Path, output: Path) -> dict:
    output = output.resolve()
    require(output.suffix.lower() == '.zip' and not output.exists(), 'OUTPUT_PATH_UNSAFE_OR_EXISTS')
    paths = (guide.resolve(), current.resolve(), audit.resolve(), composite.resolve())
    require(not any(output.is_relative_to(p) for p in paths if p.is_dir()), 'OUTPUT_INSIDE_INPUT')
    public_root = Path(__file__).resolve().parents[2]
    if (public_root / 'package.json').is_file():
        require(not output.is_relative_to(public_root), 'OUTPUT_INSIDE_PUBLIC_REPO')
    source = source_files(guide, current, audit, composite)
    source['OWNER-PRIVATE-BUNDLE-MANIFEST.json'] = make_manifest(source)
    source['README.txt'] = doc()
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with ZipFile(output, 'w', allowZip64=True) as z:
            for name, data in sorted(source.items()):
                add_zip(z, name, data)
        # Verify all compressed members, not just the source bytes. No
        # proprietary data enters the public checkout or a remote service.
        with ZipFile(output) as z:
            require(len(z.namelist()) == len(source), 'ZIP_MEMBER_COUNT')
            for name, data in source.items():
                require(z.read(f'{ROOT}/{name}') == data, 'ZIP_ROUNDTRIP_' + name)
        return {'status': 'OWNER_PRIVATE_STATIC_GUIDE_BUNDLE_VERIFIED',
                'file': str(output), 'bytes': output.stat().st_size,
                'sha256': digest(output.read_bytes()), 'members': len(source),
                'originalQuestShards': 32, 'staticConditionDefinitions': 5440,
                'currentSourceTypedMissionReferences': 4960}
    except BaseException:
        output.unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--guide-dir', required=True, type=Path)
    ap.add_argument('--condition-dir', required=True, type=Path)
    ap.add_argument('--shard-audit', required=True, type=Path)
    ap.add_argument('--source-composite', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    args = ap.parse_args(argv)
    print(json.dumps(build(args.guide_dir,args.condition_dir,args.shard_audit,
                           args.source_composite,args.out),ensure_ascii=False,sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
