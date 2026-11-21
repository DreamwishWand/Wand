#!/usr/bin/env python3
"""SRC-06: offline, read-only DDV save structure witness, not a save codec."""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import re
import sys

CHUNK = 65536
MAX_DEPTH = 128
MAX_FIELDS = 50000
MAX_FILES = 150000
MAX_CS_BYTES = 16 * 1024 * 1024
KNOWN_KEYS = frozenset('''GameInfo Version Player World Inventory InventoryLists Backpack Storage Chest Chests
Collection Collections CollectedItems Collected ItemCollections OwnedItems Items Item ID Amount Marker
CompatibleItemType GridCollection Grids DiffGrids Objects Villages Areas GridIDs SceneItemId
FloatingIslands BuildingInfos PlayerHouses Floors Rooms FloorGridID WallGridIDs DecorationPresets
GridDataPath GridDefaultLayoutPath SubGrid DesignID State Rotation Position X Y Z
Clothes IncompatibleClothes Makeup MakeupItemID ClothingCustomization HairColorIndex
HairHighlightColor Female Male Avatar Appearance Skin Eyeball ColorIndex ColorIndex1
ColorIndex2 Furniture Crop Crops Quest Quests Friendship Progress Achievements
Duties Events RecurringEvents Realms SceneryPuzzles MissionItemID StepID SubStepID
AnswerGridIDs List PlacedItems PlacedObjects Quantity House Room Height Width
Offset Transform Layer Cells RemovedObjects AddedObjects ChangedObjects Size
Values Unlocks Rewards Tasks ActiveQuest Character FriendshipLevel
LastSaveDeviceInfo Timestamp Date LastModified Platform BuildID'''.split())
BLOCKED = re.compile(r'(?:account|email|mail|name|token|secret|password|auth|receipt|purchase|entitlement|moonstone|currency|wallet|user|profileid|deviceid|sessionid|identity|playerid|cloud|key|signature|license|dlc|personal|payment)', re.I)
DOMAIN = {"inventory": ("Inventory", "InventoryLists", "Backpack", "Amount", "Storage"),
          "chest": ("Chest", "Chests", "Storage"),
          "collection": ("Collection", "Collections", "CollectedItems", "Items"),
          "appearance": ("Avatar", "Appearance", "Clothes", "Makeup", "HairColorIndex"),
          "world": ("World", "Villages", "FloatingIslands", "Realms"),
          "placement": ("GridCollection", "Grids", "DiffGrids", "Objects", "SubGrid")}
COMPAT = [
    {"platform": "switch", "gameVersion": "1.25.0", "schema": 624, "buildKind": "SwitchBid", "buildId": "52BD625D9B4E0053", "evidence": "legacy Rust private Switch624 scope; not a general compatibility guarantee"},
    {"platform": "switch", "gameVersion": "1.25.3", "schema": 626, "buildKind": "SwitchBid", "buildId": "9A239D3DB569756D", "evidence": "legacy product_session.rs exact registry"},
    {"platform": "steam-windows", "gameVersion": "1.25.3", "schema": 626, "buildKind": "SteamFullVersion", "buildId": "releases_1.25-v1.25.3-44-g0b41250d9ac0-incremental-22", "evidence": "legacy product_session.rs exact registry"},
]
SOURCE = "https://github.com/DreamwishWand/web/tree/main/crates/ddv-save-core"


class StructureError(Exception):
    pass


