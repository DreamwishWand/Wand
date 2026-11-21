import argparse
import collections
import fnmatch
import hashlib
import json
import os
import pathlib
import re
import sys
import tempfile

SCHEMA = 'wand.src03.guide@1'
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
FAMILIES = ('quests', 'starPaths', 'events')
OUTPUT_NAMES = {'quests': 'quests.json', 'starPaths': 'star-paths.json', 'events': 'events.json'}
REF_KIND = {
    'questid': 'quests', 'questids': 'quests', 'questdependencies': 'quests',
    'requiredquestids': 'quests', 'prerequisitequestids': 'quests',
    'starpathid': 'starPaths', 'starpathids': 'starPaths',
    'eventid': 'events', 'eventids': 'events',
    'itemid': 'items', 'itemids': 'items',
    'rewardid': 'rewards', 'rewardids': 'rewards'
}


def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path, maximum=128 * 1024 * 1024):
    if path.stat().st_size > maximum:
        raise ValueError(f'JSON input exceeds --max-json-mb: {path.name}')
    with path.open('r', encoding='utf-8-sig') as handle:
        return json.load(handle)


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.src03-', suffix='.json', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write('\n')
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def sha_file(path):
    sha = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def scalar_id(value):
    if isinstance(value, (str, int)) and not isinstance(value, bool):
        text = str(value)
        if text.strip():
            return text
    return None


def get_path(obj, path):
    if path in ('$', ''):
        return obj
    current = obj
    for key in path.split('.'):
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current


def first_path(obj, paths):
    for path in paths:
        value = get_path(obj, path)
        if value is not None:
            return value, path
    return None, None


def records_from_tree(tree, spec):
    for name in spec.get('collections', ['$']):
        current = get_path(tree, name)
        if isinstance(current, list):
            return [(v, f'{name}[{n}]') for n, v in enumerate(current) if isinstance(v, dict)]
        if isinstance(current, dict):
            if any(get_path(current, key) is not None for key in spec['id']):
                return [(current, name)]
            if spec.get('key_as_id'):
                return [(dict(v, __src03_dictionary_key__=k), f'{name}.{k}') for k, v in current.items() if isinstance(v, dict)]
    return []


def source_files(root):
    return sorted((p for p in root.rglob('*') if p.is_file()), key=lambda x: x.relative_to(root).as_posix().lower())


def validate_dirs(root, out):
    if not root.is_dir():
        raise ValueError(f'Input directory not found: {root}')
    if root == out or root in out.parents:
        raise ValueError('Output must be outside the input directory, to keep game files read-only')
    if out == root or out in root.parents:
        raise ValueError('Input directory must not be inside the output directory')


def inspect(args):
    root, out = args.input.resolve(), args.output.resolve()
    validate_dirs(root, out)
    files = source_files(root)
    extensions = collections.Counter((p.suffix.lower() or '<none>') for p in files)
    hints = []
    shapes = []
    problems = []
    markers = ('globalgamemanagers', 'gamemanagers', 'resources.assets', 'sharedassets', 'il2cpp', 'global-metadata.dat', 'assetbundle', '.bundle', '.assets', 'localization')
    inspected = 0
    for path in files:
        rel = path.relative_to(root).as_posix()
        if any(marker in rel.lower() for marker in markers):
            hints.append({'file': rel, 'bytes': path.stat().st_size})
        if path.suffix.lower() not in ('.json', '.jsonl', '.ndjson'):
            continue
        if args.limit_files and inspected >= args.limit_files:
            continue
        inspected += 1
        try:
            if path.suffix.lower() == '.json':
                data = read_json(path, args.max_json_mb * 1024 * 1024)
            else:
                with path.open('r', encoding='utf-8-sig') as stream:
                    data = json.loads(stream.readline())
            shape = {'file': rel, 'rootType': type(data).__name__}
            if isinstance(data, dict):
                shape['rootKeys'] = list(data.keys())[:60]
                shape['arrays'] = [{'path': k, 'length': len(v), 'firstKeys': list(v[0].keys())[:50] if v and isinstance(v[0], dict) else []} for k, v in data.items() if isinstance(v, list)][:15]
            if isinstance(data, list):
                shape['length'] = len(data)
                shape['firstKeys'] = list(data[0].keys())[:60] if data and isinstance(data[0], dict) else []
            shapes.append(shape)
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            problems.append({'file': rel, 'error': str(exc)})
    result = {'schema': 'wand.src03.inspect@1', 'fileCount': len(files), 'extensions': dict(sorted(extensions.items())), 'formatHints': hints[:500], 'inspectedJsonFiles': inspected, 'jsonShapes': shapes, 'problems': problems, 'note': 'File-name and JSON-shape observations are not evidence of in-game behaviour.'}
    atomic_json(out / 'inspection.json', result)
    print(f'Inspection: {len(files)} files, {inspected} JSON samples; {out / "inspection.json"}')
    return 0


