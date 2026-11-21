"""Privacy-constrained, read-only discovery of native Protobuf JSON field shapes.

Inputs: locally decoded private profile JSON files AND owner-provided IL2CPP
source dump.cs. Never exports save values, map keys, IDs, or filenames.
Generated candidate reports require manual structural review and MUST remain
outside Git. No Codec, ownership or Writer permission is produced.
"""
import argparse
from collections import Counter, deque
import json
from pathlib import Path
import re

from verify_native_dump import FIELD_NUMBER, PROPERTY, hash_file

DISCOVERY_SCHEMA = 'wand.db05.private-native-shape-discovery@1'
CLASS_HEADER = re.compile(r'^public sealed class ([A-Za-z][A-Za-z0-9_.]*) : .*IMessage')
FIELD_SEGMENT = re.compile(r'^[A-Za-z][A-Za-z0-9_]*$')
SENSITIVE = re.compile(r'(Ownership|Entitlement|Account|Auth|Password|Token|Receipt|Purchase|DLC|Platform)', re.I)
REGISTRIES = (
    'legacy626-fields.v1.json',
    'common626643-fields.v1.json',
    'native1261-observed-fields.v1.json',
    'native1261-nested-fields.v1.json',
    'native1261-deep-fields.v1.json',
)


def public_type(value):
    if value is None: return 'null'
    if isinstance(value, bool): return 'boolean'
    if isinstance(value, dict): return 'object'
    if isinstance(value, list): return 'array'
    if isinstance(value, int): return 'integer'
    if isinstance(value, float): return 'number'
    if isinstance(value, str): return 'string'
    return 'unverified'


def parse_native_messages(source_file):
    """Stream a large native dump, retaining just Protobuf field tags/types."""
    messages = {}
    current = section = None
    numbers = {}
    properties = {}

    def commit():
        if current is None: return
        rows = [(key, number, properties[key])
                for key, number in numbers.items()
                if key in properties and FIELD_SEGMENT.fullmatch(key)]
        if rows: messages[current] = tuple(sorted(rows, key=lambda r: (r[1],r[0])))

    with Path(source_file).open('r', encoding='utf-8-sig') as stream:
        for line in stream:
            match = CLASS_HEADER.match(line)
            if match:
                commit()
                current, section = match.group(1), None
                numbers, properties = {}, {}
                continue
            if current is None: continue
            if line.strip() == '}' and line.startswith('}'):
                commit()
                current, section = None, None
                numbers, properties = {}, {}
                continue
            if line.strip() == '// Fields':
                section = 'fields'
            elif line.strip() == '// Properties':
                section = 'properties'
            elif line.strip() == '// Methods':
                section = None
            elif section == 'fields':
                number = FIELD_NUMBER.match(line)
                if number: numbers[number.group(1)] = int(number.group(2))
            elif section == 'properties':
                prop = PROPERTY.match(line)
                if prop: properties[prop.group(2)] = prop.group(1).strip()
    commit()
    return messages


def native_child(property_type):
    """Return (target message class, array/map path suffix) when applicable."""
    if property_type.startswith('RepeatedField<') and property_type.endswith('>'):
        return property_type[len('RepeatedField<'):-1].strip(), '[]'
    if property_type.startswith('MapField<') and property_type.endswith('>'):
        parts = property_type[len('MapField<'):-1]
        depth = 0
        for i, char in enumerate(parts):
            if char == '<': depth += 1
            elif char == '>': depth -= 1
            elif char == ',' and depth == 0:
                return parts[i+1:].strip(), '/{id}'
        return None, None
    return property_type, ''


def walk_public_template(decoded, path, wildcard_limit=32, node_limit=1024):
    """Walk only public native property names; discard user map keys immediately."""
    nodes = [decoded]
    sampled = False
    for token in path.lstrip('/').split('/'):
        next_nodes = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if token == '{id}':
                if len(node) > wildcard_limit: sampled = True
                next_nodes.extend(list(node.values())[:wildcard_limit])
            elif token.endswith('[]'):
                children = node.get(token[:-2])
                if isinstance(children, list):
                    if len(children) > wildcard_limit: sampled = True
                    next_nodes.extend(children[:wildcard_limit])
            elif token in node:
                next_nodes.append(node[token])
            if len(next_nodes) > node_limit:
                sampled = True
                next_nodes = next_nodes[:node_limit]
                break
        nodes = next_nodes[:node_limit]
        if not nodes:
            break
    return nodes, sampled


def canonical_public_template(path):
    return re.sub(r'/\{[A-Za-z][A-Za-z0-9]*\}(?=/|$)', '/{id}', path)


def known_public_templates(registry_dir):
    paths = set()
    for filename in REGISTRIES:
        document = json.loads((Path(registry_dir) / filename).read_text(encoding='utf-8'))
        for field in document['fields']:
            path = field['path']
            if not isinstance(path, str) or not path.startswith('/'):
                raise ValueError('DB05_KNOWN_PUBLIC_PATH_INVALID')
            paths.add(canonical_public_template(path))
    return paths