class Stream:
    def __init__(self, path):
        self.file = path.open('rb')
        self.buf = b''
        self.pos = 0
        self.offset = 0

    def close(self):
        self.file.close()

    def peek(self):
        if self.pos == len(self.buf):
            self.buf = self.file.read(CHUNK)
            self.pos = 0
        return self.buf[self.pos] if self.pos < len(self.buf) else None

    def take(self):
        c = self.peek()
        if c is not None:
            self.pos += 1
            self.offset += 1
        return c

    def whitespace(self):
        while self.peek() in (9, 10, 13, 32):
            self.take()

    def expect(self, character):
        if self.take() != character:
            raise StructureError('invalid JSON token at byte offset ' + str(self.offset))

    def string(self, capture=False):
        self.expect(34)
        data = bytearray() if capture else None
        overflow = False
        while True:
            c = self.take()
            if c is None:
                raise StructureError('unterminated string')
            if c == 34:
                break
            if c < 32:
                raise StructureError('control character in string')
            token = [c]
            if c == 92:
                n = self.take()
                if n not in (34, 47, 92, 98, 102, 110, 114, 116, 117):
                    raise StructureError('invalid string escape')
                token.append(n)
                if n == 117:
                    for _ in range(4):
                        h = self.take()
                        if h is None or chr(h) not in '0123456789abcdefABCDEF':
                            raise StructureError('invalid unicode escape')
                        token.append(h)
            if data is not None:
                if len(data) + len(token) > 192:
                    overflow = True
                    data = None
                else:
                    data.extend(token)
        if not capture or overflow:
            return None
        try:
            return json.loads(('"' + data.decode('utf-8') + '"'))
        except (UnicodeError, ValueError) as exc:
            raise StructureError('invalid key encoding') from exc

    def literal(self, tail):
        for c in tail:
            self.expect(c)

    def number(self, capture=False):
        data = bytearray()
        def eat():
            c = self.take()
            if capture and len(data) < 24:
                data.append(c)
        if self.peek() == 45:
            eat()
        c = self.peek()
        if c == 48:
            eat()
            if self.peek() is not None and 48 <= self.peek() <= 57:
                raise StructureError('leading zero in number')
        elif c is not None and 49 <= c <= 57:
            while self.peek() is not None and 48 <= self.peek() <= 57:
                eat()
        else:
            raise StructureError('invalid number')
        if self.peek() == 46:
            eat()
            if self.peek() is None or not 48 <= self.peek() <= 57:
                raise StructureError('invalid fractional number')
            while self.peek() is not None and 48 <= self.peek() <= 57:
                eat()
        if self.peek() in (69, 101):
            eat()
            if self.peek() in (43, 45):
                eat()
            if self.peek() is None or not 48 <= self.peek() <= 57:
                raise StructureError('invalid exponent')
            while self.peek() is not None and 48 <= self.peek() <= 57:
                eat()
        return data.decode('ascii') if capture and len(data) <= 24 else None


class Witness:
    def __init__(self):
        self.fields = {}
        self.unknown = Counter()
        self.total_values = 0
        self.schema = None
        self.root_keys = set()

    def classify(self, key):
        if isinstance(key, str) and key.isascii() and key.isdecimal() and len(key) < 21:
            return '{id}', False
        if key in KNOWN_KEYS and not BLOCKED.search(key):
            return key, True
        return '{redacted}', False

    def record(self, path, kind):
        self.total_values += 1
        if self.total_values > 10000000:
            raise StructureError('maximum parsed value count exceeded')
        if path not in self.fields:
            if len(self.fields) >= MAX_FIELDS:
                raise StructureError('maximum distinct structural paths exceeded')
            self.fields[path] = {'types': set(), 'occurrences': 0}
        v = self.fields[path]
        v['types'].add(kind)
        v['occurrences'] += 1

    def walk(self, s, path='', depth=0):
        if depth >= MAX_DEPTH:
            raise StructureError('maximum nesting exceeded')
        s.whitespace()
        c = s.peek()
        kind = {123: 'object', 91: 'array', 34: 'string', 116: 'boolean',
                102: 'boolean', 110: 'null'}.get(c, 'number' if c in range(48, 58) or c == 45 else None)
        if kind is None:
            raise StructureError('unexpected value token')
        self.record(path or '/', kind)
        if kind == 'object':
            s.take()
            s.whitespace()
            if s.peek() == 125:
                s.take()
                return
            while True:
                if s.peek() != 34:
                    raise StructureError('object key required')
                key = s.string(capture=True)
                label, safe = self.classify(key)
                child = path + '/' + label
                if not safe:
                    self.unknown[path or '/'] += 1
                if path == '' and safe:
                    self.root_keys.add(key)
                s.whitespace()
                s.expect(58)
                self.walk(s, child, depth + 1)
                s.whitespace()
                sep = s.take()
                if sep == 125:
                    break
                if sep != 44:
                    raise StructureError('object delimiter required')
                s.whitespace()
            return
        if kind == 'array':
            s.take()
            s.whitespace()
            count = 0
            if s.peek() != 93:
                while True:
                    self.walk(s, path + '/[]', depth + 1)
                    count += 1
                    s.whitespace()
                    sep = s.take()
                    if sep == 93:
                        break
                    if sep != 44:
                        raise StructureError('array delimiter required')
                    s.whitespace()
            else:
                s.take()
            f = self.fields[path]
            f['max_array_length'] = max(f.get('max_array_length', 0), count)
            return
        if kind == 'string':
            s.string()
        elif kind == 'number':
            token = s.number(capture=path == '/GameInfo/Version')
            if path == '/GameInfo/Version':
                try:
                    self.schema = int(token) if token and token.isdecimal() else None
                except ValueError:
                    self.schema = None
        elif kind == 'boolean':
            s.literal(b'true' if c == 116 else b'false')
        else:
            s.literal(b'null')

    def inspect(self, path):
        s = Stream(path)
        try:
            self.walk(s)
            s.whitespace()
            if s.peek() is not None:
                raise StructureError('trailing bytes')
        finally:
            s.close()
        paths = sorted(self.fields)
        return {
            'status': 'lexical_structure_observed',
            'validationLimitations': ['not Rust strict_document validation', 'duplicate keys not validated',
                                     'string-value UTF-8 and Unicode scalar validity not validated',
                                     'references, ownership, codec, and Writer not validated'],
            'schemaObserved': self.schema,
            'rootRequiredFieldsPresent': all(x in self.root_keys for x in ('GameInfo', 'Player', 'World')),
            'fieldWitnesses': [{'path': p, 'types': sorted(self.fields[p]['types']),
                                'occurrences': self.fields[p]['occurrences'],
                                **({'maxArrayLength': self.fields[p]['max_array_length']}
                                   if 'max_array_length' in self.fields[p] else {})} for p in paths],
            'unknownFieldBuckets': [{'parentPath': k, 'occurrences': v} for k, v in sorted(self.unknown.items())],
            'domains': {k: {'candidateFieldsObserved': [p for p in paths if any('/' + n in p for n in names)][:100],
                            'complete': False} for k, names in DOMAIN.items()},
            'writerAuthorized': False,
        }