def localization_tables(folder, maximum):
    tables = {}
    if not folder:
        return tables
    for locale in LOCALES:
        candidates = [folder / f'{locale}.json', folder / f'{locale.lower()}.json']
        file = next((candidate for candidate in candidates if candidate.is_file()), None)
        if not file:
            continue
        data = read_json(file, maximum)
        if isinstance(data, dict):
            for wrapper in ('Strings', 'strings', 'Entries', 'entries', 'Localization', 'localization'):
                if isinstance(data.get(wrapper), dict):
                    data = data[wrapper]
                    break
            tables[locale] = {str(k): v for k, v in data.items() if isinstance(v, str)}
    return tables


def nested_names(obj):
    for key in ('LocalizedNames', 'localizedNames', 'Localizations', 'localizations'):
        value = obj.get(key)
        if isinstance(value, dict):
            return {locale: value[locale] for locale in LOCALES if isinstance(value.get(locale), str)}
    return {}


def is_reference_scalar(value):
    return scalar_id(value) is not None


def refs_from_value(value, trail=''):
    refs = []
    if isinstance(value, dict):
        for key, part in value.items():
            kind = REF_KIND.get(re.sub(r'[^a-z0-9]', '', key.lower()))
            next_trail = f'{trail}.{key}' if trail else key
            if kind:
                parts = part if isinstance(part, list) else [part]
                for index, element in enumerate(parts):
                    native = scalar_id(element)
                    if native is not None:
                        refs.append({'kind': kind, 'id': native, 'field': next_trail + (f'[{index}]' if isinstance(part, list) else '')})
            refs.extend(refs_from_value(part, next_trail))
    elif isinstance(value, list):
        for index, part in enumerate(value):
            if isinstance(part, (dict, list)):
                refs.extend(refs_from_value(part, f'{trail}[{index}]'))
    return refs


def project(raw, family, spec, origin, locale_maps):
    raw_id, id_field = first_path(raw, spec['id'])
    if raw_id is None and spec.get('key_as_id'):
        raw_id, id_field = raw.get('__src03_dictionary_key__'), '__src03_dictionary_key__'
    native_id = scalar_id(raw_id)
    if native_id is None:
        return None, {'kind': 'missing_id', 'file': origin['file'], 'recordPath': origin['recordPath']}
    title, title_field = first_path(raw, spec.get('title', []))
    title_key, key_field = first_path(raw, spec.get('titleKey', []))
    name_key = scalar_id(title_key)
    names = nested_names(raw)
    if name_key:
        for locale in LOCALES:
            if locale not in names and isinstance(locale_maps.get(locale, {}).get(name_key), str):
                names[locale] = locale_maps[locale][name_key]
    fields = {}
    field_paths = {}
    reference_fields = {}
    for target, possible in spec.get('fields', {}).items():
        data, path = first_path(raw, possible)
        if data is not None:
            fields[target] = data
            field_paths[target] = path
            reference_fields[path] = data
    refs = refs_from_value(reference_fields)
    refs.sort(key=lambda ref: (ref['kind'], ref['id'], ref['field']))
    ref_unique = list({(x['kind'], x['id'], x['field']): x for x in refs}.values())
    result = {
        'id': native_id, 'nativeIdType': 'integer' if isinstance(raw_id, int) else 'string',
        'nameKey': name_key, 'names': names, 'sourceTitle': title if isinstance(title, str) else None,
        'fields': fields, 'nativeRefs': ref_unique,
        'evidence': {'source': origin, 'idField': id_field, 'titleField': title_field, 'nameKeyField': key_field, 'fieldPaths': field_paths}
    }
    return result, None


