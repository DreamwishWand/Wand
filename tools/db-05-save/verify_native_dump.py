"""Read-only source-authenticated DB-05 native-field type verifier.

Input: a local Il2CppDumper dump.cs and the public DB-05 field registry.
Never opens or prints actual saves, item IDs, personal contents, or credentials.
A matching old native schema does NOT attest the current game's build/Writer.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

SCHEMA = 'wand.db05.native1261-observed-field-witnesses@1'
MESSAGES = {'Profile', 'ProfilePlayer', 'ProfileWorld'}
CLASS_HEADER = re.compile(r'^public sealed class ([A-Za-z][A-Za-z0-9_.]*) :')
NESTED_SCHEMA = 'wand.db05.native1261-nested-field-witnesses@1'
DEEP_SCHEMA = 'wand.db05.native1261-deep-field-witnesses@1'
NESTED_CLASSES = frozenset({
    'Pet', 'Cookbook', 'ToolInfo', 'RoyalDutyProgress', 'MultiItemInstance',
    'FastTravel', 'Village', 'House', 'DecorationPresetData', 'FloatingIsland',
    'BuildingInfo', 'Critter', 'GridCollection', 'PremadeDecorationPresets'
})
DEEP_CLASSES = frozenset({
    'ItemInstance', 'ListInventory', 'ListInventory.Types.Data', 'Grid',
    'DiffGrid', 'GridObject', 'House.Types.Floor', 'House.Types.Room',
    'Village.Types.VillageArea', 'CookingHistory', 'Character', 'Story',
    'ObjectLimitData', 'ToolUpgrades', 'FishingPerVillageArea', 'StoreInfo',
    'CharacterRestaurantOrder'
})

FIELD_NUMBER = re.compile(r'^\s*public const int ([A-Za-z0-9_]+)FieldNumber = ([0-9]+);')
PROPERTY = re.compile(r'^\s*public (.+?) ([A-Za-z0-9_]+) \{ get;')
NATIVE_PREFIX = {'Profile': '', 'ProfilePlayer': '/Player', 'ProfileWorld': '/World'}


def read_native_types(dump_path, additional_classes=()):
    """Stream 89MB+ native dumps without creating an extra save/JSON buffer."""
    allowed = MESSAGES | set(additional_classes)
    known = {}
    current = None
    section = None
    numbers = {}
    properties = {}
    def commit():
        if current is not None:
            known[current] = {'numbers': dict(numbers), 'types': dict(properties)}
    with Path(dump_path).open('r', encoding='utf-8-sig', errors='strict') as stream:
        for line in stream:
            match = CLASS_HEADER.match(line)
            if match and match.group(1) in allowed:
                commit()
                current = match.group(1)
                section = None
                numbers = {}
                properties = {}
                continue
            if current is None:
                continue
            if line.startswith('}') and line.strip() == '}':
                commit()
                current, section = None, None
                numbers, properties = {}, {}
                continue
            if line.strip() == '// Fields':
                section = 'fields'
                continue
            if line.strip() == '// Properties':
                section = 'properties'
                continue
            if line.strip() == '// Methods':
                section = None
                continue
            if section == 'fields':
                m = FIELD_NUMBER.match(line)
                if m:
                    numbers[m.group(1)] = int(m.group(2))
            elif section == 'properties':
                m = PROPERTY.match(line)
                if m:
                    properties[m.group(2)] = m.group(1).strip()
    commit()
    return known


def hash_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_native_fields(dump_path, manifest, allow_new_source=False):
    if not isinstance(manifest, dict) or manifest.get('schema') != SCHEMA:
        raise ValueError('DB05_NATIVE_MANIFEST_REQUIRED')
    source = manifest.get('source')
    fields = manifest.get('fields')
    if not isinstance(source, dict) or not isinstance(fields, list) or not fields:
        raise ValueError('DB05_NATIVE_MANIFEST_INVALID')
    expected = source.get('sha256')
    if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('DB05_NATIVE_SHA256_REQUIRED')
    actual = hash_file(dump_path)
    if actual != expected and not allow_new_source:
        raise ValueError('DB05_NATIVE_SOURCE_HASH_MISMATCH')
    native = read_native_types(dump_path)
    if not MESSAGES.issubset(native):
        raise ValueError('DB05_REQUIRED_NATIVE_MESSAGES_MISSING')
    observed = set()
    problems = []
    for entry in fields:
        if not isinstance(entry, dict) or entry.get('writerAuthorized') is not False:
            raise ValueError('DB05_NATIVE_FIELD_CONTRACT_INVALID')
        message, path = entry.get('nativeMessage'), entry.get('path')
        if message not in MESSAGES or not isinstance(path, str) or not path.startswith(NATIVE_PREFIX[message] + '/'):
            raise ValueError('DB05_NATIVE_FIELD_PATH_INVALID')
        name = path[len(NATIVE_PREFIX[message]) + 1:]
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', name):
            raise ValueError('DB05_NATIVE_FIELD_NOT_DIRECT_PROPERTY')
        if path in observed:
            raise ValueError('DB05_DUPLICATE_NATIVE_FIELD')
        observed.add(path)
        item = native[message]
        if item['numbers'].get(name) != entry.get('protobufFieldNumber') or item['types'].get(name) != entry.get('nativePropertyType'):
            problems.append(path)
    return {
        'schema': 'wand.db05.native-dump-verification@1',
        'sourceMatchesPinnedDigest': actual == expected,
        'registeredFieldCount': len(fields),
        'matchedFieldCount': len(fields) - len(problems),
        'differentPublicPaths': sorted(problems),
        'canClaimCurrentGameBuild': False,
        'strictCodecVerified': False,
        'writerAuthorized': False
    }


def inspect_nested_native_fields(dump_path, manifest, allow_new_source=False):
    """Read only: verify known nested path template, Protobuf number and C# type.

    New or changed source files require explicit --allow-new-source. Matching
    never authorizes use of private save values, serialization, or writing.
    """
    if not isinstance(manifest, dict) or manifest.get('schema') not in (NESTED_SCHEMA, DEEP_SCHEMA):
        raise ValueError('DB05_NESTED_NATIVE_MANIFEST_REQUIRED')
    allowed_classes = NESTED_CLASSES if manifest['schema'] == NESTED_SCHEMA else DEEP_CLASSES
    source = manifest.get('source')
    fields = manifest.get('fields')
    if not isinstance(source, dict) or not isinstance(fields, list) or not fields:
        raise ValueError('DB05_NESTED_NATIVE_MANIFEST_INVALID')
    expected = source.get('sha256')
    if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('DB05_NESTED_NATIVE_SHA256_REQUIRED')
    actual = hash_file(dump_path)
    if actual != expected and not allow_new_source:
        raise ValueError('DB05_NESTED_NATIVE_SOURCE_HASH_MISMATCH')
    required = {row.get('nativeMessage') for row in fields if isinstance(row, dict)}
    if not required.issubset(allowed_classes):
        raise ValueError('DB05_NESTED_NATIVE_CLASS_OR_PATH_INVALID')
    native = read_native_types(dump_path, required)
    if not required.issubset(native):
        raise ValueError('DB05_NESTED_NATIVE_CLASSES_MISSING')
    observed = set()
    mismatches = []
    for row in fields:
        if not isinstance(row, dict) or row.get('writable') is not False:
            raise ValueError('DB05_NESTED_NATIVE_FIELD_INVALID')
        message, path = row.get('nativeMessage'), row.get('path')
        if message not in allowed_classes or not isinstance(path, str):
            raise ValueError('DB05_NESTED_NATIVE_CLASS_OR_PATH_INVALID')
        if not re.fullmatch(
            r'/(?:Player|World)/(?:[A-Za-z][A-Za-z0-9]*(?:\[\])?|\{id\})(?:/(?:[A-Za-z][A-Za-z0-9]*(?:\[\])?|\{id\}))+',
            path
        ):
            raise ValueError('DB05_NESTED_NATIVE_PATH_INVALID')
        property_name = path.rsplit('/', 1)[-1]
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', property_name):
            raise ValueError('DB05_NESTED_NATIVE_NOT_DIRECT_PROPERTY')
        if path in observed:
            raise ValueError('DB05_NESTED_DUPLICATE_FIELD_PATH')
        observed.add(path)
        item = native[message]
        if item['numbers'].get(property_name) != row.get('protobufFieldNumber') or (
            item['types'].get(property_name) != row.get('nativePropertyType')
        ):
            mismatches.append(path)
    return {
        'schema': 'wand.db05.nested-native-dump-verification@1',
        'sourceMatchesPinnedDigest': actual == expected,
        'registeredFieldCount': len(fields),
        'matchedFieldCount': len(fields) - len(mismatches),
        'differentPublicPaths': sorted(mismatches),
        'currentGameNativeAttested': False,
        'strictCodecVerified': False,
        'writerAuthorized': False
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump', required=True, type=Path)
    parser.add_argument('--manifest', type=Path,
                        default=Path(__file__).resolve().parents[2] /
                        'data/ddv/save/native1261-observed-fields.v1.json')
    parser.add_argument('--allow-new-source', action='store_true')
    parser.add_argument('--nested', action='store_true', help='Verify nested native field manifest')
    parser.add_argument('--deep', action='store_true', help='Verify deep world/inventory field manifest')
    args = parser.parse_args(argv)
    if args.nested and args.deep:
        parser.error('Choose exactly one of --nested and --deep')
    if args.deep and args.manifest == Path(__file__).resolve().parents[2] / 'data/ddv/save/native1261-observed-fields.v1.json':
        args.manifest = args.manifest.parent / 'native1261-deep-fields.v1.json'
    if args.nested and args.manifest == Path(__file__).resolve().parents[2] / 'data/ddv/save/native1261-observed-fields.v1.json':
        args.manifest = args.manifest.parent / 'native1261-nested-fields.v1.json'
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    try:
        result = (inspect_nested_native_fields(args.dump, manifest, args.allow_new_source)
                  if args.nested or args.deep else inspect_native_fields(args.dump, manifest, args.allow_new_source))
    except (ValueError, UnicodeError, OSError):
        print('DB05_NATIVE_VERIFICATION_FAILED')
        return 1
    # Public path names only; never output native source content or save values.
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))
    return 0 if result['matchedFieldCount'] == result['registeredFieldCount'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