def static_scan(root):
    counts = Counter()
    file_count = 0
    candidates = []
    types = []
    type_rx = re.compile(r'^\s*(?:(?:public|private|protected|internal|abstract|sealed|partial|static)\s+)*(class|struct|enum)\s+([A-Za-z_]\w*)')
    field_rx = re.compile(r'^\s*(?:(?:public|private|protected|internal)\s+)(?:(?:static|readonly|const|volatile)\s+)*([\w.<>\[\],? ]{1,96})\s+([A-Za-z_]\w*)\s*(?:;|=)')
    relevant = re.compile(r'(?:save|profile|player|inventor|backpack|chest|storage|collect|appear|avatar|world|grid|place|quest|item|furniture)', re.I)
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not (Path(base) / d).is_symlink() and d not in ('.git', 'node_modules'))
        for name in sorted(files):
            p = Path(base) / name
            if p.is_symlink() or not p.is_file():
                continue
            file_count += 1
            if file_count > MAX_FILES:
                raise StructureError('too many static files')
            suffix = p.suffix.lower()
            counts[suffix or '(none)'] += 1
            lower = name.lower()
            if lower in ('global-metadata.dat', 'gameassembly.dll', 'unityplayer.dll', 'assembly-csharp.dll', 'dump.cs'):
                candidates.append({'basename': name, 'kind': 'unity-or-extracted-metadata',
                                   'evidence': 'filename_only', 'readableTypesProven': False})
            if lower not in ('dump.cs', 'types.cs') and suffix != '.cs':
                continue
            if p.stat().st_size > MAX_CS_BYTES or len(types) >= 500:
                continue
            with p.open('r', encoding='utf-8-sig', errors='replace') as f:
                lines = f.readlines()
            active = None
            for line in lines:
                found = type_rx.match(line)
                if found:
                    name_ = found.group(2)
                    active = None
                    if relevant.search(name_) and len(types) < 500:
                        active = {'name': name_, 'kind': found.group(1), 'fields': [],
                                  'evidence': 'candidate_extracted_csharp', 'saveFieldBindingVerified': False}
                        types.append(active)
                    continue
                if active is not None and len(active['fields']) < 64:
                    m = field_rx.match(line)
                    if m:
                        fieldname = m.group(2)
                        active['fields'].append({'name': fieldname if not BLOCKED.search(fieldname) else '{sensitive-field}',
                                                 'declaredType': m.group(1).strip() if not BLOCKED.search(fieldname) else '{withheld}'})
    return {'status': 'static_evidence_inventory', 'filesSeen': file_count,
            'extensionCounts': dict(sorted(counts.items())),
            'unityIndicators': candidates[:200], 'candidateTypes': types,
            'limitations': ['IL2CPP binaries are not decoded', 'C# regex extraction is non-authoritative',
                            'no field is proven to map to a save key without further evidence']}


