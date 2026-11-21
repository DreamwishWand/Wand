"""Pack an independently pinned, exact-source current SRC-02 snapshot for private browser use.

Only the owner should distribute the output. Refuses a destination inside Git.
Does not change the source bundle or publish artifacts to Pages.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

FILES = (
    'manifest.json', 'recipes.jsonl', 'acquisitions.jsonl', 'loot-tables.jsonl',
    'shop-offers.jsonl', 'stall-sources.jsonl', 'related-items.jsonl',
    'ingredient-selector-membership.jsonl', 'condition-gates.jsonl',
    'condition-definitions.jsonl', 'report.json', 'unresolved.json',
)


def refuse_public_destination(output: Path) -> None:
    if output.exists():
        raise ValueError('SRC02_PRIVATE_PACK_REFUSE_OVERWRITE')
    for parent in (output.parent, *output.parent.parents):
        if (parent / '.git').exists():
            raise ValueError('SRC02_PRIVATE_PACK_REFUSE_GIT_DIRECTORY')


def pack(directory: Path, output: Path, manifest_sha256: str,
         src01_manifest: Path | None = None) -> dict:
    directory = directory.resolve()
    output = output.resolve()
    if not directory.is_dir() or any((directory / file).is_symlink() for file in FILES):
        raise ValueError('SRC02_PRIVATE_PACK_UNTRUSTED_SOURCE')
    refuse_public_destination(output)
    if not isinstance(manifest_sha256, str) or len(manifest_sha256) != 64 or any(
            c not in '0123456789abcdef' for c in manifest_sha256):
        raise ValueError('SRC02_PRIVATE_PACK_BAD_INDEPENDENT_PIN')
    verify = Path(__file__).resolve().parent / 'verify_bundle.mjs'
    command = ['node', str(verify), 'verify', '--dir', str(directory),
               '--expected-manifest-sha256', manifest_sha256]
    if src01_manifest is not None:
        command.extend(('--src01-manifest', str(src01_manifest.resolve())))
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        # No untrusted source details in the error: the Node verifier already
        # provides the reason when directly invoked by the owner.
        raise ValueError('SRC02_PRIVATE_PACK_SOURCE_NOT_ADMITTED') from exc
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.src02-private-', suffix='.zip', dir=output.parent)
    os.close(fd)
    try:
        with ZipFile(temp, 'w', compression=ZIP_DEFLATED, compresslevel=6,
                     allowZip64=False) as zipfile:
            for file in FILES:
                zipfile.write(directory / file, file)
        os.rename(temp, output)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
    return {'schema': 'wand.src02.private-browser-pack@1',
            'privateOnly': True, 'publicationAuthorized': False,
            'manifestSha256': manifest_sha256, 'zipMemberCount': len(FILES),
            'archiveBytes': output.stat().st_size}


def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument('--dir', required=True, type=Path)
    cli.add_argument('--out', required=True, type=Path)
    cli.add_argument('--expected-manifest-sha256', required=True)
    cli.add_argument('--src01-manifest', type=Path)
    args = cli.parse_args()
    result = pack(args.dir, args.out, args.expected_manifest_sha256, args.src01_manifest)
    sys.stdout.write(json.dumps(result, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()