def discover(native_messages, decoded_profiles, known_paths=(), max_depth=7,
             wildcard_limit=32, node_limit=1024, max_candidates=20000):
    if not isinstance(decoded_profiles, (list, tuple)) or len(decoded_profiles) < 2:
        raise ValueError('DB05_MULTIPLE_PRIVATE_PROFILES_REQUIRED')
    if not all(isinstance(doc, dict) for doc in decoded_profiles):
        raise ValueError('DB05_DECODED_PROFILE_OBJECTS_REQUIRED')
    if 'Profile' not in native_messages:
        raise ValueError('DB05_NATIVE_PROFILE_CLASS_REQUIRED')
    if not 0 < wildcard_limit <= 256 or not 0 < node_limit <= 4096:
        raise ValueError('DB05_DISCOVERY_LIMIT_INVALID')

    existing = {canonical_public_template(p) for p in known_paths}
    seen = set()
    candidates = []
    count = Counter()
    queue = deque([('Profile','',0)])
    while queue:
        class_name, parent, depth = queue.popleft()
        if depth > max_depth or (class_name, parent) in seen:
            continue
        seen.add((class_name, parent))
        for name, tag, native_type in native_messages.get(class_name, ()):
            path = parent + '/' + name
            if SENSITIVE.search(path):
                count['sensitive_paths_excluded'] += 1
                continue
            observations = [walk_public_template(doc, path, wildcard_limit, node_limit)
                            for doc in decoded_profiles]
            kinds_by_sample = [tuple(sorted({public_type(v) for v in nodes}))
                               for nodes, _ in observations]
            if not all(kinds_by_sample):
                count['not_observed_in_all_samples'] += 1
                continue
            kinds = tuple(sorted({kind for per_sample in kinds_by_sample for kind in per_sample}))
            sampled = any(flag for _,flag in observations)
            if sampled: count['sampled'] += 1
            canonical = canonical_public_template(path)
            if canonical in existing:
                count['already_registered'] += 1
            else:
                candidates.append({
                    'path': path, 'nativeMessage':class_name,
                    'protobufFieldNumber':tag, 'nativePropertyType':native_type,
                    'observedJsonKinds':list(kinds),
                    'allSamplesObserved':True, 'sampled':sampled,
                    'nestedDepth':depth, 'writable':False
                })
                existing.add(canonical)
            child, suffix = native_child(native_type)
            if child in native_messages and depth < max_depth:
                descendant = path + suffix
                if all(walk_public_template(doc,descendant,wildcard_limit,node_limit)[0]
                       for doc in decoded_profiles):
                    queue.append((child,descendant,depth+1))
            if len(candidates) > max_candidates:
                raise ValueError('DB05_DISCOVERY_CANDIDATE_LIMIT')
    candidates.sort(key=lambda x:x['path'])
    return {
        'schema':DISCOVERY_SCHEMA,
        'candidateCount':len(candidates),
        'nativeMessageClassesParsed':len(native_messages),
        'sampleCount':len(decoded_profiles),
        'diagnostics':dict(sorted(count.items())),
        'candidates':candidates,
        'security':{
            'sourceNamesOnly':True,'actualMapKeysExported':False,
            'privateSaveValuesExported':False,'noIdentifiersOrFileNames':True,
            'safeForPublicRepository':False,
            'ownerReviewRequiredBeforeRegistryPromotion':True,
            'platformOrVersionCompatibilityProved':False,
            'currentExecutableAttested':False,
            'codecRoundTripVerified':False,'writerAuthorized':False
        }
    }


def output_is_outside_git(destination):
    for parent in (destination.parent, *destination.parents):
        if (parent / '.git').exists():
            return False
    return True


def run(source, private_profiles, destination, registry_dir=None,
        max_depth=7, wildcard_limit=32, node_limit=1024):
    source, destination = Path(source).resolve(strict=True), Path(destination).resolve()
    private_profiles = [Path(item).resolve(strict=True) for item in private_profiles]
    if destination.exists() or not output_is_outside_git(destination):
        raise ValueError('DB05_PRIVATE_DISCOVERY_OUTPUT_MUST_BE_NEW_AND_OUTSIDE_GIT')
    if destination in private_profiles or destination == source:
        raise ValueError('DB05_PRIVATE_DISCOVERY_INPUT_OUTPUT_COLLISION')
    native = parse_native_messages(source)
    if registry_dir is None:
        registry_dir = Path(__file__).resolve().parents[2] / 'data/ddv/save'
    known = known_public_templates(registry_dir)
    documents = []
    try:
        for file in private_profiles:
            documents.append(json.loads(file.read_text(encoding='utf-8')))
        result = discover(native, documents, known_paths=known,
                          max_depth=max_depth,wildcard_limit=wildcard_limit,
                          node_limit=node_limit)
        result['source']={
            'kind':'il2cpp_native_metadata_only',
            'sha256':hash_file(source),
            'byteLength':source.stat().st_size,
            'sourceGameBuildNotInferredFromFilename':True
        }
        destination.write_text(json.dumps(result,ensure_ascii=True,sort_keys=True,indent=2)+'\n',
                               encoding='utf-8',newline='\n')
        return {'schema':DISCOVERY_SCHEMA,'candidateCount':result['candidateCount'],
                'sampledCandidateCount':sum(r['sampled'] for r in result['candidates']),
                'nativeMessageClassesParsed':len(native),
                'reviewRequired':True,'writerAuthorized':False}
    finally:
        documents.clear()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump',required=True,type=Path)
    parser.add_argument('--decoded-json',required=True,action='append',type=Path,
                        dest='profiles')
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--registry-dir',type=Path)
    parser.add_argument('--max-depth',type=int,default=7)
    parser.add_argument('--wildcard-limit',type=int,default=32)
    parser.add_argument('--node-limit',type=int,default=1024)
    args = parser.parse_args(argv)
    try:
        result = run(args.dump,args.profiles,args.out,args.registry_dir,
                     args.max_depth,args.wildcard_limit,args.node_limit)
    except (ValueError,OSError,UnicodeError,TypeError,json.JSONDecodeError):
        print('DB05_PRIVATE_DISCOVERY_FAILED')
        return 1
    print(json.dumps(result,ensure_ascii=True,sort_keys=True))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