def read_entries(path, spec, maximum):
    suffix = path.suffix.lower()
    if suffix in ('.jsonl', '.ndjson'):
        with path.open('r', encoding='utf-8-sig') as stream:
            for index, line in enumerate(stream):
                if not line.strip():
                    continue
                item = json.loads(line)
                if isinstance(item, dict):
                    yield item, f'line[{index + 1}]'
        return
    tree = read_json(path, maximum)
    yield from records_from_tree(tree, spec)


def file_families(relative, config):
    name = pathlib.PurePosixPath(relative).name
    return [family for family, spec in config['families'].items() if any(fnmatch.fnmatchcase(name.lower(), pattern.lower()) for pattern in spec.get('files', []))]


def load_ref_index(path, maximum):
    if not path:
        return {}
    data = read_json(path, maximum)
    if not isinstance(data, dict):
        raise ValueError('--reference-index must be a JSON object keyed by native-reference family')
    return {k: set(filter(None, (scalar_id(v) for v in values))) for k, values in data.items() if isinstance(values, list)}


def old_records(path):
    if not path:
        return {}
    old = {}
    for family in FAMILIES:
        file = path / 'guide' / OUTPUT_NAMES[family]
        if file.is_file():
            data = read_json(file)
            for record in data.get('records', []):
                old[(family, record['id'])] = record
    return old


def meaningful(record):
    return {k: v for k, v in record.items() if k != 'evidence'}


def compute_diff(current, previous):
    old = old_records(previous)
    new = {(family, item['id']): item for family, records in current.items() for item in records}
    difference = {'added': [], 'removed': [], 'changed': []}
    for key in sorted(new.keys() - old.keys()):
        difference['added'].append({'family': key[0], 'id': key[1]})
    for key in sorted(old.keys() - new.keys()):
        difference['removed'].append({'family': key[0], 'id': key[1]})
    for key in sorted(old.keys() & new.keys()):
        if meaningful(old[key]) != meaningful(new[key]):
            difference['changed'].append({'family': key[0], 'id': key[1]})
    return difference


