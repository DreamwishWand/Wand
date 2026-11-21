"""Safely reuse unchanged private original Steam files across DDV versions.

Input: the SRC-00 *target* source-manifest.json with per-file SHA-256, plus an
owner-private prior original-game directory. A file is reusable only when its
FULL prior bytes match the target digest. Changed/unavailable files remain
'needs_current_source' rather than incorrectly declared absent from the game.
No inference from version proximity, CRC, filename or mtime is permitted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath

from release_pipeline import require, sha

CONTRACT = 'wand.db01.original-source-reuse@1'
HEX = re.compile(r'[0-9a-f]{64}\Z')
VER = re.compile(r'\d+\.\d+\.\d+\Z')
DEFAULT_PREFIXES = ('ddv_Data/StreamingAssets/itemlist/',
                    'ddv_Data/StreamingAssets/Localization/')


def safe_relative(value: object) -> Path:
    require(isinstance(value, str) and value and '\\' not in value and
            '\x00' not in value and not value.startswith('/'), 'BAD_RELATIVE_PATH')
    parts = PurePosixPath(value).parts
    require(parts and all(x not in ('', '.', '..') for x in parts) and
            not any(':' in x or '\r' in x or '\n' in x for x in parts) and
            PurePosixPath(*parts).as_posix() == value, 'BAD_RELATIVE_PATH')
    return Path(*parts)


def no_symlink_components(root: Path, relative: Path) -> bool:
    current = root
    for piece in relative.parts:
        current = current / piece
        if current.is_symlink():
            return False
    return True


def matches_target(record: dict, root: Path, rel: Path) -> bool:
    path = root / rel
    if not no_symlink_components(root, rel) or not path.is_file():
        return False
    if path.stat().st_size != record['size']:
        return False
    return sha(path) == record['sha256']


def write_copy_checked(source: Path, output: Path, target: dict) -> str:
    if output.exists() or output.is_symlink():
        require(output.is_file() and not output.is_symlink() and
                output.stat().st_size == target['size'] and
                sha(output) == target['sha256'], 'REFUSE_OVERWRITE_OR_STALE_CACHE')
        return 'cached'
    output.parent.mkdir(parents=True, exist_ok=True)
    require(not output.exists() and not output.is_symlink(), 'RACE_ON_OUTPUT')
    fd, tmp = tempfile.mkstemp(prefix='.db01-reuse-', dir=output.parent)
    os.close(fd)
    try:
        shutil.copyfile(source, tmp, follow_symlinks=False)
        require(Path(tmp).stat().st_size == target['size'] and
                sha(Path(tmp)) == target['sha256'], 'SOURCE_CHANGED_DURING_COPY')
        os.chmod(tmp,0o600)
        os.link(tmp, output)
        return 'copied'
    finally:
        Path(tmp).unlink(missing_ok=True)


def run(target_scan: Path, prior: Path, out: Path, *,
        expected_scan_sha256: str | None = None,
        prefixes: tuple[str, ...] = DEFAULT_PREFIXES) -> dict:
    target_scan, prior, out = (p.expanduser().resolve() for p in (target_scan, prior, out))
    require(target_scan.is_file() and not target_scan.is_symlink() and
            prior.is_dir(), 'INPUT_MISSING')
    require(out != prior and out not in prior.parents and prior not in out.parents and
            out != target_scan.parent and out not in target_scan.parents and
            target_scan not in out.parents, 'OUTPUT_OVERLAPS_SOURCE')
    for directory in (out, *out.parents):
        require(not (directory / '.git').exists() and
                not ((directory / 'package.json').exists() and
                     (directory / 'src').is_dir()), 'OUTPUT_INSIDE_REPOSITORY')
    scan_sha=sha(target_scan)
    require(expected_scan_sha256 is None or
            (HEX.fullmatch(expected_scan_sha256) and expected_scan_sha256 == scan_sha),
            'TARGET_SCAN_SHA_MISMATCH')
    manifest=json.loads(target_scan.read_bytes())
    require(type(manifest) is dict and manifest.get('schema_version') == 1 and
            manifest.get('status') == 'complete' and
            manifest.get('platform',{}).get('value') == 'steam',
            'UNVERIFIED_TARGET_SCAN')
    version=manifest.get('game_version',{}).get('value')
    require(isinstance(version,str) and VER.fullmatch(version), 'TARGET_VERSION_UNKNOWN')
    records=manifest.get('files')
    require(isinstance(records,list) and records, 'EMPTY_TARGET_SCAN')
    require(prefixes and all(isinstance(p,str) and p.startswith('ddv_Data/') and
                             p.endswith('/') and not '..' in p for p in prefixes),
            'UNSAFE_PREFIX')
    destination=out / ('steam-' + version) / ('source-reuse-' + scan_sha[:20])
    copied=cached=0
    reused=[]
    needs_current=[]
    seen=set()
    for item in records:
        require(type(item) is dict, 'INVALID_TARGET_RECORD')
        rel=safe_relative(item.get('path'))
        path=rel.as_posix()
        require(path not in seen, 'DUPLICATE_TARGET_PATH')
        seen.add(path)
        require(type(item.get('size')) is int and item['size'] >= 0 and
                isinstance(item.get('sha256'),str) and HEX.fullmatch(item['sha256']),
                'INVALID_TARGET_DIGEST')
        if not any(path.startswith(prefix) for prefix in prefixes):
            continue
        # Entire previous-version bytes are hashed, not inferred from metadata.
        if not matches_target(item,prior,rel):
            needs_current.append({'path':path,'status':'needs_current_source'})
            continue
        destination_file=destination / rel
        require(no_symlink_components(destination,rel), 'SYMLINK_OUTPUT')
        result=write_copy_checked(prior / rel,destination_file,item)
        copied += result=='copied'
        cached += result=='cached'
        reused.append({'path':path,'sha256':item['sha256']})
    report={
        'schema':CONTRACT,'privateOnly':True,'publicationAuthorized':False,
        'targetScanSha256':scan_sha,'gameVersion':version,
        'targetVersionEvidence':manifest['game_version'].get('status'),
        'targetHasCachedHashes':any(f.get('hash_source')=='reused' for f in records),
        'candidateFiles':len(reused)+len(needs_current),'reusedFiles':reused,
        'needsCurrentSource':needs_current,
        'note':'Not reusable does not mean absent from game or Drive upload. Rehash target scan to independently verify cached hashes.',
    }
    destination.mkdir(parents=True, exist_ok=True)
    path=destination/'reuse-report.json'
    data=(json.dumps(report,sort_keys=True,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    fd,tmp=tempfile.mkstemp(prefix='.reuse-report-',dir=destination)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp,0o600)
        os.replace(tmp,path)
    finally:
        Path(tmp).unlink(missing_ok=True)
    return {'schema':CONTRACT,'privateOnly':True,'publicationAuthorized':False,
            'status':'reused' if copied==0 else 'copied',
            'gameVersion':version,'candidateFiles':report['candidateFiles'],
            'reusedFiles':len(reused),'copiedFiles':copied,
            'cachedFiles':cached,'needsCurrentSource':len(needs_current),
            'targetScanSha256':scan_sha,'report':str(path),'workspace':str(destination)}


def main() -> None:
    parser=argparse.ArgumentParser(description='SHA-exact private original file reuse for DB-01')
    parser.add_argument('--target-scan',type=Path,required=True,
                        help='SRC-00 source-manifest.json for target Steam game version')
    parser.add_argument('--prior-game',type=Path,required=True,
                        help='Earlier Steam original game files, read-only')
    parser.add_argument('--out',type=Path,required=True,
                        help='Owner-private reused originals, never inside Git or game directory')
    parser.add_argument('--expected-scan-sha256')
    args=parser.parse_args()
    try:
        result=run(args.target_scan,args.prior_game,args.out,
                   expected_scan_sha256=args.expected_scan_sha256)
    except (OSError,ValueError,TypeError,KeyError) as exc:
        parser.exit(1,f'DB-01 source reuse failed: {exc}\n')
    print(json.dumps(result,sort_keys=True,ensure_ascii=False))


if __name__=='__main__':
    main()
