"""Recheck archived v1.26.2 native source against pinned v1.26.1 and 226 fields.

Reads only IL2CPP dump.cs and public DB-05 source manifests; never a save.
A byte-identical dump is evidence of identical archived dump TEXT only, not
proof of GameAssembly/global-metadata pair identity or Writer compatibility.
"""
import argparse
import hashlib
import json
from pathlib import Path

from verify_native_dump import inspect_native_fields, inspect_nested_native_fields

EVIDENCE_SCHEMA = 'wand.db05.native-source-equivalence@1'
REGISTRY_NAMES = (
    'native1261-observed-fields.v1.json',
    'native1261-nested-fields.v1.json',
    'native1261-deep-fields.v1.json',
)


def digest_and_size(file):
    digest = hashlib.sha256()
    size = 0
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def inspect_source_equivalence(candidate, evidence, registries,
                               baseline=None, allow_changed_source=False):
    if not isinstance(evidence, dict) or evidence.get('schema') != EVIDENCE_SCHEMA:
        raise ValueError('DB05_SOURCE_EQUIVALENCE_MANIFEST_REQUIRED')
    old, new = evidence['baseline'], evidence['candidate']
    if old['sha256'] != new['sha256'] or old['bytes'] != new['bytes']:
        raise ValueError('DB05_RECORDED_SOURCE_EQUIVALENCE_INCONSISTENT')
    if evidence['scope'].get('currentExecutableBytesCompared') is not False or (
        evidence['scope'].get('writerAuthorized') is not False):
        raise ValueError('DB05_UNSAFE_SOURCE_EQUIVALENCE_FLAGS')
    if len(registries) != 3:
        raise ValueError('DB05_THREE_SOURCE_REGISTRIES_REQUIRED')
    sha, size = digest_and_size(candidate)
    candidate_matches = sha == new['sha256'] and size == new['bytes']
    if not candidate_matches and not allow_changed_source:
        raise ValueError('DB05_ARCHIVED_SOURCE_DIGEST_CHANGED')
    baseline_checked = baseline is not None
    baseline_matches = False
    sources_equal_now = False
    if baseline_checked:
        bsha,bsize = digest_and_size(baseline)
        baseline_matches = bsha == old['sha256'] and bsize == old['bytes']
        if not baseline_matches and not allow_changed_source:
            raise ValueError('DB05_ARCHIVED_BASELINE_DIGEST_CHANGED')
        sources_equal_now = bsha == sha and bsize == size
    report = []
    fields_examined = 0
    public_field_differences = []
    for index, native in enumerate(registries):
        if not isinstance(native,dict) or native.get('source',{}).get('sha256') != old['sha256']:
            raise ValueError('DB05_SOURCE_FIELD_REGISTRY_MISMATCH')
        if index == 0:
            receipt = inspect_native_fields(candidate,native,allow_new_source=allow_changed_source)
        else:
            receipt = inspect_nested_native_fields(candidate,native,allow_new_source=allow_changed_source)
        total = len(native['fields'])
        fields_examined += total
        public_field_differences.extend(receipt['differentPublicPaths'])
        report.append({'registered':total,'nativeFieldsMatched':receipt['matchedFieldCount']})
    if fields_examined != evidence['comparison']['registeredNativeFieldTemplates']:
        raise ValueError('DB05_REGISTERED_NATIVE_FIELD_COUNT_MISMATCH')
    matched = fields_examined-len(public_field_differences)
    return {
        'schema':'wand.db05.archived-native-source-check@1',
        'candidateMatchesRecordedDigest':candidate_matches,
        'baselineArtifactChecked':baseline_checked,
        'baselineMatchesRecordedDigest':baseline_matches,
        'archivedSourceFilesEqualNow':sources_equal_now if baseline_checked else None,
        'registeredFieldCount':fields_examined,
        'nativeFieldsMatched':matched,
        'differentPublicPaths':sorted(public_field_differences),
        'perManifest':report,
        'classification':'archived_dump_metadata_unchanged' if candidate_matches
            and (not baseline_checked or (baseline_matches and sources_equal_now))
            and matched == fields_examined else 'review_required',
        'gameExecutableAttested':False,
        'completeSaveSchemaAttested':False,
        'strictCodecRoundTripVerified':False,
        'writerAuthorized':False,
        'exportAuthorized':False
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate',required=True,type=Path)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--source-changed-review',action='store_true',
                        help='Compare changed source for review; never authorize compatibility')
    default=Path(__file__).resolve().parents[2] / 'data/ddv/save'
    parser.add_argument('--evidence',type=Path,
                        default=default/'native1262-dump-equivalence.v1.json')
    parser.add_argument('--registry-dir',type=Path,default=default)
    args=parser.parse_args(argv)
    try:
        evidence=json.loads(args.evidence.read_text(encoding='utf-8'))
        registries=[json.loads((args.registry_dir/name).read_text(encoding='utf-8'))
                    for name in REGISTRY_NAMES]
        result=inspect_source_equivalence(
            args.candidate,evidence,registries,args.baseline,args.source_changed_review
        )
    except (ValueError,OSError,TypeError,KeyError,UnicodeError,json.JSONDecodeError):
        print('DB05_ARCHIVED_SOURCE_CHECK_FAILED')
        return 1
    print(json.dumps(result,ensure_ascii=True,sort_keys=True))
    return 0 if result['classification']=='archived_dump_metadata_unchanged' else 2


if __name__=='__main__':
    raise SystemExit(main())