def extract(args):
    root, out = args.input.resolve(), args.output.resolve()
    validate_dirs(root, out)
    if not args.version.strip():
        raise ValueError('A pinned --version is mandatory')
    maximum = args.max_json_mb * 1024 * 1024
    rule_path = args.rules or pathlib.Path(__file__).with_name('rules.json')
    rules = read_json(rule_path)
    if rules.get('schema') != 'wand.src03.rules@1' or set(rules.get('families', {})) != set(FAMILIES):
        raise ValueError('Rules must declare exactly quests, starPaths, events in wand.src03.rules@1')
    rule_hash = digest(stable_json(rules).encode())
    locales = localization_tables(args.locales_dir, maximum)
    loc_hash = digest(stable_json(locales).encode())
    all_files = source_files(root)
    candidates = [(file, file_families(file.relative_to(root).as_posix(), rules)) for file in all_files if file.suffix.lower() in ('.json', '.jsonl', '.ndjson')]
    candidates = [(file, found) for file, found in candidates if found]
    if args.limit_files:
        if args.small:
            selected = []
            for family in FAMILIES:
                selected.extend([(file, found) for file, found in candidates if found == [family]][:args.limit_files])
            candidates = sorted(selected, key=lambda row: row[0].relative_to(root).as_posix().lower())
        else:
            candidates = candidates[:args.limit_files]
    collected = {family: [] for family in FAMILIES}
    problems, examined, cache_hits = [], [], 0
    cache_root = out / 'cache' / 'files'
    for index, (file, matches) in enumerate(candidates):
        relative = file.relative_to(root).as_posix()
        if len(matches) != 1:
            problems.append({'kind': 'ambiguous_family', 'file': relative, 'families': matches})
            continue
        family = matches[0]
        checksum = sha_file(file)
        cache_file = cache_root / (digest(relative.encode()) + '.json')
        cache = None
        reused_cache = False
        if args.resume and cache_file.is_file():
            try:
                cache = read_json(cache_file, maximum)
                if any((cache.get('sha256') != checksum, cache.get('rulesHash') != rule_hash, cache.get('localesHash') != loc_hash, cache.get('limitRecords') != args.limit_records, cache.get('family') != family)):
                    cache = None
            except (OSError, ValueError, json.JSONDecodeError):
                cache = None
        if cache is None:
            rows, issues = [], []
            try:
                count = 0
                for raw, row_path in read_entries(file, rules['families'][family], maximum):
                    if args.limit_records and count >= args.limit_records:
                        break
                    count += 1
                    origin = {'file': relative, 'recordPath': row_path, 'sha256': checksum}
                    record, issue = project(raw, family, rules['families'][family], origin, locales)
                    if record is not None:
                        rows.append(record)
                    if issue is not None:
                        issues.append(issue)
                if not rows:
                    issues.append({'kind': 'no_records_mapped', 'file': relative, 'family': family})
            except (OSError, UnicodeError, ValueError, json.JSONDecodeError, RecursionError) as error:
                issues.append({'kind': 'read_error', 'file': relative, 'error': str(error)})
            cache = {'sha256': checksum, 'rulesHash': rule_hash, 'localesHash': loc_hash, 'limitRecords': args.limit_records, 'family': family, 'rows': rows, 'issues': issues}
            atomic_json(cache_file, cache)
        else:
            cache_hits += 1
            reused_cache = True
        collected[family].extend(cache['rows'])
        problems.extend(cache['issues'])
        examined.append({'file': relative, 'family': family, 'sha256': checksum, 'records': len(cache['rows']), 'fromCache': reused_cache})
        if (index + 1) % 100 == 0:
            print(f'Processed {index + 1}/{len(candidates)} source files', flush=True)
    unique, duplicates = {}, []
    for family in FAMILIES:
        index = {}
        for record in collected[family]:
            old = index.get(record['id'])
            if old is not None:
                duplicates.append({'family': family, 'id': record['id'], 'first': old['evidence']['source'], 'second': record['evidence']['source'], 'conflict': meaningful(old) != meaningful(record)})
            else:
                index[record['id']] = record
        unique[family] = [index[id] for id in sorted(index)]
    reference_index = {family: {record['id'] for record in rows} for family, rows in unique.items()}
    reference_index.update(load_ref_index(args.reference_index, maximum))
    relations, unresolved, unchecked, locale_missing = [], [], [], []
    for family, rows in unique.items():
        for row in rows:
            for locale in LOCALES:
                if locale not in row['names']:
                    locale_missing.append({'family': family, 'id': row['id'], 'locale': locale})
            for ref in row['nativeRefs']:
                status = 'unchecked'
                if ref['kind'] in reference_index:
                    status = 'resolved' if ref['id'] in reference_index[ref['kind']] else 'unresolved'
                entry = {'fromFamily': family, 'fromId': row['id'], 'toFamily': ref['kind'], 'toId': ref['id'], 'sourceField': ref['field'], 'status': status}
                relations.append(entry)
                if status == 'unresolved':
                    unresolved.append(entry)
                elif status == 'unchecked':
                    unchecked.append(entry)
    relations.sort(key=lambda x: (x['fromFamily'], x['fromId'], x['toFamily'], x['toId'], x['sourceField']))
    target = {'platform': args.platform, 'gameVersion': args.version, 'buildId': args.build_id}
    for family, records in unique.items():
        atomic_json(out / 'guide' / OUTPUT_NAMES[family], {'schema': SCHEMA, 'target': target, 'family': family, 'records': records, 'availability': 'not_evaluated'})
    atomic_json(out / 'database' / 'relations.json', {'schema': 'wand.src03.refs@1', 'target': target, 'relations': relations})
    atomic_json(out / 'unresolved.json', {'references': unresolved, 'uncheckedExternalReferences': unchecked})
    atomic_json(out / 'duplicates.json', duplicates)
    atomic_json(out / 'missing-locales.json', locale_missing)
    if args.previous:
        atomic_json(out / 'diff.json', {'previous': str(args.previous), 'target': target, **compute_diff(unique, args.previous)})
    status = 'NEEDS_SOURCE_MAPPING' if not any(unique.values()) else 'PARTIAL' if (args.limit_files or args.limit_records or problems or any(d['conflict'] for d in duplicates)) else 'EXTRACTED_UNVERIFIED'
    manifest = {
        'schema': 'wand.src03.manifest@1', 'target': target, 'sourceRulesSha256': rule_hash,
        'sourceLocaleTableSha256': loc_hash, 'sources': examined,
        'counts': {family: len(unique[family]) for family in FAMILIES},
        'status': status, 'limits': {'files': args.limit_files, 'recordsPerFile': args.limit_records},
        'warnings': {'sourceErrors': len(problems), 'duplicates': len(duplicates), 'unresolvedReferences': len(unresolved), 'uncheckedExternalReferences': len(unchecked), 'missingLocalizations': len(locale_missing)},
        'notes': ['Static definitions only; prerequisites and tasks are not validated in-game behaviours.', 'Event dates do not imply live availability.', 'No fabricated guide text or localization fallback was added.']
    }
    atomic_json(out / 'manifest.json', manifest)
    atomic_json(out / 'report.json', {'status': status, 'target': target, 'sourceCandidates': len(candidates), 'cacheHits': cache_hits, 'issues': problems, 'counts': manifest['counts'], 'warnings': manifest['warnings']})
    print(f'{status}: {manifest["counts"]}; {len(problems)} source issues, {len(unresolved)} unresolved refs, {cache_hits} cache hits; output={out}')
    return 2 if status == 'NEEDS_SOURCE_MAPPING' else 0