def output_json(folder, name, value):
    with (folder / name).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
        f.write('\n')


def safe_folder(out, roots):
    out = out.expanduser().resolve()
    for root in roots:
        if root is not None and (out == root or root in out.parents):
            raise StructureError('output must be outside every input root')
    out.mkdir(parents=True, exist_ok=False)
    return out


def execute(argv=None):
    ap = argparse.ArgumentParser(description='Local-only structural witness. No save editing or decoding.')
    ap.add_argument('--game-root', type=Path, help='installed game files or extracted C# folder')
    ap.add_argument('--save', type=Path, help='optional original or externally decoded JSON save; read-only')
    ap.add_argument('--out', type=Path, required=True, help='fresh private output directory; must not exist')
    ap.add_argument('--platform', choices=['steam-windows', 'switch'], help='operator declaration, NOT verified')
    ap.add_argument('--build-id', help='operator declaration, NOT verified')
    args = ap.parse_args(argv)
    if args.game_root is None and args.save is None:
        ap.error('provide --game-root and/or --save')
    game = args.game_root.expanduser().resolve(strict=True) if args.game_root else None
    save = args.save.expanduser().resolve(strict=True) if args.save else None
    if game and not game.is_dir():
        ap.error('--game-root must be a directory')
    if save and not save.is_file():
        ap.error('--save must be a file')
    if game and save and (save == game or game in save.parents):
        ap.error('save must be separately selected outside the game root')
    roots = [game, save, save.parent if save else None]
    out = safe_folder(args.out, roots)
    report = {'tool': 'SRC-06', 'operation': 'read_only_structural_witness',
              'source': {'legacyCore': SOURCE}, 'operatorDeclarations':
                  {'platform': args.platform, 'buildId': args.build_id, 'verified': False},
              'inputPresent': {'game': game is not None, 'save': save is not None},
              'writerAuthorized': False, 'onlineRightsValidated': False}
    try:
        if game is not None:
            static = static_scan(game)
            output_json(out, 'static-types.json', static)
            report['staticStatus'] = static['status']
        if save is not None:
            with save.open('rb') as f:
                initial = f.read(64)
            if initial.lstrip().startswith((b'{', b'[')):
                try:
                    structure = Witness().inspect(save)
                    report['saveStatus'] = structure['status']
                    report['schemaObserved'] = structure['schemaObserved']
                except (StructureError, RecursionError, UnicodeError) as exc:
                    structure = {'status': 'json_structure_rejected', 'errorClass': type(exc).__name__,
                                 'rawContentExported': False, 'writerAuthorized': False}
                    report['saveStatus'] = structure['status']
            else:
                structure = {'status': 'unknown_or_encoded_container', 'rawContentExported': False,
                             'notes': 'No decryption, decompression, or platform inference performed.',
                             'writerAuthorized': False}
                report['saveStatus'] = structure['status']
            output_json(out, 'save-structure.json', structure)
        observed = report.get('schemaObserved')
        report['compatibility'] = [{**r, 'match': 'candidate_only' if observed == r['schema']
                      and args.platform == r['platform'] and args.build_id == r['buildId']
                      else 'not_assessed_or_mismatched'} for r in COMPAT]
        output_json(out, 'version-matrix.json', {'entries': report['compatibility'],
                  'assurance': 'historical_source_assertions_not_current_build_provenance'})
        fields = structure.get('fieldWitnesses', []) if save is not None else []
        output_json(out, 'rust-type-candidates.json', {'confidence': 'observed_json_kinds_only',
                  'requiresRustStrictValidation': True, 'writerAuthorized': False,
                  'fields': [{'path': x['path'], 'jsonKinds': x['types'], 'rustHint': 'serde_json::Value',
                              'source': 'local_save_lexical_witness'} for x in fields]})
        report['validation'] = {'status': 'REPORT_ONLY', 'originalModified': False,
                                'rustStrictValidationPerformed': False, 'writerVerified': False,
                                'sensitiveValuesExported': False}
        output_json(out, 'manifest.json', report)
        return out
    except BaseException:
        # An incomplete private directory is deliberately not presented as a valid report.
        try:
            (out / 'INCOMPLETE').write_text('Partial output. Do not consume as validated evidence.\n', encoding='utf-8')
        except OSError:
            pass
        raise


if __name__ == '__main__':
    try:
        result = execute()
        print('SRC06_REPORT_CREATED: ' + str(result))
    except (OSError, StructureError, ValueError) as exc:
        print('SRC06_FAILED: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(2)