def main():
    parser = argparse.ArgumentParser(description='Wand SRC-03 offline Guide source extractor')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('inspect', 'extract'):
        p = commands.add_parser(name)
        p.add_argument('--input', type=pathlib.Path, required=True)
        p.add_argument('--output', type=pathlib.Path, required=True)
        p.add_argument('--max-json-mb', type=int, default=128)
        p.add_argument('--limit-files', type=int, default=40 if name == 'inspect' else 0)
        if name == 'extract':
            p.add_argument('--version', required=True)
            p.add_argument('--platform', default='unknown')
            p.add_argument('--build-id', default=None)
            p.add_argument('--rules', type=pathlib.Path)
            p.add_argument('--locales-dir', type=pathlib.Path)
            p.add_argument('--reference-index', type=pathlib.Path)
            p.add_argument('--previous', type=pathlib.Path)
            p.add_argument('--limit-records', type=int, default=0)
            p.add_argument('--small', action='store_true')
            p.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    if args.max_json_mb <= 0 or args.limit_files < 0 or (args.command == 'extract' and args.limit_records < 0):
        parser.error('Size and limit arguments must be non-negative; --max-json-mb must be positive')
    if args.command == 'extract' and args.small:
        args.limit_files = args.limit_files or 10
        args.limit_records = args.limit_records or 5
    try:
        return inspect(args) if args.command == 'inspect' else extract(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f'SRC-03 error: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())